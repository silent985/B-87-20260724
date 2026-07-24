import path from 'node:path'
import fs from 'node:fs/promises'

export function isPathWithinDir(targetPath: string, dirPath: string): boolean {
  const resolvedTarget = path.resolve(targetPath)
  const resolvedDir = path.resolve(dirPath)
  const relative = path.relative(resolvedDir, resolvedTarget)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

export async function isPathWithinDirReal(targetPath: string, dirPath: string): Promise<boolean> {
  const [realTarget, realDir] = await Promise.all([
    safeRealpath(targetPath),
    safeRealpath(dirPath),
  ])
  const relative = path.relative(realDir, realTarget)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function safeRealpath(p: string): Promise<string> {
  try {
    return await fs.realpath(p)
  } catch {
    return path.resolve(p)
  }
}

export function validateFilePath(filePath: unknown): asserts filePath is string {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path: must be a non-empty string')
  }
  if (filePath.length > 4096) {
    throw new Error('Invalid file path: too long')
  }
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: contains null bytes')
  }
}

export function validateOptionalFilePath(p: unknown): asserts p is string | undefined {
  if (p === undefined) return
  if (typeof p !== 'string') {
    throw new Error('Invalid path: must be a string or undefined')
  }
  if (p.length > 4096) {
    throw new Error('Invalid path: too long')
  }
  if (p.includes('\0')) {
    throw new Error('Invalid path: contains null bytes')
  }
}

export function validateContent(content: unknown): asserts content is string {
  if (typeof content !== 'string') {
    throw new Error('Invalid content: must be a string')
  }
}

export function validateDirPath(dirPath: unknown): asserts dirPath is string {
  if (typeof dirPath !== 'string' || dirPath.length === 0) {
    throw new Error('Invalid directory path: must be a non-empty string')
  }
  if (dirPath.length > 4096) {
    throw new Error('Invalid directory path: too long')
  }
  if (dirPath.includes('\0')) {
    throw new Error('Invalid directory path: contains null bytes')
  }
}

export function validateBoolean(val: unknown, name: string): asserts val is boolean {
  if (typeof val !== 'boolean') {
    throw new Error(`Invalid ${name}: must be a boolean`)
  }
}

export function validateArgCount(args: unknown[], min: number, max: number): void {
  if (args.length < min || args.length > max) {
    throw new Error(`Invalid argument count: expected ${min}-${max}, got ${args.length}`)
  }
}

export function validateSenderUrl(
  senderUrl: string,
  devServerUrl: string | undefined,
  appEntryUrl: string,
): void {
  if (devServerUrl) {
    const devUrl = new URL(devServerUrl)
    const parsedSenderUrl = new URL(senderUrl)
    if (parsedSenderUrl.hostname !== devUrl.hostname || parsedSenderUrl.port !== devUrl.port) {
      throw new Error(`Blocked IPC from untrusted origin: ${senderUrl}`)
    }
  } else {
    const normalized = senderUrl.split('#')[0].split('?')[0]
    if (normalized !== appEntryUrl) {
      throw new Error(`Blocked IPC from unauthorized file:// origin: ${senderUrl}`)
    }
  }
}

export function isTrustedExternalUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function isAllowedNavigation(
  navigationUrl: string,
  devServerUrl: string | undefined,
  appEntryUrl: string,
): boolean {
  if (devServerUrl) {
    try {
      const parsedNav = new URL(navigationUrl)
      const parsedDev = new URL(devServerUrl)
      return parsedNav.origin === parsedDev.origin
    } catch {
      return false
    }
  }
  const normalized = navigationUrl.split('#')[0].split('?')[0]
  return normalized === appEntryUrl
}
