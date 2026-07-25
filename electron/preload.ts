import { ipcRenderer, contextBridge } from 'electron';
import type {
  FileItem,
  SaveDialogResult,
  OpenDialogResult,
} from '../src/types';

const CHANNELS = {
  READ_FILE: 'file:read',
  WRITE_FILE: 'file:write',
  RENAME_FILE: 'file:rename',
  DELETE_FILE: 'file:delete',
  LIST_DIR: 'dir:list',
  GET_APP_PATH: 'app:get-path',
  SHOW_SAVE_DIALOG: 'dialog:save',
  SHOW_OPEN_DIALOG: 'dialog:open',
  OPEN_EXTERNAL: 'shell:open-external',
  MAIN_MESSAGE: 'main:message',
} as const;

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api = {
  readFile: (path: string): Promise<string> => invoke<string>(CHANNELS.READ_FILE, path),
  writeFile: (path: string, content: string): Promise<void> =>
    invoke<void>(CHANNELS.WRITE_FILE, path, content),
  renameFile: (oldPath: string, newPath: string): Promise<void> =>
    invoke<void>(CHANNELS.RENAME_FILE, oldPath, newPath),
  deleteFile: (path: string): Promise<void> => invoke<void>(CHANNELS.DELETE_FILE, path),
  listDir: (path: string): Promise<FileItem[]> => invoke<FileItem[]>(CHANNELS.LIST_DIR, path),
  getAppPath: (): Promise<string> =>
    invoke<string>(CHANNELS.GET_APP_PATH),
  showSaveDialog: (defaultPath?: string): Promise<SaveDialogResult> =>
    invoke<SaveDialogResult>(CHANNELS.SHOW_SAVE_DIALOG, defaultPath),
  showOpenDialog: (): Promise<OpenDialogResult> =>
    invoke<OpenDialogResult>(CHANNELS.SHOW_OPEN_DIALOG),
  openExternal: (url: string): Promise<void> => invoke<void>(CHANNELS.OPEN_EXTERNAL, url),
  onMainMessage: (handler: (message: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => handler(message);
    ipcRenderer.on(CHANNELS.MAIN_MESSAGE, listener);
    return () => {
      ipcRenderer.off(CHANNELS.MAIN_MESSAGE, listener);
    };
  },
};

contextBridge.exposeInMainWorld('markdownApi', api);

export type MarkdownApi = typeof api;
