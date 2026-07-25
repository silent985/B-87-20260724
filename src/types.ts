import type { DesktopApi, DirListing, FileEntry } from '../electron/ipc-contract'

export type { DesktopApi, DirListing, FileEntry }

/**
 * The renderer only ever talks to the main process through the strongly typed
 * whitelist exposed on `window.api` by the preload script. There is
 * deliberately no generic `ipcRenderer` on `window`.
 */
declare global {
  interface Window {
    api: DesktopApi
  }
}
