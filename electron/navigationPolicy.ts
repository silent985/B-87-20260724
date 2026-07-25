import { isInternalUrl, isTrustedExternalUrl } from './pathGuard'

/**
 * Pure decision logic for the window's navigation policy.
 *
 * Separating the *decision* (what should happen for a given URL) from the
 * *effect* (calling `event.preventDefault()` / `shell.openExternal`) lets us
 * unit-test the security-critical branching without an Electron window. The
 * main process maps these decisions onto the real Electron APIs.
 */

/**
 * What to do when the window attempts to navigate to `targetUrl`.
 *
 * - `allow`   — it is our own app document; let Electron navigate.
 * - `external`— a trusted http(s) link; block in-window and open in the browser.
 * - `block`   — anything else (file:, data:, javascript:, other origins); just
 *               block it and open nothing.
 */
export type NavigationDecision = 'allow' | 'external' | 'block'

export function decideNavigation(appUrl: string, targetUrl: string): NavigationDecision {
  if (isInternalUrl(appUrl, targetUrl)) {
    return 'allow'
  }
  if (isTrustedExternalUrl(targetUrl)) {
    return 'external'
  }
  return 'block'
}

/**
 * What to do when the app requests a new window (`window.open`, target=_blank).
 * We never spawn a second Electron window for arbitrary content, so the window
 * is always denied; the only question is whether to additionally open a trusted
 * link in the system browser.
 */
export interface WindowOpenDecision {
  /** Always false — new Electron windows are never allowed. */
  allowWindow: false
  /** True when the URL is a trusted http(s) link to open externally. */
  openExternal: boolean
}

export function decideWindowOpen(targetUrl: string): WindowOpenDecision {
  return { allowWindow: false, openExternal: isTrustedExternalUrl(targetUrl) }
}
