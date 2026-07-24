export function getDirFromFilePath(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  parts.pop()
  return parts.join('/')
}

export function getFileNameFromPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts.pop() || 'Untitled'
}

export function computeNewPath(currentFilePath: string, newFileName: string): string {
  const dir = getDirFromFilePath(currentFilePath)
  return `${dir}/${newFileName}`
}

export function shouldRenameFile(currentFilePath: string | null, currentFileName: string): boolean {
  if (!currentFilePath) return false
  const oldName = getFileNameFromPath(currentFilePath)
  return oldName !== currentFileName
}
