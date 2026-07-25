import fs from 'node:fs'
import path from 'node:path'
import { isPathWithinAnyRoot, isSafeFileName } from './pathGuard'

/**
 * Filesystem sandbox enforcement based on **canonical (realpath) resolution**.
 *
 * `pathGuard.isPathWithinRoot` only performs a lexical check. That is not enough
 * on its own: a symlink or Windows junction living *inside* an allowed root can
 * point *outside* it, so a purely textual path can stay "within" the root while
 * the bytes it reads/writes land anywhere on disk. Every filesystem operation
 * therefore resolves the real, symlink-free path first (via {@link fs.realpath})
 * and only then checks containment.
 *
 * The `realpath` implementation is injectable so the containment logic can be
 * unit-tested deterministically without creating real links, while production
 * code uses the real {@link fs.promises.realpath}.
 */

export type RealpathFn = (target: string) => Promise<string>

const defaultRealpath: RealpathFn = (target) => fs.promises.realpath(target)

/**
 * Resolve each allowed root to its canonical form, skipping roots that do not
 * exist. Roots themselves may be symlinks, so they must be canonicalised too or
 * a canonical target would never compare equal to a non-canonical root.
 */
export async function canonicalizeRoots(
  roots: readonly string[],
  realpath: RealpathFn = defaultRealpath,
): Promise<string[]> {
  const resolved: string[] = []
  for (const root of roots) {
    try {
      resolved.push(await realpath(root))
    } catch {
      // A configured root that is missing simply grants no access.
    }
  }
  return resolved
}

/**
 * Resolve an **existing** path (file or directory) to its canonical location
 * and assert it is contained by one of the allowed roots. Following symlinks
 * before the containment check is what blocks junction/symlink escapes.
 *
 * Throws if the path does not exist or resolves outside every allowed root.
 */
export async function resolveExistingWithinRoots(
  roots: readonly string[],
  target: string,
  realpath: RealpathFn = defaultRealpath,
): Promise<string> {
  const realTarget = await realpath(target)
  const realRoots = await canonicalizeRoots(roots, realpath)
  if (!isPathWithinAnyRoot(realRoots, realTarget)) {
    throw new Error('Access denied: path is outside the allowed directories')
  }
  return realTarget
}

/**
 * Resolve a target path for a **new** file (which does not exist yet).
 *
 * The file itself cannot be `realpath`'d, so instead we canonicalise its
 * **parent directory** — which resolves any symlink/junction in the path — and
 * require that the *real* parent is inside an allowed root. The returned path is
 * `realParent + basename`, so callers always write through the canonical parent
 * rather than a symlinked alias that might escape the sandbox.
 *
 * Throws if the file name is unsafe, the parent is missing, or the real parent
 * lies outside every allowed root.
 */
export async function resolveNewPathWithinRoots(
  roots: readonly string[],
  target: string,
  realpath: RealpathFn = defaultRealpath,
): Promise<string> {
  const name = path.basename(target)
  if (!isSafeFileName(name)) {
    throw new Error('Invalid file name')
  }
  const parent = path.dirname(path.resolve(target))
  const realParent = await realpath(parent)
  const realRoots = await canonicalizeRoots(roots, realpath)
  if (!isPathWithinAnyRoot(realRoots, realParent)) {
    throw new Error('Access denied: path is outside the allowed directories')
  }
  return path.join(realParent, name)
}

/**
 * True when `target`'s canonical form is contained by the canonicalised roots.
 * A convenience predicate used where a boolean (rather than a throw) is wanted,
 * e.g. deciding whether to expose a parent-directory affordance. Missing paths
 * resolve to `false`.
 */
export async function isRealPathWithinRoots(
  roots: readonly string[],
  target: string,
  realpath: RealpathFn = defaultRealpath,
): Promise<boolean> {
  try {
    const realTarget = await realpath(target)
    const realRoots = await canonicalizeRoots(roots, realpath)
    return isPathWithinAnyRoot(realRoots, realTarget)
  } catch {
    return false
  }
}
