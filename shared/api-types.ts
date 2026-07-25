export interface FileItem {
  name: string
  isDirectory: boolean
  path: string
}

export interface MarkdownAPI {
  readFile: (filePath: string) => Promise<string>
  saveFile: (filePath: string, content: string) => Promise<boolean>
  listDir: (dirPath: string) => Promise<FileItem[]>
  getAppPath: () => Promise<string>
  showSaveDialog: (defaultPath?: string) => Promise<string | null>
  renameFile: (oldPath: string, newPath: string) => Promise<boolean>
  closeWindow: () => Promise<boolean>
  hasUnsavedChanges: () => boolean
  setUnsavedChangesHandler: (handler: () => boolean) => void
  setSaveAndCloseHandler: (handler: () => Promise<boolean>) => void
}

declare global {
  interface Window {
    markdownAPI: MarkdownAPI
  }
}
