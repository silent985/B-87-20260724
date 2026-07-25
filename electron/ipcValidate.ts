/**
 * Pure runtime validators for IPC arguments.
 *
 * Values arriving over IPC are fully untrusted and typed as `unknown` — the
 * renderer (or an attacker who reached it) can send anything. These guards are
 * kept free of any Electron dependency so the main process's argument-validation
 * behaviour can be unit tested directly.
 */

/** Narrows `value` to `string`, throwing a labelled error otherwise. */
export function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid argument: ${label} must be a string`)
  }
  return value
}

/**
 * Narrows `value` to a non-empty `string`. Used for arguments (like a file
 * path) where an empty string is never legitimate.
 */
export function assertNonEmptyString(value: unknown, label: string): string {
  const str = assertString(value, label)
  if (str.length === 0) {
    throw new Error(`Invalid argument: ${label} must not be empty`)
  }
  return str
}

/** Narrows `value` to `boolean`, throwing a labelled error otherwise. */
export function assertBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid argument: ${label} must be a boolean`)
  }
  return value
}

/**
 * Narrows an optional string argument: accepts `undefined`/`null` (returned as
 * `undefined`) or a genuine string; rejects any other type.
 */
export function assertOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  return assertString(value, label)
}
