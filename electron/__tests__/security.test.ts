import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  isWithinRoot,
  validateString,
  validatePath,
  validateDirPath,
  validateFilePath,
  validateNewFilePath,
  sanitizeFileName,
  isTrustedUrl,
  urlOrigin,
  isSameOrigin,
  validateIpcSender,
  SecurityError,
} from '../security';

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mdapp-sec-'));
  fs.mkdirSync(path.join(tmpRoot, 'sub'));
  fs.writeFileSync(path.join(tmpRoot, 'a.md'), 'hello', 'utf-8');
  fs.writeFileSync(path.join(tmpRoot, 'sub', 'b.md'), 'world', 'utf-8');
  fs.mkdirSync(path.join(tmpRoot, 'outside'));
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('isWithinRoot', () => {
  it('allows a file directly under root', () => {
    expect(isWithinRoot('/root', '/root/a.md')).toBe(true);
  });
  it('allows nested paths', () => {
    expect(isWithinRoot('/root', '/root/sub/b.md')).toBe(true);
  });
  it('allows the root itself', () => {
    expect(isWithinRoot('/root', '/root')).toBe(true);
  });
  it('rejects sibling directory traversal', () => {
    expect(isWithinRoot('/root', '/other/file.md')).toBe(false);
  });
  it('rejects ../ traversal', () => {
    expect(isWithinRoot('/root', '/root/../etc/passwd')).toBe(false);
  });
  it('normalizes Windows-style separators', () => {
    expect(isWithinRoot('C:\\docs', 'C:\\docs\\note.md')).toBe(true);
    expect(isWithinRoot('C:\\docs', 'C:\\Windows\\system32')).toBe(false);
  });
});

describe('validateString', () => {
  it('accepts valid strings', () => {
    expect(validateString('hello', 'name')).toBe('hello');
  });
  it('rejects non-string', () => {
    expect(() => validateString(123 as unknown, 'n')).toThrow(SecurityError);
    expect(() => validateString(null, 'n')).toThrow(SecurityError);
    expect(() => validateString(undefined, 'n')).toThrow(SecurityError);
  });
  it('rejects empty string', () => {
    expect(() => validateString('', 'n')).toThrow(SecurityError);
  });
  it('rejects null bytes', () => {
    expect(() => validateString('a\u0000b', 'n')).toThrow(SecurityError);
  });
  it('rejects too-long strings', () => {
    expect(() => validateString('x'.repeat(2000), 'n', 1000)).toThrow(SecurityError);
  });
});

describe('validatePath', () => {
  it('rejects relative paths', () => {
    expect(() => validatePath('relative/path.md', [tmpRoot])).toThrow(SecurityError);
  });
  it('rejects non-string input', () => {
    expect(() => validatePath(42 as unknown, [tmpRoot])).toThrow(SecurityError);
  });
  it('resolves valid absolute path inside root', () => {
    const result = validatePath(path.join(tmpRoot, 'a.md'), [tmpRoot]);
    expect(path.isAbsolute(result)).toBe(true);
  });
  it('rejects path outside root', () => {
    expect(() =>
      validatePath(path.join(tmpRoot, '..', 'outside.md'), [tmpRoot])
    ).toThrow(SecurityError);
  });
});

describe('validateDirPath', () => {
  it('validates existing directory', () => {
    expect(validateDirPath(path.join(tmpRoot, 'sub'), [tmpRoot])).toBeTruthy();
  });
  it('rejects file path', () => {
    expect(() => validateDirPath(path.join(tmpRoot, 'a.md'), [tmpRoot])).toThrow(SecurityError);
  });
  it('rejects non-existent directory', () => {
    expect(() => validateDirPath(path.join(tmpRoot, 'nope'), [tmpRoot])).toThrow(SecurityError);
  });
});

describe('validateFilePath', () => {
  it('validates existing file', () => {
    const p = validateFilePath(path.join(tmpRoot, 'a.md'), [tmpRoot]);
    expect(fs.existsSync(p)).toBe(true);
  });
  it('rejects directory as file', () => {
    expect(() => validateFilePath(path.join(tmpRoot, 'sub'), [tmpRoot])).toThrow(SecurityError);
  });
});

describe('validateNewFilePath', () => {
  it('allows new file in existing directory', () => {
    const result = validateNewFilePath(path.join(tmpRoot, 'new.md'), [tmpRoot]);
    expect(path.isAbsolute(result)).toBe(true);
  });
  it('rejects new file outside root', () => {
    expect(() =>
      validateNewFilePath(path.join(tmpRoot, '..', 'evil.md'), [tmpRoot])
    ).toThrow(SecurityError);
  });
  it('rejects when parent directory does not exist', () => {
    expect(() =>
      validateNewFilePath(path.join(tmpRoot, 'nope', 'x.md'), [tmpRoot])
    ).toThrow(SecurityError);
  });
});

describe('sanitizeFileName', () => {
  it('strips illegal characters', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
  });
  it('truncates long names', () => {
    expect(sanitizeFileName('x'.repeat(500)).length).toBeLessThanOrEqual(255);
  });
});

describe('isTrustedUrl', () => {
  it('allows https', () => {
    expect(isTrustedUrl('https://example.com')).toBe(true);
  });
  it('allows http', () => {
    expect(isTrustedUrl('http://example.com')).toBe(true);
  });
  it('rejects file://', () => {
    expect(isTrustedUrl('file:///etc/passwd')).toBe(false);
  });
  it('rejects javascript:', () => {
    expect(isTrustedUrl('javascript:alert(1)')).toBe(false);
  });
  it('rejects invalid url', () => {
    expect(isTrustedUrl('not a url')).toBe(false);
  });
});

describe('urlOrigin', () => {
  it('extracts origin from http url', () => {
    expect(urlOrigin('http://localhost:5173/path?x=1')).toBe('http://localhost:5173');
  });
  it('extracts origin from https url', () => {
    expect(urlOrigin('https://example.com/foo/bar')).toBe('https://example.com');
  });
  it('returns file:// for file urls', () => {
    expect(urlOrigin('file:///C:/Users/test/index.html')).toBe('file://');
  });
  it('returns null for invalid url', () => {
    expect(urlOrigin('not a url')).toBeNull();
  });
  it('normalizes port differences', () => {
    expect(urlOrigin('http://localhost:5173/')).not.toBe(urlOrigin('http://localhost:5174/'));
  });
});

describe('isSameOrigin', () => {
  const trusted = ['http://localhost:5173', 'file://'];

  it('matches exact origin', () => {
    expect(isSameOrigin('http://localhost:5173/some/path', trusted)).toBe(true);
  });
  it('matches file:// origin', () => {
    expect(isSameOrigin('file:///C:/app/dist/index.html', trusted)).toBe(true);
  });
  it('rejects different origin', () => {
    expect(isSameOrigin('https://evil.com/', trusted)).toBe(false);
  });
  it('rejects different port', () => {
    expect(isSameOrigin('http://localhost:4000/', trusted)).toBe(false);
  });
  it('rejects subdomain trickery', () => {
    expect(isSameOrigin('http://localhost:5173.evil.com/', trusted)).toBe(false);
  });
  it('rejects invalid url', () => {
    expect(isSameOrigin('javascript:alert(1)', trusted)).toBe(false);
  });
  it('is case-sensitive on scheme', () => {
    expect(isSameOrigin('HTTP://localhost:5173/', trusted)).toBe(true);
  });
});

describe('validateIpcSender', () => {
  function makeEvent(overrides: {
    senderFrame?: { url: string } | null;
    sender?: { id: number };
  }): Electron.IpcMainInvokeEvent {
    const sender = overrides.sender ?? { id: 1 };
    return {
      senderFrame: overrides.senderFrame === undefined ? { url: 'http://localhost:5173/' } : overrides.senderFrame,
      sender: sender as Electron.WebContents,
      returnValue: undefined,
      processId: 0,
      frameId: 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  const ctx = {
    expectedOrigins: ['http://localhost:5173', 'file://'],
    isValidWindow: (wc: Electron.WebContents) => wc.id === 1,
  };

  it('passes for valid sender from trusted origin', () => {
    expect(() => validateIpcSender(makeEvent({}), ctx)).not.toThrow();
  });

  it('passes for file:// origin', () => {
    expect(() =>
      validateIpcSender(makeEvent({ senderFrame: { url: 'file:///C:/app/index.html' } }), ctx)
    ).not.toThrow();
  });

  it('rejects null senderFrame', () => {
    expect(() =>
      validateIpcSender(makeEvent({ senderFrame: null }), ctx)
    ).toThrow(SecurityError);
  });

  it('rejects untrusted frame origin', () => {
    expect(() =>
      validateIpcSender(makeEvent({ senderFrame: { url: 'https://evil.com/steal' } }), ctx)
    ).toThrow(SecurityError);
  });

  it('rejects origin mismatch with port difference', () => {
    expect(() =>
      validateIpcSender(makeEvent({ senderFrame: { url: 'http://localhost:4000/' } }), ctx)
    ).toThrow(SecurityError);
  });

  it('rejects sender from unknown window', () => {
    expect(() =>
      validateIpcSender(makeEvent({ sender: { id: 999 } }), ctx)
    ).toThrow(SecurityError);
  });

  it('rejects subdomain-prefixed attacker origin', () => {
    expect(() =>
      validateIpcSender(makeEvent({ senderFrame: { url: 'http://localhost:5173.evil.com/' } }), ctx)
    ).toThrow(SecurityError);
  });

  it('rejects javascript: URL in frame', () => {
    expect(() =>
      validateIpcSender(makeEvent({ senderFrame: { url: 'javascript:void(0)' } }), ctx)
    ).toThrow(SecurityError);
  });
});
