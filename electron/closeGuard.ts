/**
 * Tracks whether it is currently safe to let a window close.
 *
 * The close flow is a two-step handshake: when the user tries to close the
 * window we prevent the default and ask the renderer whether there are unsaved
 * changes; the renderer answers, and only an affirmative answer flips the guard
 * open so the subsequent `close()` call is allowed through.
 *
 * This is a tiny class rather than a bare boolean specifically so it can be
 * {@link reset}. On macOS the app keeps running after all windows close and a
 * *new* window is created on `activate`; if the permit state leaked across
 * windows, a window that had been force-closed once would thereafter close
 * without ever prompting. Each `createWindow` gets a freshly reset guard.
 */
export class CloseGuard {
  private permitted = false

  /** Whether a pending `close` should be allowed to proceed. */
  get canClose(): boolean {
    return this.permitted
  }

  /** Record that the renderer authorised closing (no/for-discarded changes). */
  permit(): void {
    this.permitted = true
  }

  /**
   * Return the guard to its initial "must prompt" state. Called when a new
   * window is created so a re-opened window always re-checks for unsaved work.
   */
  reset(): void {
    this.permitted = false
  }
}
