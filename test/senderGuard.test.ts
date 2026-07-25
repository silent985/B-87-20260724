import { describe, expect, it } from 'vitest'
import { isTrustedSenderFrame } from '../electron/senderGuard'

describe('isTrustedSenderFrame (dev server)', () => {
  const appUrl = 'http://localhost:5173/'

  it('accepts IPC from our main window frame on the app origin', () => {
    expect(isTrustedSenderFrame(appUrl, true, 'http://localhost:5173/index.html')).toBe(true)
  })

  it('rejects IPC whose sender is not the main window webContents', () => {
    // e.g. a webview/other webContents — even with a plausible frame url.
    expect(isTrustedSenderFrame(appUrl, false, 'http://localhost:5173/')).toBe(false)
  })

  it('rejects IPC from a frame on a different origin (injected iframe)', () => {
    expect(isTrustedSenderFrame(appUrl, true, 'https://evil.example/')).toBe(false)
    expect(isTrustedSenderFrame(appUrl, true, 'http://localhost:9999/')).toBe(false)
  })

  it('rejects IPC when the sender frame has been destroyed (no url)', () => {
    expect(isTrustedSenderFrame(appUrl, true, null)).toBe(false)
    expect(isTrustedSenderFrame(appUrl, true, undefined)).toBe(false)
    expect(isTrustedSenderFrame(appUrl, true, '')).toBe(false)
  })
})

describe('isTrustedSenderFrame (packaged file://)', () => {
  const appUrl = 'file:///app/dist/index.html'

  it('accepts the packaged document frame', () => {
    expect(isTrustedSenderFrame(appUrl, true, 'file:///app/dist/index.html')).toBe(true)
  })

  it('rejects a different local file frame', () => {
    expect(isTrustedSenderFrame(appUrl, true, 'file:///etc/passwd')).toBe(false)
  })

  it('rejects a remote frame in packaged mode', () => {
    expect(isTrustedSenderFrame(appUrl, true, 'https://evil.example/')).toBe(false)
  })
})
