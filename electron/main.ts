import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  SecurityError,
  validateString,
  validateDirPath,
  validateFilePath,
  validateNewFilePath,
  isTrustedUrl,
  sanitizeFileName,
  validateIpcSender,
  urlOrigin,
  isSameOrigin,
} from './security';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
  ? (process.env.DIST as string)
  : path.join(__dirname, '../public');

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

const CSP_HEADER = VITE_DEV_SERVER_URL
  ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' ws: http: https:; font-src 'self' data:; media-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'"
  : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self' data:; media-src 'self'; object-src 'none'; base-uri 'self'; frame-src 'none'";

const TRUSTED_ORIGINS: readonly string[] = VITE_DEV_SERVER_URL
  ? [urlOrigin(VITE_DEV_SERVER_URL)].filter((o): o is string => o !== null)
  : ['file://'];

const USER_GRANTED_DIRS = new Set<string>();

function getAllowedRoots(): string[] {
  const roots = [app.getPath('documents')];
  for (const dir of USER_GRANTED_DIRS) {
    if (!roots.includes(dir)) {
      roots.push(dir);
    }
  }
  return roots;
}

function grantDirectory(dirPath: string): void {
  const resolved = path.resolve(dirPath);
  USER_GRANTED_DIRS.add(resolved);
}

const windows = new Set<BrowserWindow>();

function isValidWebContents(wc: Electron.WebContents): boolean {
  for (const w of windows) {
    if (!w.isDestroyed() && w.webContents.id === wc.id) {
      return true;
    }
  }
  return false;
}

function applySecurityHeaders(window: BrowserWindow) {
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP_HEADER],
      },
    });
  });
}

function preventNavigation(window: BrowserWindow) {
  window.webContents.on('will-navigate', (event, url) => {
    const currentUrl = window.webContents.getURL();
    if (url === currentUrl) return;
    if (isSameOrigin(url, TRUSTED_ORIGINS)) return;
    event.preventDefault();
    if (isTrustedUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-redirect', (event, url) => {
    if (isSameOrigin(url, TRUSTED_ORIGINS)) return;
    event.preventDefault();
    if (isTrustedUrl(url)) {
      shell.openExternal(url).catch(() => {});
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC as string, 'vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  });

  windows.add(win);
  win.on('closed', () => {
    windows.delete(win);
  });

  applySecurityHeaders(win);
  preventNavigation(win);

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('main:message', new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(process.env.DIST as string, 'index.html'));
  }

  return win;
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function wrapHandler<T extends unknown[], R>(
  handler: (event: Electron.IpcMainInvokeEvent, ...args: T) => Promise<R>
) {
  return async (event: Electron.IpcMainInvokeEvent, ...args: T): Promise<R> => {
    try {
      validateIpcSender(event, {
        expectedOrigins: TRUSTED_ORIGINS,
        isValidWindow: isValidWebContents,
      });
      return await handler(event, ...args);
    } catch (error) {
      if (error instanceof SecurityError) {
        console.warn(`[Security] ${error.message}`);
      } else {
        console.error('[IPC Error]', error);
      }
      throw error;
    }
  };
}

app.whenReady().then(() => {
  ipcMain.handle(
    'file:read',
    wrapHandler(async (_event, filePath: unknown) => {
      const roots = getAllowedRoots();
      const resolved = validateFilePath(filePath, roots);
      return fs.promises.readFile(resolved, 'utf-8');
    })
  );

  ipcMain.handle(
    'file:write',
    wrapHandler(async (_event, filePath: unknown, content: unknown) => {
      if (typeof content !== 'string') {
        throw new SecurityError('Invalid parameter: content must be a string');
      }
      const roots = getAllowedRoots();
      const resolved = validateNewFilePath(filePath, roots);
      await fs.promises.writeFile(resolved, content, 'utf-8');
    })
  );

  ipcMain.handle(
    'file:rename',
    wrapHandler(async (_event, oldPath: unknown, newPath: unknown) => {
      const roots = getAllowedRoots();
      const oldResolved = validateFilePath(oldPath, roots);
      const newResolved = validateNewFilePath(newPath, roots);
      if (oldResolved === newResolved) return;
      await fs.promises.rename(oldResolved, newResolved);
    })
  );

  ipcMain.handle(
    'file:delete',
    wrapHandler(async (_event, filePath: unknown) => {
      const roots = getAllowedRoots();
      const resolved = validateFilePath(filePath, roots);
      await fs.promises.unlink(resolved);
    })
  );

  ipcMain.handle(
    'dir:list',
    wrapHandler(async (_event, dirPath: unknown) => {
      const roots = getAllowedRoots();
      const resolved = validateDirPath(dirPath, roots);
      const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
      const items = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(resolved, entry.name);
          let isDir = entry.isDirectory();
          if (entry.isSymbolicLink()) {
            try {
              const stat = await fs.promises.stat(fullPath);
              isDir = stat.isDirectory();
            } catch {
              isDir = false;
            }
          }
          return {
            name: entry.name,
            isDirectory: isDir,
            path: fullPath,
          };
        })
      );
      items.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      return items;
    })
  );

  ipcMain.handle(
    'app:get-path',
    wrapHandler(async () => {
      return app.getPath('documents');
    })
  );

  ipcMain.handle(
    'dialog:save',
    wrapHandler(async (_event, defaultPath: unknown) => {
      const parentWindow = BrowserWindow.fromWebContents(_event.sender);
      let defaultName = 'Untitled.md';
      if (typeof defaultPath === 'string' && defaultPath.length > 0) {
        defaultName = sanitizeFileName(defaultPath);
        if (!defaultName.toLowerCase().endsWith('.md')) {
          defaultName += '.md';
        }
      }
      const documentsPath = app.getPath('documents');
      const options: Electron.SaveDialogOptions = {
        defaultPath: path.join(documentsPath, defaultName),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        properties: ['showOverwriteConfirmation'],
      };
      const result = parentWindow
        ? await dialog.showSaveDialog(parentWindow, options)
        : await dialog.showSaveDialog(options);
      if (!result.canceled && result.filePath) {
        const dir = path.dirname(result.filePath);
        grantDirectory(dir);
      }
      return {
        filePath: result.filePath ?? null,
        canceled: result.canceled,
      };
    })
  );

  ipcMain.handle(
    'dialog:open',
    wrapHandler(async (_event) => {
      const parentWindow = BrowserWindow.fromWebContents(_event.sender);
      const options: Electron.OpenDialogOptions = {
        properties: ['openDirectory'],
      };
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options);
      if (!result.canceled && result.filePaths.length > 0) {
        grantDirectory(result.filePaths[0]);
      }
      return {
        filePaths: result.filePaths,
        canceled: result.canceled,
      };
    })
  );

  ipcMain.handle(
    'shell:open-external',
    wrapHandler(async (_event, url: unknown) => {
      const rawUrl = validateString(url, 'url', 2048);
      if (!isTrustedUrl(rawUrl)) {
        throw new SecurityError(`Untrusted URL: ${rawUrl}`);
      }
      await shell.openExternal(rawUrl);
    })
  );

  createWindow();
});