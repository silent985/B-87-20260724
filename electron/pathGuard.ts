import path from 'node:path'

/**
 * Security helpers shared by the main process.
 *
 * These functions are intentionally pure (no Electron / fs dependencies) so
 * that the file-access sandbox and navigation policy can be unit tested in
 * isolation. The main process is the only trusted place that decides which
 * directories the renderer may touch, so every IPC handler funnels through
 * {@link isPathWithinRoot} before hitting the filesystem.
 */

/**
 * Returns true when `target` resolves to `root` itself or a descendant of it.
 *
 * Both paths are normalised with {@link path.resolve} first so that `..`
 * segments, mixed separators and relative inputs cannot be used to escape the
 * sandbox (e.g. `root/../../etc/passwd`).
 */
export function isPathWithinRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)

  if (resolvedTarget === resolvedRoot) {
    return true
  }

  const relative = path.relative(resolvedRoot, resolvedTarget)
  // A path is contained when the relative walk from root does not start by
  // stepping outside of it and is not re-anchored to another absolute root.
  return (
    relative.length > 0 &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative)
  )
}

/** Returns true when `target` is contained by at least one allowed root. */
export function isPathWithinAnyRoot(roots: readonly string[], target: string): boolean {
  return roots.some((root) => isPathWithinRoot(root, target))
}

/**
 * A file name is safe when it is a single path segment (no separators, no `..`)
 * so that a rename can never move a file outside of its directory.
 */
export function isSafeFileName(name: string): boolean {
  if (name.length === 0) {
    return false
  }
  if (name === '.' || name === '..') {
    return false
  }
  // `basename` strips any directory component; if it differs the name carried
  // separators (or a trailing slash) and must be rejected.
  return path.basename(name) === name
}

/**
 * Only `http(s)` links are considered safe to hand off to the system browser.
 * Everything else (`file:`, `javascript:`, `data:`, ...) is rejected so a
 * remote page cannot smuggle a local-resource or script URL through
 * `shell.openExternal`.
 */
export function isTrustedExternalUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return parsed.protocol === 'https:' || parsed.protocol === 'http:'
}

/**
 * Determines whether a navigation target is our own application document.
 *
 * `appUrl` is the URL the window was originally loaded with (the Vite dev
 * server in development, or the packaged `file://.../index.html` in
 * production). Any navigation that is not same-origin is blocked.
 */
export function isInternalUrl(appUrl: string, target: string): boolean {
  let base: URL
  let candidate: URL
  try {
    base = new URL(appUrl)
    candidate = new URL(target)
  } catch {
    return false
  }

  if (base.protocol === 'file:') {
    // Packaged app: allow reloading the same local document only.
    return candidate.protocol === 'file:' && candidate.pathname === base.pathname
  }

  // Dev server: same origin (scheme + host + port) is our app.
  return candidate.origin === base.origin
}
