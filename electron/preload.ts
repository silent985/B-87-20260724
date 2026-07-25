import { ipcRenderer, contextBridge } from 'electron'
import type { MarkdownAPI, FileItem } from '../shared/api-types'
import { isAllowedChannel } from '../shared/ipc-channels'

const invoke = async <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
  if (!isAllowedChannel(channel)) {
    throw new Error(`Blocked IPC channel: ${channel}`)
  }
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

let unsavedChangesCallback: (() => boolean) | null = null
let saveAndCloseCallback: (() => Promise<boolean>) | null = null

ipcRenderer.on('save-and-close', () => {
  if (saveAndCloseCallback) {
    void saveAndCloseCallback().then((success) => {
      void invoke('save-result', success)
    })
  } else {
    void invoke('save-result', false)
  }
})

const api: MarkdownAPI = {
  readFile: (filePath: string) => invoke<string>('read-file', filePath),
  saveFile: (filePath: string, content: string) => invoke<boolean>('save-file', filePath, content),
  listDir: (dirPath: string) => invoke<FileItem[]>('list-dir', dirPath),
  getAppPath: () => invoke<string>('get-app-path'),
  showSaveDialog: (defaultPath?: string) => invoke<string | null>('show-save-dialog', defaultPath),
  renameFile: (oldPath: string, newPath: string) => invoke<boolean>('rename-file', oldPath, newPath),
  closeWindow: () => invoke<boolean>('close-window'),
  hasUnsavedChanges: () => (unsavedChangesCallback ? unsavedChangesCallback() : false),
  setUnsavedChangesHandler: (handler: () => boolean) => {
    unsavedChangesCallback = handler
  },
  setSaveAndCloseHandler: (handler: () => Promise<boolean>) => {
    saveAndCloseCallback = handler
  },
}

contextBridge.exposeInMainWorld('markdownAPI', api)

export type { MarkdownAPI, FileItem }
