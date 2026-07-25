import { describe, it, expect } from 'vitest';
import { baseName, dirName, ensureMdExtension, joinPath } from '../utils/path';

describe('baseName', () => {
  it('extracts filename from unix path', () => {
    expect(baseName('/home/user/note.md')).toBe('note.md');
  });
  it('extracts filename from windows path', () => {
    expect(baseName('C:\\Users\\name\\note.md')).toBe('note.md');
  });
  it('handles trailing slash', () => {
    expect(baseName('/home/user/dir/')).toBe('dir');
  });
  it('returns Untitled for empty-ish input', () => {
    expect(baseName('')).toBe('Untitled');
  });
});

describe('dirName', () => {
  it('returns parent directory (unix)', () => {
    expect(dirName('/home/user/note.md')).toBe('/home/user');
  });
  it('returns parent directory (windows)', () => {
    expect(dirName('C:\\Users\\name\\note.md')).toBe('C:/Users/name');
  });
  it('returns / for root-level file', () => {
    expect(dirName('/note.md')).toBe('/');
  });
  it('returns empty string for bare path without separator', () => {
    expect(dirName('note.md')).toBe('');
  });
  it('handles trailing slashes', () => {
    expect(dirName('/home/user/')).toBe('/home');
  });
});

describe('ensureMdExtension', () => {
  it('appends .md when missing', () => {
    expect(ensureMdExtension('note')).toBe('note.md');
  });
  it('keeps existing .md', () => {
    expect(ensureMdExtension('note.md')).toBe('note.md');
  });
  it('keeps uppercase .MD', () => {
    expect(ensureMdExtension('NOTE.MD')).toBe('NOTE.MD');
  });
  it('defaults to Untitled.md for empty', () => {
    expect(ensureMdExtension('')).toBe('Untitled.md');
  });
});

describe('joinPath', () => {
  it('joins dir and file with slash', () => {
    expect(joinPath('/home/user', 'note.md')).toBe('/home/user/note.md');
  });
  it('handles trailing slash in dir', () => {
    expect(joinPath('/home/user/', 'note.md')).toBe('/home/user/note.md');
  });
  it('handles leading slash in file', () => {
    expect(joinPath('/home/user', '/note.md')).toBe('/home/user/note.md');
  });
  it('returns file when dir is empty', () => {
    expect(joinPath('', 'note.md')).toBe('note.md');
  });
  it('normalizes backslashes in dir', () => {
    expect(joinPath('C:\\Users\\name', 'note.md')).toBe('C:/Users/name/note.md');
  });
});
