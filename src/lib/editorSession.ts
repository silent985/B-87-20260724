import type { DirListing } from '../types'
import { Mutex } from './mutex'

/**
 * The default name shown for a brand-new, never-saved document.
 */
export const DEFAULT_NEW_NAME = 'Untitled.md'

/** Extract the final path segment (works for both `/` and `\` separators). */
export function basenameOf(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || ''
}

/** Extract the directory portion of a path (everything up to the last separator). */
export function dirnameOf(filePath: string): string {
  return filePath.replace(/[/\\][^/\\]+$/, '')
}

/**
 * The subset of the preload API the editor needs. Declaring it structurally
 * (rather than importing `DesktopApi`) lets tests inject a fake, and
 * `window.api` satisfies it without any adapter.
 */
export interface EditorApi {
  listDir(dirPath?: string): Promise<DirListing>
  readFile(filePath: string): Promise<string>
  saveFile(filePath: string, content: string): Promise<{ path: string }>
  renameFile(filePath: string, nextName: string): Promise<{ path: string }>
  showSaveDialog(defaultName?: string): Promise<string | null>
}

/** Immutable snapshot of everything the UI renders. */
export interface EditorState {
  listing: DirListing | null
  currentFile: string | null
  /** The working text in the editor. */
  content: string
  /** The last-persisted text; `content !== savedContent` ⇒ dirty. */
  savedContent: string
  /** The name shown in the filename field. */
  fileName: string
}

/** UI-side collaborators the session drives without depending on any UI library. */
export interface EditorHandlers {
  /**
   * Ask the user to confirm discarding unsaved edits. Only ever called when the
   * document is actually dirty (the session short-circuits otherwise), so this
   * can be a plain "are you sure?" prompt. Resolve true to proceed.
   */
  confirmDiscard: () => Promise<boolean>
  notifyError: (message: string) => void
  notifySuccess: (message: string) => void
}

const INITIAL_STATE: EditorState = {
  listing: null,
  currentFile: null,
  content: '',
  savedContent: '',
  fileName: DEFAULT_NEW_NAME,
}

/**
 * Headless coordinator for the editor's file lifecycle.
 *
 * It owns all of the tricky concurrency:
 *
 * - **Switch guard.** Every file/directory switch bumps a monotonic token.
 *   Async results (a slow `readFile`, a `listDir`) are dropped if a newer
 *   switch has begun, so a late response can never overwrite a file the user
 *   has already moved past.
 * - **Mutation lock.** Saves and renames run through a {@link Mutex}, so an
 *   `onBlur`-triggered rename can never interleave with a save. Each critical
 *   section reads the *current* file path at execution time, so a save that
 *   runs after a rename targets the new path — never the stale one.
 * - **Stale-write protection.** After an awaited save/rename, UI state is only
 *   updated if no switch happened and the file is still the current one, so a
 *   background mutation cannot clobber the state of a different file the user
 *   has since opened.
 *
 * State is exposed through {@link subscribe}/{@link getState} so it can back a
 * React `useSyncExternalStore` without the component re-implementing any of the
 * above.
 */
export class EditorSession {
  private state: EditorState = INITIAL_STATE
  private readonly listeners = new Set<() => void>()
  private readonly mutex = new Mutex()
  /** Bumped on every switch; guards against out-of-order async completion. */
  private switchToken = 0
  private readonly api: EditorApi
  private handlers: EditorHandlers

  constructor(api: EditorApi, handlers: EditorHandlers) {
    this.api = api
    this.handlers = handlers
  }

  /**
   * Replace the UI-side handlers (e.g. when React re-renders with fresh antd
   * hook closures). The session instance itself stays stable across renders.
   */
  configure(handlers: EditorHandlers): void {
    this.handlers = handlers
  }

  // --- external store plumbing -------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getState = (): EditorState => this.state

  get dirty(): boolean {
    return this.state.content !== this.state.savedContent
  }

  private setState(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) {
      listener()
    }
  }

  // --- synchronous editing ------------------------------------------------

  /** Update the working text (typing in the editor). */
  setContent(content: string): void {
    this.setState({ content })
  }

  /** Update the filename field without touching disk (committed on rename). */
  setFileName(fileName: string): void {
    this.setState({ fileName })
  }

  // --- navigation ---------------------------------------------------------

  /**
   * Resolve whether it is safe to abandon the current document: instantly true
   * when clean, otherwise defers to the UI's confirm prompt. Centralising the
   * dirty check here keeps the handler a pure "ask the user" concern.
   */
  private async guardDiscard(): Promise<boolean> {
    if (!this.dirty) {
      return true
    }
    return this.handlers.confirmDiscard()
  }

  /** Load the initial (default) directory. No discard prompt on first load. */
  async init(): Promise<void> {
    const token = ++this.switchToken
    try {
      const listing = await this.api.listDir()
      if (token === this.switchToken) {
        this.setState({ listing })
      }
    } catch (error) {
      console.error('Failed to list directory', error)
      this.handlers.notifyError('无法打开该目录')
    }
  }

  /** Refresh the currently listed directory (used after mutations). */
  async refreshListing(): Promise<void> {
    const dir = this.state.listing?.path
    if (!dir) {
      return
    }
    try {
      const listing = await this.api.listDir(dir)
      this.setState({ listing })
    } catch (error) {
      // A refresh failure is non-fatal; keep the previous listing.
      console.error('Failed to refresh directory', error)
    }
  }

  /** Enter a directory, prompting first if there are unsaved edits. */
  async openDirectory(dirPath: string): Promise<void> {
    if (!(await this.guardDiscard())) {
      return
    }
    // A new switch cancels any in-flight file read as well.
    const token = ++this.switchToken
    try {
      const listing = await this.api.listDir(dirPath)
      if (token === this.switchToken) {
        this.setState({ listing })
      }
    } catch (error) {
      console.error('Failed to list directory', error)
      this.handlers.notifyError('无法打开该目录')
    }
  }

  /** Go to the parent directory when one is available. */
  async goUp(): Promise<void> {
    const parent = this.state.listing?.parent
    if (parent) {
      await this.openDirectory(parent)
    }
  }

  /** Open a file, prompting first if there are unsaved edits. */
  async openFile(filePath: string): Promise<void> {
    if (!(await this.guardDiscard())) {
      return
    }
    const token = ++this.switchToken
    let text: string
    try {
      text = await this.api.readFile(filePath)
    } catch (error) {
      console.error('Failed to load file', error)
      this.handlers.notifyError('无法读取该文件')
      return
    }
    // Drop the result if the user has since switched to something else.
    if (token !== this.switchToken) {
      return
    }
    this.setState({
      content: text,
      savedContent: text,
      currentFile: filePath,
      fileName: basenameOf(filePath) || DEFAULT_NEW_NAME,
    })
  }

  // --- mutations (serialised) --------------------------------------------

  /**
   * Save the current document. New documents prompt for a location first. Runs
   * exclusively so it cannot interleave with a rename, and skips UI updates if
   * the user switched files while the write was in flight.
   */
  async save(): Promise<void> {
    return this.mutex.runExclusive(async () => {
      const token = this.switchToken
      const fileAtStart = this.state.currentFile
      const contentToSave = this.state.content

      try {
        if (fileAtStart) {
          await this.api.saveFile(fileAtStart, contentToSave)
          // Only mark clean if we're still on the same file (no switch/rename
          // moved us) so we don't wrongly clear another file's dirty flag.
          if (token === this.switchToken && this.state.currentFile === fileAtStart) {
            this.setState({ savedContent: contentToSave })
          }
          this.handlers.notifySuccess('已保存')
          return
        }

        // New document: choose a location, write, THEN refresh the listing so
        // the freshly created file is guaranteed to be shown.
        const target = await this.api.showSaveDialog(this.state.fileName)
        if (!target) {
          return
        }
        const result = await this.api.saveFile(target, contentToSave)
        // If a switch happened while the dialog/write was pending, the file was
        // still created on disk, but do not hijack the now-current view.
        if (token === this.switchToken && this.state.currentFile === fileAtStart) {
          this.setState({
            currentFile: result.path,
            savedContent: contentToSave,
            fileName: basenameOf(result.path) || this.state.fileName,
          })
          await this.openDirectorySilently(dirnameOf(result.path))
        }
        this.handlers.notifySuccess('已保存')
      } catch (error) {
        console.error('Failed to save file', error)
        this.handlers.notifyError('保存失败')
      }
    })
  }

  /**
   * Commit the filename field as an on-disk rename. Runs exclusively (serialised
   * with {@link save}). For an unsaved document it just records the default name
   * for the next save. If the user switches files while the rename is in flight,
   * the file is still renamed on disk but the editor's pointer/name are not
   * overwritten.
   */
  async rename(nextName: string): Promise<void> {
    return this.mutex.runExclusive(async () => {
      const trimmed = nextName.trim()
      const fileAtStart = this.state.currentFile

      if (!fileAtStart) {
        this.setState({ fileName: trimmed || DEFAULT_NEW_NAME })
        return
      }

      const original = basenameOf(fileAtStart)
      if (!trimmed || trimmed === original) {
        // Nothing to do; snap the field back to the real name.
        this.setState({ fileName: original })
        return
      }

      const token = this.switchToken
      try {
        const result = await this.api.renameFile(fileAtStart, trimmed)
        // Apply UI state only if we are still editing the same file.
        if (token !== this.switchToken || this.state.currentFile !== fileAtStart) {
          return
        }
        this.setState({
          currentFile: result.path,
          fileName: basenameOf(result.path) || trimmed,
        })
        await this.refreshListing()
        this.handlers.notifySuccess('已重命名')
      } catch (error) {
        console.error('Failed to rename file', error)
        this.handlers.notifyError('重命名失败')
        // Restore the field to the real (unchanged) name.
        if (this.state.currentFile === fileAtStart) {
          this.setState({ fileName: original })
        }
      }
    })
  }

  /** List a directory without a discard prompt or switch bump (post-save use). */
  private async openDirectorySilently(dirPath: string): Promise<void> {
    try {
      const listing = await this.api.listDir(dirPath)
      this.setState({ listing })
    } catch (error) {
      console.error('Failed to list directory', error)
    }
  }
}
