export interface FileItem {
  name: string;
  isDirectory: boolean;
  path: string;
}

export interface SaveDialogResult {
  filePath: string | null;
  canceled: boolean;
}

export interface OpenDialogResult {
  filePaths: string[];
  canceled: boolean;
}

export interface MarkdownApi {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listDir(path: string): Promise<FileItem[]>;
  getAppPath(): Promise<string>;
  showSaveDialog(defaultPath?: string): Promise<SaveDialogResult>;
  showOpenDialog(): Promise<OpenDialogResult>;
  openExternal(url: string): Promise<void>;
  onMainMessage(handler: (message: string) => void): () => void;
}

declare global {
  interface Window {
    markdownApi: MarkdownApi;
  }
}
