import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isInternalUrl,
  isPathWithinAnyRoot,
  isPathWithinRoot,
  isSafeFileName,
  isTrustedExternalUrl,
} from '../electron/pathGuard'

const root = path.resolve('/home/user/Documents')

describe('isPathWithinRoot', () => {
  it('accepts the root itself', () => {
    expect(isPathWithinRoot(root, root)).toBe(true)
  })

  it('accepts direct children', () => {
    expect(isPathWithinRoot(root, path.join(root, 'notes.md'))).toBe(true)
  })

  it('accepts deeply nested descendants', () => {
    expect(isPathWithinRoot(root, path.join(root, 'a', 'b', 'c.md'))).toBe(true)
  })

  it('rejects a parent directory', () => {
    expect(isPathWithinRoot(root, path.dirname(root))).toBe(false)
  })

  it('rejects traversal escapes with ..', () => {
    expect(isPathWithinRoot(root, path.join(root, '..', '..', 'etc', 'passwd'))).toBe(false)
  })

  it('rejects a sibling directory that shares a name prefix', () => {
    // "/home/user/Documents-secret" must not be treated as inside "Documents".
    expect(isPathWithinRoot(root, `${root}-secret`)).toBe(false)
  })

  it('rejects an unrelated absolute path', () => {
    expect(isPathWithinRoot(root, path.resolve('/etc/hosts'))).toBe(false)
  })
})

describe('isPathWithinAnyRoot', () => {
  const other = path.resolve('/tmp/workspace')

  it('accepts a path inside any granted root', () => {
    expect(isPathWithinAnyRoot([root, other], path.join(other, 'file.md'))).toBe(true)
  })

  it('rejects a path outside every root', () => {
    expect(isPathWithinAnyRoot([root, other], path.resolve('/var/log/syslog'))).toBe(false)
  })

  it('rejects everything when there are no roots', () => {
    expect(isPathWithinAnyRoot([], path.join(root, 'file.md'))).toBe(false)
  })
})

describe('isSafeFileName', () => {
  it('accepts a plain name', () => {
    expect(isSafeFileName('notes.md')).toBe(true)
  })

  it('rejects empty names', () => {
    expect(isSafeFileName('')).toBe(false)
  })

  it('rejects dot segments', () => {
    expect(isSafeFileName('.')).toBe(false)
    expect(isSafeFileName('..')).toBe(false)
  })

  it('rejects names containing a forward slash', () => {
    expect(isSafeFileName('sub/notes.md')).toBe(false)
  })

  it('rejects names containing a backslash', () => {
    expect(isSafeFileName('sub\\notes.md')).toBe(false)
  })

  it('rejects traversal in a name', () => {
    expect(isSafeFileName('../notes.md')).toBe(false)
  })
})

describe('isTrustedExternalUrl', () => {
  it('accepts https and http', () => {
    expect(isTrustedExternalUrl('https://example.com')).toBe(true)
    expect(isTrustedExternalUrl('http://example.com/page')).toBe(true)
  })

  it('rejects file, javascript and data URLs', () => {
    expect(isTrustedExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isTrustedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isTrustedExternalUrl('data:text/html,<script>1</script>')).toBe(false)
  })

  it('rejects garbage input', () => {
    expect(isTrustedExternalUrl('not a url')).toBe(false)
    expect(isTrustedExternalUrl('')).toBe(false)
  })
})

describe('isInternalUrl', () => {
  it('treats same dev-server origin as internal', () => {
    const appUrl = 'http://localhost:5173/'
    expect(isInternalUrl(appUrl, 'http://localhost:5173/index.html')).toBe(true)
    expect(isInternalUrl(appUrl, 'http://localhost:5173/#/foo')).toBe(true)
  })

  it('treats a different origin as external', () => {
    const appUrl = 'http://localhost:5173/'
    expect(isInternalUrl(appUrl, 'http://evil.example/')).toBe(false)
    expect(isInternalUrl(appUrl, 'http://localhost:9999/')).toBe(false)
  })

  it('treats the same packaged file document as internal', () => {
    const appUrl = 'file:///app/dist/index.html'
    expect(isInternalUrl(appUrl, 'file:///app/dist/index.html')).toBe(true)
  })

  it('treats a different file path as external', () => {
    const appUrl = 'file:///app/dist/index.html'
    expect(isInternalUrl(appUrl, 'file:///etc/passwd')).toBe(false)
  })

  it('treats a remote page as external in packaged mode', () => {
    const appUrl = 'file:///app/dist/index.html'
    expect(isInternalUrl(appUrl, 'https://evil.example/')).toBe(false)
  })
})
