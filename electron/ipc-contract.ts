/**
 * The single source of truth for the IPC surface shared between the main
 * process and the preload script.
 *
 * The renderer never sees these channel names: it only ever calls the strongly
 * typed methods exposed on `window.api` by the preload script. Keeping the
 * channel list here (and nowhere in `src/`) makes the trust boundary explicit —
 * a channel that is not in this whitelist simply cannot be invoked.
 */

export const IpcChannels = {
  listDir: 'fs:list-dir',
  readFile: 'fs:read-file',
  saveFile: 'fs:save-file',
  renameFile: 'fs:rename-file',
  showSaveDialog: 'dialog:show-save',
  getDocumentsPath: 'app:documents-path',
  openExternal: 'shell:open-external',
  /** main -> renderer: the user tried to close the window. */
  beforeClose: 'app:before-close',
  /** renderer -> main: proceed with (or abort) closing the window. */
  respondClose: 'app:respond-close',
} as const

/** A single entry returned when listing a directory. */
export interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

/**
 * The result of a directory listing. `root` is the sandbox boundary the
 * renderer is confined to; `parent` is `null` when `path` is the root itself,
 * so the UI can decide whether an "up" affordance is available.
 */
export interface DirListing {
  root: string
  path: string
  parent: string | null
  entries: FileEntry[]
}

/** Returned by {@link DesktopApi.saveFile}. */
export interface SaveFileResult {
  /** The path the content was written to (may differ after a "save as"). */
  path: string
}

/** Returned by {@link DesktopApi.renameFile}. */
export interface RenameFileResult {
  /** The new absolute path after renaming. */
  path: string
}

/**
 * The strongly typed, whitelisted surface the preload script exposes on
 * `window.api`. This is the *entire* capability set available to the renderer —
 * there is deliberately no generic `ipcRenderer`. Defined here (a dependency
 * free module) so both the preload script and the renderer can share it without
 * the renderer importing any Electron code.
 */
export interface DesktopApi {
  /** List a directory the user is allowed to browse. */
  listDir(dirPath?: string): Promise<DirListing>
  /** Read a UTF-8 text file inside the sandbox. */
  readFile(filePath: string): Promise<string>
  /** Write UTF-8 text to a file inside the sandbox. */
  saveFile(filePath: string, content: string): Promise<SaveFileResult>
  /** Rename a file within its own directory (single path segment only). */
  renameFile(filePath: string, nextName: string): Promise<RenameFileResult>
  /** Show the native "save as" dialog; returns the chosen path or null. */
  showSaveDialog(defaultName?: string): Promise<string | null>
  /** The user's Documents directory (the default sandbox root). */
  getDocumentsPath(): Promise<string>
  /** Open an http(s) link in the system browser. */
  openExternal(url: string): Promise<boolean>
  /**
   * Subscribe to the "window is trying to close" event. The callback must call
   * `respondClose(true)` to allow the close or `respondClose(false)` to abort.
   * Returns an unsubscribe function.
   */
  onBeforeClose(callback: () => void): () => void
  /** Answer a pending close request. */
  respondClose(shouldClose: boolean): void
}
