import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from './ipc-contract'
import type { DesktopApi } from './ipc-contract'

/**
 * The preload script is the *only* bridge between the untrusted renderer and
 * the Node-privileged main process.
 *
 * We deliberately do NOT expose a generic `ipcRenderer` (with arbitrary
 * `invoke`/`send`). Doing so would let any code running in the renderer — or an
 * injected remote page — call any IPC channel with any payload. Instead we
 * expose a small, strongly typed, hand-written whitelist. Each method forwards
 * to exactly one channel with a fixed argument shape, and the main process
 * re-validates everything it receives.
 */

const api: DesktopApi = {
  listDir: (dirPath?: string) => ipcRenderer.invoke(IpcChannels.listDir, dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke(IpcChannels.readFile, filePath),
  saveFile: (filePath: string, content: string) =>
    ipcRenderer.invoke(IpcChannels.saveFile, filePath, content),
  renameFile: (filePath: string, nextName: string) =>
    ipcRenderer.invoke(IpcChannels.renameFile, filePath, nextName),
  showSaveDialog: (defaultName?: string) =>
    ipcRenderer.invoke(IpcChannels.showSaveDialog, defaultName),
  getDocumentsPath: () => ipcRenderer.invoke(IpcChannels.getDocumentsPath),
  openExternal: (url: string) => ipcRenderer.invoke(IpcChannels.openExternal, url),
  onBeforeClose: (callback: () => void) => {
    // Wrap so the renderer never receives the Electron event object (which
    // exposes `sender`, ports, etc.). Only the bare notification crosses over.
    const listener = () => callback()
    ipcRenderer.on(IpcChannels.beforeClose, listener)
    return () => ipcRenderer.off(IpcChannels.beforeClose, listener)
  },
  respondClose: (shouldClose: boolean) =>
    ipcRenderer.send(IpcChannels.respondClose, shouldClose),
}

contextBridge.exposeInMainWorld('api', api)
