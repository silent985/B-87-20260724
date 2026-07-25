export interface FileItem {
  name: string;
  isDirectory: boolean;
  path: string;
}

export interface IpcRenderer {
  invoke(channel: 'read-file', path: string): Promise<string>;
  invoke(channel: 'save-file', path: string, content: string): Promise<boolean>;
  invoke(channel: 'list-dir', path: string): Promise<FileItem[]>;
  invoke(channel: 'get-app-path'): Promise<string>;
  invoke(channel: 'show-save-dialog', defaultPath?: string): Promise<string | null>;
}

declare global {
  interface Window {
    ipcRenderer: IpcRenderer;
  }
}
