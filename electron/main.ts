import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import {
  isPathWithinDirReal,
  validateFilePath,
  validateContent,
  validateDirPath,
  validateOptionalFilePath,
  validateBoolean,
  validateArgCount,
  validateSenderUrl,
  isTrustedExternalUrl,
  isAllowedNavigation,
} from './security'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const APP_ENTRY_URL = VITE_DEV_SERVER_URL
  ? VITE_DEV_SERVER_URL
  : `file://${path.join(process.env.DIST as string, 'index.html')}`

let win: BrowserWindow | null
let allowedRootDir = ''
let savedResultResolve: ((success: boolean) => void) | null = null

function validateSender(event: Electron.IpcMainInvokeEvent): void {
  const frame = event.senderFrame
  if (!frame) {
    throw new Error('Blocked IPC: no sender frame')
  }
  validateSenderUrl(frame.url, VITE_DEV_SERVER_URL, APP_ENTRY_URL)
}

async function ensureAllowedDir(fileOrDirPath: string): Promise<void> {
  if (!allowedRootDir) {
    allowedRootDir = app.getPath('documents')
  }
  const resolved = path.resolve(fileOrDirPath)
  const ok = await isPathWithinDirReal(resolved, allowedRootDir)
  if (!ok) {
    throw new Error(`Access denied: path "${fileOrDirPath}" is outside the allowed directory`)
  }
}

async function validateAndResolveFilePath(filePath: unknown): Promise<string> {
  validateFilePath(filePath)
  const resolved = path.resolve(filePath)
  await ensureAllowedDir(resolved)
  return resolved
}

async function validateAndResolveDirPath(dirPath: unknown): Promise<string> {
  validateDirPath(dirPath)
  const resolved = path.resolve(dirPath)
  await ensureAllowedDir(resolved)
  return resolved
}

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC as string, 'vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedExternalUrl(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (isAllowedNavigation(navigationUrl, VITE_DEV_SERVER_URL, APP_ENTRY_URL)) {
      return
    }
    event.preventDefault()
    try {
      const parsedUrl = new URL(navigationUrl)
      if (['http:', 'https:', 'mailto:'].includes(parsedUrl.protocol)) {
        shell.openExternal(navigationUrl)
      }
    } catch {
      // Invalid URL, silently block
    }
  })

  let closeInProgress = false
  let closeConfirmed = false

  win.on('close', (event) => {
    if (closeConfirmed || !win) {
      return
    }
    event.preventDefault()

    if (closeInProgress) return
    closeInProgress = true

    ;(async () => {
      try {
        const hasUnsavedChanges = (await win!.webContents.executeJavaScript(
          'window.markdownAPI ? window.markdownAPI.hasUnsavedChanges() : false'
        )) as boolean

        if (!hasUnsavedChanges) {
          closeConfirmed = true
          win!.destroy()
          return
        }

        const result = await dialog.showMessageBox(win!, {
          type: 'warning',
          buttons: ['保存', '不保存', '取消'],
          defaultId: 0,
          cancelId: 2,
          title: '未保存的更改',
          message: '您有未保存的更改，是否要保存？',
          noLink: true,
        })

        if (result.response === 2) {
          closeInProgress = false
          return
        }

        if (result.response === 1) {
          closeConfirmed = true
          win!.destroy()
          return
        }

        savedResultResolve = null
        const saveResultPromise = new Promise<boolean>((resolve) => {
          savedResultResolve = resolve
        })

        win!.webContents.send('save-and-close')

        const saveSuccess = await saveResultPromise
        savedResultResolve = null

        if (saveSuccess) {
          closeConfirmed = true
          win!.destroy()
        } else {
          closeInProgress = false
        }
      } catch {
        closeConfirmed = true
        win!.destroy()
      }
    })()
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(process.env.DIST as string, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  allowedRootDir = app.getPath('documents')

  ipcMain.handle('read-file', async (event, filePath) => {
    validateArgCount([filePath], 1, 1)
    validateSender(event)
    const resolvedPath = await validateAndResolveFilePath(filePath)
    const stats = await fs.stat(resolvedPath)
    if (!stats.isFile()) {
      throw new Error('Not a regular file')
    }
    return fs.readFile(resolvedPath, 'utf-8')
  })

  ipcMain.handle('save-file', async (event, filePath, content) => {
    validateArgCount([filePath, content], 2, 2)
    validateSender(event)
    const resolvedPath = await validateAndResolveFilePath(filePath)
    validateContent(content)
    const dir = path.dirname(resolvedPath)
    await ensureAllowedDir(dir)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(resolvedPath, content, 'utf-8')
    return true
  })

  ipcMain.handle('list-dir', async (event, dirPath) => {
    validateArgCount([dirPath], 1, 1)
    validateSender(event)
    const resolvedPath = await validateAndResolveDirPath(dirPath)
    const stats = await fs.stat(resolvedPath)
    if (!stats.isDirectory()) {
      throw new Error('Not a directory')
    }
    const entries = await fs.readdir(resolvedPath, { withFileTypes: true })
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(resolvedPath, entry.name),
      }))
  })

  ipcMain.handle('get-app-path', async (event) => {
    validateArgCount([], 0, 0)
    validateSender(event)
    return allowedRootDir
  })

  ipcMain.handle('rename-file', async (event, oldPath, newPath) => {
    validateArgCount([oldPath, newPath], 2, 2)
    validateSender(event)
    const resolvedOld = await validateAndResolveFilePath(oldPath)
    const resolvedNew = await validateAndResolveFilePath(newPath)
    const oldStats = await fs.stat(resolvedOld)
    if (!oldStats.isFile()) {
      throw new Error('Source is not a regular file')
    }
    await fs.rename(resolvedOld, resolvedNew)
    return true
  })

  ipcMain.handle('show-save-dialog', async (event, defaultPath) => {
    validateArgCount([defaultPath], 0, 1)
    validateSender(event)
    validateOptionalFilePath(defaultPath)
    let savePath = defaultPath
    if (typeof savePath === 'string' && !path.isAbsolute(savePath)) {
      savePath = path.join(allowedRootDir, savePath)
    }
    if (typeof savePath === 'string') {
      await ensureAllowedDir(savePath)
    }
    const options: Electron.SaveDialogOptions = {
      defaultPath: typeof savePath === 'string' ? savePath : allowedRootDir,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    }
    const focusedWin = BrowserWindow.getFocusedWindow()
    const result = focusedWin
      ? await dialog.showSaveDialog(focusedWin, options)
      : await dialog.showSaveDialog(options)

    if (result.filePath) {
      await ensureAllowedDir(result.filePath)
    }
    return result.filePath ?? null
  })

  ipcMain.handle('save-result', async (event, success) => {
    validateArgCount([success], 1, 1)
    validateSender(event)
    validateBoolean(success, 'save result')
    if (savedResultResolve) {
      savedResultResolve(success)
    }
    return true
  })

  ipcMain.handle('close-window', async (event) => {
    validateArgCount([], 0, 0)
    validateSender(event)
    const sourceWin = BrowserWindow.fromWebContents(event.sender)
    if (sourceWin) {
      sourceWin.destroy()
    }
    return true
  })

  createWindow()
})
