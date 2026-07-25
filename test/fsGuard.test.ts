import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  canonicalizeRoots,
  isRealPathWithinRoots,
  resolveExistingWithinRoots,
  resolveNewPathWithinRoots,
  type RealpathFn,
} from '../electron/fsGuard'

/**
 * Deterministic tests using an injected realpath. This models the essential
 * threat: a path that is *lexically* inside a root but whose real (symlink/
 * junction-resolved) location is outside it.
 */
describe('fsGuard with injected realpath (symlink escape modelling)', () => {
  const root = path.resolve('/home/user/Documents')
  const outside = path.resolve('/etc/secret')

  // "<root>/escape" is a symlink whose real target is "<outside>".
  const linkInsideRoot = path.join(root, 'escape')
  const fileThroughLink = path.join(linkInsideRoot, 'passwd')

  const fakeRealpath: RealpathFn = async (target) => {
    const resolved = path.resolve(target)
    // The link and anything under it resolves to the outside location.
    if (resolved === linkInsideRoot) {
      return outside
    }
    if (resolved.startsWith(linkInsideRoot + path.sep)) {
      return path.join(outside, path.relative(linkInsideRoot, resolved))
    }
    // Everything else is already canonical.
    return resolved
  }

  it('canonicalizes roots via realpath', async () => {
    const roots = await canonicalizeRoots([root], fakeRealpath)
    expect(roots).toEqual([root])
  })

  it('rejects an existing file reached through a symlink that escapes the root', async () => {
    await expect(
      resolveExistingWithinRoots([root], fileThroughLink, fakeRealpath),
    ).rejects.toThrow(/Access denied/)
  })

  it('rejects the escaping symlink directory itself', async () => {
    await expect(
      resolveExistingWithinRoots([root], linkInsideRoot, fakeRealpath),
    ).rejects.toThrow(/Access denied/)
  })

  it('accepts a genuine file inside the root', async () => {
    const realFile = path.join(root, 'notes.md')
    await expect(resolveExistingWithinRoots([root], realFile, fakeRealpath)).resolves.toBe(
      realFile,
    )
  })

  it('rejects a NEW file whose real parent directory is outside the root', async () => {
    // Writing "<root>/escape/new.md" must be refused because the real parent is
    // "<outside>".
    await expect(
      resolveNewPathWithinRoots([root], path.join(linkInsideRoot, 'new.md'), fakeRealpath),
    ).rejects.toThrow(/Access denied/)
  })

  it('accepts a NEW file whose real parent is inside the root and writes through the canonical parent', async () => {
    const result = await resolveNewPathWithinRoots(
      [root],
      path.join(root, 'fresh.md'),
      fakeRealpath,
    )
    expect(result).toBe(path.join(root, 'fresh.md'))
  })

  it('rejects a NEW file whose basename is an unsafe segment before touching the filesystem', async () => {
    // A target ending in ".." has an unsafe basename; it must be rejected by the
    // name check rather than being resolved against the filesystem.
    await expect(
      resolveNewPathWithinRoots([root], path.join(root, 'sub') + path.sep + '..', fakeRealpath),
    ).rejects.toThrow(/Invalid file name/)
  })

  it('isRealPathWithinRoots is false for an escaping symlink and true for a real child', async () => {
    expect(await isRealPathWithinRoots([root], fileThroughLink, fakeRealpath)).toBe(false)
    expect(await isRealPathWithinRoots([root], path.join(root, 'a.md'), fakeRealpath)).toBe(true)
  })

  it('treats a missing path as not-within (no throw)', async () => {
    const missing: RealpathFn = async () => {
      throw new Error('ENOENT')
    }
    expect(await isRealPathWithinRoots([root], path.join(root, 'x'), missing)).toBe(false)
  })
})

/**
 * Real-filesystem test using a directory junction, which Windows allows to be
 * created without elevation. This exercises the actual `fs.realpath` path and
 * proves the guard blocks a concrete on-disk escape.
 */
describe('fsGuard with a real directory junction', () => {
  let base: string
  let allowed: string
  let secret: string
  let junction: string
  let junctionCreated = false

  beforeAll(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'fsguard-'))
    allowed = path.join(base, 'allowed')
    secret = path.join(base, 'secret')
    fs.mkdirSync(allowed)
    fs.mkdirSync(secret)
    fs.writeFileSync(path.join(secret, 'passwd.md'), 'top secret', 'utf-8')
    junction = path.join(allowed, 'link')
    try {
      // 'junction' works for directories on Windows without admin rights.
      fs.symlinkSync(secret, junction, 'junction')
      junctionCreated = true
    } catch {
      // Fall back to a normal symlink (POSIX / privileged Windows).
      try {
        fs.symlinkSync(secret, junction, 'dir')
        junctionCreated = true
      } catch {
        junctionCreated = false
      }
    }
  })

  afterAll(() => {
    fs.rmSync(base, { recursive: true, force: true })
  })

  it('blocks reading a file through a junction that escapes the allowed root', async () => {
    if (!junctionCreated) {
      // Environment cannot create links; nothing to assert.
      return
    }
    const escaping = path.join(junction, 'passwd.md')
    // Sanity: the file really is reachable via the junction on disk.
    expect(fs.readFileSync(escaping, 'utf-8')).toBe('top secret')
    // But the guard must reject it because its realpath is outside `allowed`.
    await expect(resolveExistingWithinRoots([allowed], escaping)).rejects.toThrow(/Access denied/)
  })

  it('blocks creating a new file through a junction that escapes the allowed root', async () => {
    if (!junctionCreated) {
      return
    }
    await expect(
      resolveNewPathWithinRoots([allowed], path.join(junction, 'new.md')),
    ).rejects.toThrow(/Access denied/)
  })

  it('allows a genuine file directly inside the allowed root', async () => {
    const real = path.join(allowed, 'ok.md')
    fs.writeFileSync(real, 'hi', 'utf-8')
    await expect(resolveExistingWithinRoots([allowed], real)).resolves.toBe(fs.realpathSync(real))
  })
})
