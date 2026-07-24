import { describe, it, expect } from 'vitest'
import {
  isPathWithinDir,
  validateFilePath,
  validateContent,
  validateDirPath,
  validateOptionalFilePath,
  validateBoolean,
  validateArgCount,
  validateSenderUrl,
  isTrustedExternalUrl,
  isAllowedNavigation,
} from '../../electron/security'
import { ALLOWED_IPC_CHANNELS, isAllowedChannel } from '../../shared/ipc-channels'

describe('Security: isPathWithinDir', () => {
  const rootDir = '/home/user/documents'

  it('should allow path directly inside root', () => {
    expect(isPathWithinDir('/home/user/documents/file.md', rootDir)).toBe(true)
  })

  it('should allow nested path inside root', () => {
    expect(isPathWithinDir('/home/user/documents/subfolder/file.md', rootDir)).toBe(true)
  })

  it('should allow root directory itself', () => {
    expect(isPathWithinDir('/home/user/documents', rootDir)).toBe(true)
  })

  it('should block path traversal via ..', () => {
    expect(isPathWithinDir('/home/user/documents/../etc/passwd', rootDir)).toBe(false)
  })

  it('should block absolute path outside root', () => {
    expect(isPathWithinDir('/etc/passwd', rootDir)).toBe(false)
  })

  it('should block path to parent directory', () => {
    expect(isPathWithinDir('/home/user/', rootDir)).toBe(false)
  })

  it('should handle windows-style paths', () => {
    const winRoot = 'C:\\Users\\user\\Documents'
    expect(isPathWithinDir('C:\\Users\\user\\Documents\\file.md', winRoot)).toBe(true)
    expect(isPathWithinDir('C:\\Users\\user\\Documents\\..\\..\\Windows\\System32', winRoot)).toBe(false)
  })
})

describe('Security: validateFilePath', () => {
  it('should accept valid string path', () => {
    expect(() => validateFilePath('/valid/path.md')).not.toThrow()
  })

  it('should reject empty string', () => {
    expect(() => validateFilePath('')).toThrow('non-empty string')
  })

  it('should reject non-string types', () => {
    expect(() => validateFilePath(123)).toThrow('non-empty string')
    expect(() => validateFilePath(null)).toThrow('non-empty string')
    expect(() => validateFilePath(undefined)).toThrow('non-empty string')
    expect(() => validateFilePath({})).toThrow('non-empty string')
    expect(() => validateFilePath([])).toThrow('non-empty string')
  })

  it('should reject paths with null bytes', () => {
    expect(() => validateFilePath('/path/to/file\0.md')).toThrow('null bytes')
  })

  it('should reject paths exceeding max length', () => {
    const longPath = '/a'.repeat(2049)
    expect(() => validateFilePath(longPath)).toThrow('too long')
  })
})

describe('Security: validateOptionalFilePath', () => {
  it('should accept undefined', () => {
    expect(() => validateOptionalFilePath(undefined)).not.toThrow()
  })

  it('should accept valid string', () => {
    expect(() => validateOptionalFilePath('/valid/path.md')).not.toThrow()
  })

  it('should reject non-string non-undefined types', () => {
    expect(() => validateOptionalFilePath(123)).toThrow('must be a string or undefined')
    expect(() => validateOptionalFilePath(null)).toThrow('must be a string or undefined')
  })
})

describe('Security: validateDirPath', () => {
  it('should accept valid string path', () => {
    expect(() => validateDirPath('/valid/dir')).not.toThrow()
  })

  it('should reject empty string', () => {
    expect(() => validateDirPath('')).toThrow('non-empty string')
  })

  it('should reject non-string types', () => {
    expect(() => validateDirPath(123)).toThrow('non-empty string')
    expect(() => validateDirPath(null)).toThrow('non-empty string')
    expect(() => validateDirPath(undefined)).toThrow('non-empty string')
  })

  it('should reject paths with null bytes', () => {
    expect(() => validateDirPath('/path/to/dir\0evil')).toThrow('null bytes')
  })

  it('should reject paths exceeding max length', () => {
    const longPath = '/a'.repeat(2049)
    expect(() => validateDirPath(longPath)).toThrow('too long')
  })
})

describe('Security: validateContent', () => {
  it('should accept string content', () => {
    expect(() => validateContent('hello world')).not.toThrow()
  })

  it('should accept empty string', () => {
    expect(() => validateContent('')).not.toThrow()
  })

  it('should reject non-string types', () => {
    expect(() => validateContent(123)).toThrow('must be a string')
    expect(() => validateContent(null)).toThrow('must be a string')
    expect(() => validateContent({})).toThrow('must be a string')
    expect(() => validateContent(undefined)).toThrow('must be a string')
  })
})

describe('Security: validateBoolean', () => {
  it('should accept boolean values', () => {
    expect(() => validateBoolean(true, 'test')).not.toThrow()
    expect(() => validateBoolean(false, 'test')).not.toThrow()
  })

  it('should reject non-boolean types', () => {
    expect(() => validateBoolean(1, 'test')).toThrow('must be a boolean')
    expect(() => validateBoolean('true', 'test')).toThrow('must be a boolean')
    expect(() => validateBoolean(null, 'test')).toThrow('must be a boolean')
  })
})

describe('Security: validateArgCount', () => {
  it('should accept correct argument counts', () => {
    expect(() => validateArgCount(['a'], 1, 1)).not.toThrow()
    expect(() => validateArgCount(['a', 'b'], 1, 3)).not.toThrow()
    expect(() => validateArgCount([], 0, 0)).not.toThrow()
  })

  it('should reject too few arguments', () => {
    expect(() => validateArgCount([], 1, 2)).toThrow('Invalid argument count')
  })

  it('should reject too many arguments', () => {
    expect(() => validateArgCount(['a', 'b', 'c'], 1, 2)).toThrow('Invalid argument count')
  })
})

describe('Security: validateSenderUrl', () => {
  const devServerUrl = 'http://localhost:5173'
  const appEntryUrl = 'file:///path/to/dist/index.html'

  it('should allow matching dev server origin', () => {
    expect(() => validateSenderUrl('http://localhost:5173/', devServerUrl, appEntryUrl)).not.toThrow()
    expect(() => validateSenderUrl('http://localhost:5173/some/path', devServerUrl, appEntryUrl)).not.toThrow()
  })

  it('should reject different port on dev server', () => {
    expect(() => validateSenderUrl('http://localhost:5174/', devServerUrl, appEntryUrl)).toThrow('untrusted origin')
  })

  it('should reject different hostname on dev server', () => {
    expect(() => validateSenderUrl('http://evil.com:5173/', devServerUrl, appEntryUrl)).toThrow('untrusted origin')
  })

  it('should reject external https in dev mode', () => {
    expect(() => validateSenderUrl('https://evil.com/', devServerUrl, appEntryUrl)).toThrow('untrusted origin')
  })

  it('should allow exact app entry in production mode', () => {
    expect(() => validateSenderUrl('file:///path/to/dist/index.html', undefined, appEntryUrl)).not.toThrow()
  })

  it('should reject different file:// URL in production mode', () => {
    expect(() => validateSenderUrl('file:///etc/passwd', undefined, appEntryUrl)).toThrow('unauthorized file://')
  })

  it('should reject any file:// that does not match entry exactly', () => {
    expect(() => validateSenderUrl('file:///path/to/dist/other.html', undefined, appEntryUrl)).toThrow('unauthorized file://')
  })

  it('should reject http:// in production mode', () => {
    expect(() => validateSenderUrl('http://evil.com/', undefined, appEntryUrl)).toThrow('unauthorized file://')
  })

  it('should strip query and hash before comparing in production', () => {
    expect(() => validateSenderUrl('file:///path/to/dist/index.html?v=1', undefined, appEntryUrl)).not.toThrow()
    expect(() => validateSenderUrl('file:///path/to/dist/index.html#section', undefined, appEntryUrl)).not.toThrow()
  })
})

describe('Security: isTrustedExternalUrl', () => {
  it('should allow http and https', () => {
    expect(isTrustedExternalUrl('https://example.com')).toBe(true)
    expect(isTrustedExternalUrl('http://example.com/path?q=1')).toBe(true)
  })

  it('should allow mailto', () => {
    expect(isTrustedExternalUrl('mailto:test@example.com')).toBe(true)
  })

  it('should block file:// protocol', () => {
    expect(isTrustedExternalUrl('file:///etc/passwd')).toBe(false)
  })

  it('should block dangerous protocols', () => {
    expect(isTrustedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isTrustedExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isTrustedExternalUrl('about:blank')).toBe(false)
    expect(isTrustedExternalUrl('ftp://evil.com/')).toBe(false)
  })

  it('should block invalid URLs', () => {
    expect(isTrustedExternalUrl('not a url')).toBe(false)
    expect(isTrustedExternalUrl('')).toBe(false)
  })
})

describe('Security: isAllowedNavigation', () => {
  const devServerUrl = 'http://localhost:5173'
  const appEntryUrl = 'file:///path/to/dist/index.html'

  it('should allow same-origin navigation in dev mode', () => {
    expect(isAllowedNavigation('http://localhost:5173/other', devServerUrl, appEntryUrl)).toBe(true)
  })

  it('should block cross-origin navigation in dev mode', () => {
    expect(isAllowedNavigation('http://evil.com/', devServerUrl, appEntryUrl)).toBe(false)
  })

  it('should allow exact entry in production', () => {
    expect(isAllowedNavigation('file:///path/to/dist/index.html', undefined, appEntryUrl)).toBe(true)
  })

  it('should block different file:// in production', () => {
    expect(isAllowedNavigation('file:///etc/passwd', undefined, appEntryUrl)).toBe(false)
  })

  it('should strip query/hash in production', () => {
    expect(isAllowedNavigation('file:///path/to/dist/index.html?v=1', undefined, appEntryUrl)).toBe(true)
  })
})

describe('Security: preload channel whitelist', () => {
  it('should allow all whitelisted channels', () => {
    for (const ch of ALLOWED_IPC_CHANNELS) {
      expect(isAllowedChannel(ch)).toBe(true)
    }
  })

  it('should block non-whitelisted channels', () => {
    expect(isAllowedChannel('shell')).toBe(false)
    expect(isAllowedChannel('app-quit')).toBe(false)
    expect(isAllowedChannel('eval')).toBe(false)
    expect(isAllowedChannel('')).toBe(false)
    expect(isAllowedChannel('read-file-evil')).toBe(false)
  })

  it('should have all expected channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('read-file')
    expect(ALLOWED_IPC_CHANNELS).toContain('save-file')
    expect(ALLOWED_IPC_CHANNELS).toContain('list-dir')
    expect(ALLOWED_IPC_CHANNELS).toContain('get-app-path')
    expect(ALLOWED_IPC_CHANNELS).toContain('show-save-dialog')
    expect(ALLOWED_IPC_CHANNELS).toContain('rename-file')
    expect(ALLOWED_IPC_CHANNELS).toContain('close-window')
    expect(ALLOWED_IPC_CHANNELS).toContain('save-result')
  })
})
