import { describe, expect, it } from 'vitest'
import {
  assertBoolean,
  assertNonEmptyString,
  assertOptionalString,
  assertString,
} from '../electron/ipcValidate'

describe('assertString', () => {
  it('returns the value for a string', () => {
    expect(assertString('hello', 'x')).toBe('hello')
    expect(assertString('', 'x')).toBe('')
  })

  it('throws for non-strings', () => {
    expect(() => assertString(42, 'x')).toThrow(/x must be a string/)
    expect(() => assertString(null, 'x')).toThrow(/x must be a string/)
    expect(() => assertString(undefined, 'x')).toThrow(/x must be a string/)
    expect(() => assertString({ path: '/etc' }, 'x')).toThrow(/x must be a string/)
    expect(() => assertString(['a'], 'x')).toThrow(/x must be a string/)
  })
})

describe('assertNonEmptyString', () => {
  it('returns a non-empty string', () => {
    expect(assertNonEmptyString('a', 'x')).toBe('a')
  })

  it('throws for empty string', () => {
    expect(() => assertNonEmptyString('', 'x')).toThrow(/x must not be empty/)
  })

  it('throws for non-strings', () => {
    expect(() => assertNonEmptyString(0, 'x')).toThrow(/x must be a string/)
  })
})

describe('assertBoolean', () => {
  it('returns booleans', () => {
    expect(assertBoolean(true, 'x')).toBe(true)
    expect(assertBoolean(false, 'x')).toBe(false)
  })

  it('throws for non-booleans (including truthy strings)', () => {
    expect(() => assertBoolean('true', 'x')).toThrow(/x must be a boolean/)
    expect(() => assertBoolean(1, 'x')).toThrow(/x must be a boolean/)
    expect(() => assertBoolean(null, 'x')).toThrow(/x must be a boolean/)
  })
})

describe('assertOptionalString', () => {
  it('passes through undefined/null as undefined', () => {
    expect(assertOptionalString(undefined, 'x')).toBeUndefined()
    expect(assertOptionalString(null, 'x')).toBeUndefined()
  })

  it('returns a real string', () => {
    expect(assertOptionalString('name.md', 'x')).toBe('name.md')
  })

  it('throws for other types', () => {
    expect(() => assertOptionalString(123, 'x')).toThrow(/x must be a string/)
  })
})
