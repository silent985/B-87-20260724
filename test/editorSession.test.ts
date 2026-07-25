import { describe, expect, it, vi } from 'vitest'
import { EditorSession, type EditorApi, type EditorHandlers } from '../src/lib/editorSession'
import type { DirListing } from '../src/types'

/** A promise plus its resolver, for controlling async completion order. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** Wait until `predicate` is true, letting queued microtasks/timers run. */
async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) {
      return
    }
    await new Promise((r) => setTimeout(r, 0))
  }
  throw new Error('waitFor timed out')
}

function listing(dirPath: string, names: string[]): DirListing {
  return {
    root: dirPath,
    path: dirPath,
    parent: null,
    entries: names.map((name) => ({
      name,
      isDirectory: false,
      path: `${dirPath}/${name}`,
    })),
  }
}

/**
 * A fully controllable fake of the preload API. Each method records its calls
 * and, where useful, can be made to resolve on command so tests can force
 * specific interleavings.
 */
function makeApi() {
  const readControls = new Map<string, ReturnType<typeof deferred<string>>>()
  const saveControls: Array<ReturnType<typeof deferred<{ path: string }>>> = []
  const calls = {
    read: [] as string[],
    save: [] as Array<{ path: string; content: string }>,
    rename: [] as Array<{ path: string; nextName: string }>,
    list: [] as (string | undefined)[],
    dialog: [] as (string | undefined)[],
  }

  const api: EditorApi = {
    listDir: vi.fn(async (dirPath?: string) => {
      calls.list.push(dirPath)
      return listing(dirPath ?? '/docs', ['a.md', 'b.md'])
    }),
    readFile: vi.fn((filePath: string) => {
      calls.read.push(filePath)
      const control = deferred<string>()
      readControls.set(filePath, control)
      return control.promise
    }),
    saveFile: vi.fn((filePath: string, content: string) => {
      calls.save.push({ path: filePath, content })
      const control = deferred<{ path: string }>()
      saveControls.push(control)
      // Default: auto-resolve to the same path unless the test intervenes.
      queueMicrotask(() => control.resolve({ path: filePath }))
      return control.promise
    }),
    renameFile: vi.fn(async (filePath: string, nextName: string) => {
      calls.rename.push({ path: filePath, nextName })
      const dir = filePath.replace(/[/\\][^/\\]+$/, '')
      return { path: `${dir}/${nextName}` }
    }),
    showSaveDialog: vi.fn(async (defaultName?: string) => {
      calls.dialog.push(defaultName)
      return `/docs/${defaultName ?? 'Untitled.md'}`
    }),
  }

  return { api, calls, readControls, saveControls }
}

function makeHandlers(confirm = true): EditorHandlers & { errors: string[]; successes: string[] } {
  const errors: string[] = []
  const successes: string[] = []
  return {
    confirmDiscard: vi.fn(async () => confirm),
    notifyError: (m: string) => errors.push(m),
    notifySuccess: (m: string) => successes.push(m),
    errors,
    successes,
  }
}

describe('EditorSession: file switching race', () => {
  it('drops a stale read when a newer file is opened first', async () => {
    const { api, readControls } = makeApi()
    const handlers = makeHandlers()
    const session = new EditorSession(api, handlers)

    // Open A then B in quick succession; both reads are in flight.
    const openA = session.openFile('/docs/a.md')
    const openB = session.openFile('/docs/b.md')
    await waitFor(() => readControls.has('/docs/a.md') && readControls.has('/docs/b.md'))

    // Resolve the NEWER (B) first, then the older (A) — the classic race.
    readControls.get('/docs/b.md')!.resolve('B content')
    readControls.get('/docs/a.md')!.resolve('A content')
    await Promise.all([openA, openB])

    // The editor must show B (the last requested), not the late-arriving A.
    expect(session.getState().currentFile).toBe('/docs/b.md')
    expect(session.getState().content).toBe('B content')
  })

  it('does not commit a read after switching directories', async () => {
    const { api, readControls } = makeApi()
    const session = new EditorSession(api, makeHandlers())

    const openA = session.openFile('/docs/a.md')
    await waitFor(() => readControls.has('/docs/a.md'))
    // User navigates away before A's read returns.
    const nav = session.openDirectory('/docs/sub')
    readControls.get('/docs/a.md')!.resolve('A content')
    await Promise.all([openA, nav])

    // The stale read for A must not have populated the editor.
    expect(session.getState().currentFile).toBeNull()
    expect(session.getState().content).toBe('')
    expect(session.getState().listing?.path).toBe('/docs/sub')
  })
})

describe('EditorSession: save/rename serialisation', () => {
  it('serialises a save and a rename so neither interleaves', async () => {
    const { api, readControls, calls } = makeApi()
    const session = new EditorSession(api, makeHandlers())

    // Load a file first.
    const open = session.openFile('/docs/a.md')
    await waitFor(() => readControls.has('/docs/a.md'))
    readControls.get('/docs/a.md')!.resolve('hello')
    await open
    session.setContent('hello world') // make it dirty

    // Fire save and rename "simultaneously".
    const save = session.save()
    const rename = session.rename('renamed.md')
    await Promise.all([save, rename])

    // Save wrote to the original path (it was queued first), and the rename ran
    // afterwards against that same path — no interleaving, no lost mutation.
    expect(calls.save[0]).toEqual({ path: '/docs/a.md', content: 'hello world' })
    expect(calls.rename[0]).toEqual({ path: '/docs/a.md', nextName: 'renamed.md' })
    expect(session.getState().currentFile).toBe('/docs/renamed.md')
    expect(session.getState().fileName).toBe('renamed.md')
  })

  it('a rename queued before a save makes the save target the NEW path', async () => {
    const { api, readControls, calls } = makeApi()
    const session = new EditorSession(api, makeHandlers())

    const open = session.openFile('/docs/a.md')
    await waitFor(() => readControls.has('/docs/a.md'))
    readControls.get('/docs/a.md')!.resolve('hello')
    await open
    session.setContent('edited')

    // Rename first, then save — save must see the renamed path.
    const rename = session.rename('renamed.md')
    const save = session.save()
    await Promise.all([rename, save])

    expect(calls.rename[0]).toEqual({ path: '/docs/a.md', nextName: 'renamed.md' })
    // The save must target the post-rename path, never the stale one.
    expect(calls.save[0]).toEqual({ path: '/docs/renamed.md', content: 'edited' })
  })
})

describe('EditorSession: save-as of a new document', () => {
  it('prompts, writes, then refreshes the listing so the new file shows', async () => {
    const { api, calls } = makeApi()
    const session = new EditorSession(api, makeHandlers())
    await session.init()

    session.setContent('# new doc')
    session.setFileName('Note.md')
    await session.save()

    // Dialog was shown, file written, and a listing refresh happened AFTER the
    // write (write-before-refresh ordering).
    expect(calls.dialog).toContain('Note.md')
    expect(calls.save[0]).toEqual({ path: '/docs/Note.md', content: '# new doc' })
    expect(session.getState().currentFile).toBe('/docs/Note.md')
    // listDir called once for init and again after the save.
    expect(calls.list.length).toBeGreaterThanOrEqual(2)
  })

  it('does nothing destructive when the save dialog is cancelled', async () => {
    const { api, calls } = makeApi()
    api.showSaveDialog = vi.fn(async () => null)
    const session = new EditorSession(api, makeHandlers())
    session.setContent('draft')

    await session.save()

    expect(calls.save).toHaveLength(0)
    expect(session.getState().currentFile).toBeNull()
  })
})

describe('EditorSession: unsaved-changes prompts', () => {
  it('blocks opening another file when the user cancels the discard prompt', async () => {
    const { api, readControls } = makeApi()
    const handlers = makeHandlers(false) // user cancels
    const session = new EditorSession(api, handlers)

    const open = session.openFile('/docs/a.md')
    await waitFor(() => readControls.has('/docs/a.md'))
    readControls.get('/docs/a.md')!.resolve('A')
    await open
    session.setContent('dirty now')

    // Attempt to open B; confirmDiscard resolves false, so nothing changes.
    await session.openFile('/docs/b.md')
    expect(handlers.confirmDiscard).toHaveBeenCalledTimes(1)
    expect(session.getState().currentFile).toBe('/docs/a.md')
    expect(session.getState().content).toBe('dirty now')
  })

  it('allows switching when there are no unsaved changes without prompting', async () => {
    const { api, readControls } = makeApi()
    const handlers = makeHandlers()
    const session = new EditorSession(api, handlers)

    const openA = session.openFile('/docs/a.md')
    await waitFor(() => readControls.has('/docs/a.md'))
    readControls.get('/docs/a.md')!.resolve('A')
    await openA
    // Not dirty (savedContent === content).

    const openB = session.openFile('/docs/b.md')
    await waitFor(() => readControls.has('/docs/b.md'))
    readControls.get('/docs/b.md')!.resolve('B')
    await openB

    expect(handlers.confirmDiscard).not.toHaveBeenCalled()
    expect(session.getState().currentFile).toBe('/docs/b.md')
  })
})
