import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─ dist
// │ ├─┬─ electron
// │ │ ├── main.js
// │ │ └── preload.js
// │ ├── index.html
// │ ├── ...other-static-files-from-public
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')


let win: BrowserWindow | null

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC as string, 'vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(process.env.DIST as string, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
    // IPC Handlers
    ipcMain.handle('read-file', async (_event, filePath) => {
        try {
            return await fs.promises.readFile(filePath, 'utf-8');
        } catch (error) {
            console.error('Error reading file:', error);
            throw error;
        }
    });

    ipcMain.handle('save-file', async (_event, filePath, content) => {
        try {
            await fs.promises.writeFile(filePath, content, 'utf-8');
            return true;
        } catch (error) {
            console.error('Error saving file:', error);
            throw error;
        }
    });

    ipcMain.handle('list-dir', async (_event, dirPath) => {
        try {
            const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
            return files.map(file => ({
                name: file.name,
                isDirectory: file.isDirectory(),
                path: path.join(dirPath, file.name)
            }));
        } catch (error) {
           console.error('Error listing dir:', error);
           throw error;
        }
    });

    ipcMain.handle('get-app-path', async () => {
        return app.getPath('documents');
    });

    ipcMain.handle('show-save-dialog', async (_event, defaultPath) => {
        try {
            let savePath = defaultPath;
            if (savePath && !path.isAbsolute(savePath)) {
                savePath = path.join(app.getPath('documents'), savePath);
            }
            const win = BrowserWindow.getFocusedWindow();
            const options = {
                defaultPath: savePath,
                filters: [{ name: 'Markdown', extensions: ['md'] }]
            };
            const result = win 
                ? await dialog.showSaveDialog(win, options)
                : await dialog.showSaveDialog(options);
                
            return result.filePath;
        } catch (e) {
            console.error('Show save dialog error:', e);
            throw e;
        }
    });

    createWindow();
})
