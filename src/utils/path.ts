export function baseName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return 'Untitled';
  const parts = normalized.split('/');
  return parts[parts.length - 1] || 'Untitled';
}

export function dirName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  if (idx < 0) return '';
  if (idx === 0) return '/';
  return normalized.substring(0, idx);
}

export function ensureMdExtension(name: string): string {
  if (!name) return 'Untitled.md';
  return name.toLowerCase().endsWith('.md') ? name : `${name}.md`;
}

export function joinPath(dir: string, file: string): string {
  if (!dir) return file;
  const normalizedDir = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  const normalizedFile = file.replace(/^\/+/, '');
  return `${normalizedDir}/${normalizedFile}`;
}
