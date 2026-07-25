import { describe, expect, it } from 'vitest'
import { CloseGuard } from '../electron/closeGuard'

describe('CloseGuard', () => {
  it('starts in the must-prompt state', () => {
    const guard = new CloseGuard()
    expect(guard.canClose).toBe(false)
  })

  it('permits closing after the renderer authorises it', () => {
    const guard = new CloseGuard()
    guard.permit()
    expect(guard.canClose).toBe(true)
  })

  it('reset() returns to must-prompt (macOS re-open scenario)', () => {
    const guard = new CloseGuard()
    // First window: user chose to discard and close.
    guard.permit()
    expect(guard.canClose).toBe(true)
    // A new window is created on macOS `activate` — it must prompt again.
    guard.reset()
    expect(guard.canClose).toBe(false)
  })
})

/**
 * Models the full close handshake between main and renderer, using the same
 * CloseGuard the main process uses. This documents the protocol:
 *  - close attempt while guard is closed => prevented + renderer notified;
 *  - renderer replies "discard" => guard permitted => second close proceeds;
 *  - renderer replies "cancel"  => guard stays closed => window stays open.
 */
describe('close protocol simulation', () => {
  interface FakeWindow {
    closed: boolean
    prompts: number
  }

  function makeHarness(rendererDirty: boolean, userChoosesDiscard: boolean) {
    const guard = new CloseGuard()
    const win: FakeWindow = { closed: false, prompts: 0 }

    // Renderer's onBeforeClose logic.
    const rendererDecide = (): boolean => {
      if (!rendererDirty) {
        return true // respondClose(true) immediately
      }
      return userChoosesDiscard
    }

    // main: window 'close' handler.
    const attemptClose = () => {
      if (guard.canClose) {
        win.closed = true
        return
      }
      // preventDefault + notify renderer
      win.prompts++
      const shouldClose = rendererDecide()
      // main: respondClose handler
      if (shouldClose) {
        guard.permit()
        attemptClose() // main calls win.close() again
      }
    }

    return { guard, win, attemptClose }
  }

  it('closes immediately when there are no unsaved changes', () => {
    const { win, attemptClose } = makeHarness(false, false)
    attemptClose()
    expect(win.prompts).toBe(1)
    expect(win.closed).toBe(true)
  })

  it('closes after the user chooses to discard unsaved changes', () => {
    const { win, attemptClose } = makeHarness(true, true)
    attemptClose()
    expect(win.prompts).toBe(1)
    expect(win.closed).toBe(true)
  })

  it('stays open when the user cancels the close', () => {
    const { win, attemptClose } = makeHarness(true, false)
    attemptClose()
    expect(win.prompts).toBe(1)
    expect(win.closed).toBe(false)
  })

  it('prompts again on a fresh window after a prior forced close (reset)', () => {
    const { guard, win, attemptClose } = makeHarness(true, true)
    attemptClose()
    expect(win.closed).toBe(true)
    // Simulate a new window: reset guard, window not closed.
    guard.reset()
    win.closed = false
    win.prompts = 0
    // A new close attempt must prompt again rather than close silently.
    if (guard.canClose) {
      win.closed = true
    } else {
      win.prompts++
    }
    expect(win.prompts).toBe(1)
    expect(win.closed).toBe(false)
  })
})
