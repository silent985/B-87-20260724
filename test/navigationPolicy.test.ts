import { describe, expect, it } from 'vitest'
import { decideNavigation, decideWindowOpen } from '../electron/navigationPolicy'

describe('decideNavigation (dev server)', () => {
  const appUrl = 'http://localhost:5173/'

  it('allows navigation to our own app document', () => {
    expect(decideNavigation(appUrl, 'http://localhost:5173/index.html')).toBe('allow')
    expect(decideNavigation(appUrl, 'http://localhost:5173/#/route')).toBe('allow')
  })

  it('routes a trusted external http(s) link to the browser', () => {
    expect(decideNavigation(appUrl, 'https://example.com/docs')).toBe('external')
    expect(decideNavigation(appUrl, 'http://another.example')).toBe('external')
  })

  it('does not treat a different app origin as internal', () => {
    // A different port is a different origin, so it is not our app document.
    // It is still an http(s) URL, so it is handled as an external link (opened
    // in the browser) rather than navigated to in-window.
    expect(decideNavigation(appUrl, 'http://localhost:9999/')).toBe('external')
  })

  it('blocks dangerous schemes without opening them', () => {
    expect(decideNavigation(appUrl, 'file:///etc/passwd')).toBe('block')
    expect(decideNavigation(appUrl, 'javascript:alert(1)')).toBe('block')
    expect(decideNavigation(appUrl, 'data:text/html,<script>1</script>')).toBe('block')
    expect(decideNavigation(appUrl, 'not a url')).toBe('block')
  })
})

describe('decideNavigation (packaged file://)', () => {
  const appUrl = 'file:///app/dist/index.html'

  it('allows reloading the same packaged document', () => {
    expect(decideNavigation(appUrl, 'file:///app/dist/index.html')).toBe('allow')
  })

  it('blocks navigating to a different local file', () => {
    expect(decideNavigation(appUrl, 'file:///etc/passwd')).toBe('block')
  })

  it('routes remote links to the browser', () => {
    expect(decideNavigation(appUrl, 'https://example.com')).toBe('external')
  })
})

describe('decideWindowOpen', () => {
  it('never allows a new Electron window', () => {
    expect(decideWindowOpen('https://example.com').allowWindow).toBe(false)
    expect(decideWindowOpen('file:///etc/passwd').allowWindow).toBe(false)
    expect(decideWindowOpen('javascript:alert(1)').allowWindow).toBe(false)
  })

  it('opens trusted http(s) links externally', () => {
    expect(decideWindowOpen('https://example.com').openExternal).toBe(true)
    expect(decideWindowOpen('http://example.com').openExternal).toBe(true)
  })

  it('does not open untrusted schemes externally', () => {
    expect(decideWindowOpen('file:///etc/passwd').openExternal).toBe(false)
    expect(decideWindowOpen('javascript:alert(1)').openExternal).toBe(false)
    expect(decideWindowOpen('data:text/html,x').openExternal).toBe(false)
  })
})
