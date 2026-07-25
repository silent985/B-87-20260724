import path from 'node:path';
import fs from 'node:fs';

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export function isWithinRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedRoot) return true;
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function validateString(value: unknown, name: string, maxLen = 1024): string {
  if (typeof value !== 'string') {
    throw new SecurityError(`Invalid parameter: ${name} must be a string`);
  }
  if (value.length === 0) {
    throw new SecurityError(`Invalid parameter: ${name} must not be empty`);
  }
  if (value.length > maxLen) {
    throw new SecurityError(`Invalid parameter: ${name} exceeds maximum length`);
  }
  if (value.includes('\0')) {
    throw new SecurityError(`Invalid parameter: ${name} contains null bytes`);
  }
  return value;
}

export function validatePath(
  targetPath: unknown,
  allowedRoots: readonly string[],
  options: { mustExist?: boolean; allowSymlinkEscape?: boolean } = {}
): string {
  const rawPath = validateString(targetPath, 'path', 4096);

  if (!path.isAbsolute(rawPath)) {
    throw new SecurityError(`Path must be absolute: ${rawPath}`);
  }

  let resolved: string;
  try {
    resolved = path.resolve(rawPath);
  } catch {
    throw new SecurityError(`Invalid path: ${rawPath}`);
  }

  if (options.mustExist) {
    let realPath: string;
    try {
      realPath = fs.realpathSync.native(resolved);
    } catch {
      throw new SecurityError(`Path does not exist: ${resolved}`);
    }
    if (!options.allowSymlinkEscape) {
      const inRoot = allowedRoots.some((root) => isWithinRoot(root, realPath));
      if (!inRoot) {
        throw new SecurityError(`Path escapes allowed root: ${realPath}`);
      }
    }
    resolved = realPath;
  }

  const inRoot = allowedRoots.some((root) => isWithinRoot(root, resolved));
  if (!inRoot) {
    throw new SecurityError(`Path escapes allowed root: ${resolved}`);
  }

  return resolved;
}

export function validateDirPath(targetPath: unknown, allowedRoots: readonly string[]): string {
  const resolved = validatePath(targetPath, allowedRoots, { mustExist: true });
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new SecurityError(`Cannot access directory: ${resolved}`);
  }
  if (!stat.isDirectory()) {
    throw new SecurityError(`Path is not a directory: ${resolved}`);
  }
  return resolved;
}

export function validateFilePath(targetPath: unknown, allowedRoots: readonly string[]): string {
  const resolved = validatePath(targetPath, allowedRoots, { mustExist: true });
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new SecurityError(`Cannot access file: ${resolved}`);
  }
  if (!stat.isFile()) {
    throw new SecurityError(`Path is not a file: ${resolved}`);
  }
  return resolved;
}

export function validateNewFilePath(targetPath: unknown, allowedRoots: readonly string[]): string {
  const rawPath = validateString(targetPath, 'path', 4096);
  if (!path.isAbsolute(rawPath)) {
    throw new SecurityError(`Path must be absolute: ${rawPath}`);
  }
  const resolved = path.resolve(rawPath);
  const parentDir = path.dirname(resolved);
  let parentStat: fs.Stats;
  try {
    parentStat = fs.statSync(parentDir);
  } catch {
    throw new SecurityError(`Parent directory does not exist: ${parentDir}`);
  }
  if (!parentStat.isDirectory()) {
    throw new SecurityError(`Parent path is not a directory: ${parentDir}`);
  }
  const realParent = fs.realpathSync.native(parentDir);
  const inRoot = allowedRoots.some((root) => isWithinRoot(root, realParent));
  if (!inRoot) {
    throw new SecurityError(`Path escapes allowed root: ${resolved}`);
  }
  if (fs.existsSync(resolved)) {
    const realTarget = fs.realpathSync.native(resolved);
    const targetInRoot = allowedRoots.some((root) => isWithinRoot(root, realTarget));
    if (!targetInRoot) {
      throw new SecurityError(`Path escapes allowed root: ${resolved}`);
    }
  }
  return resolved;
}

export function sanitizeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const illegalRe = /[<>:"/\\|?*\u0000-\u001f]/g;
  return name.replace(illegalRe, '_').slice(0, 255);
}

export function isTrustedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:');
  } catch {
    return false;
  }
}

export function urlOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return 'file://';
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isSameOrigin(url: string, trustedOrigins: readonly string[]): boolean {
  const origin = urlOrigin(url);
  if (!origin) return false;
  return trustedOrigins.some((t) => t === origin);
}

export interface IpcValidationContext {
  expectedOrigins: readonly string[];
  isValidWindow: (wc: Electron.WebContents) => boolean;
}

export function validateIpcSender(
  event: Electron.IpcMainInvokeEvent,
  ctx: IpcValidationContext
): void {
  const frame = event.senderFrame;
  if (!frame) {
    throw new SecurityError('IPC rejected: no sender frame');
  }
  if (frame.url) {
    if (!isSameOrigin(frame.url, ctx.expectedOrigins)) {
      throw new SecurityError(`IPC rejected: untrusted frame origin: ${frame.url}`);
    }
  }
  if (!ctx.isValidWindow(event.sender)) {
    throw new SecurityError('IPC rejected: sender is not a known application window');
  }
}
