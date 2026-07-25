import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import type { IpcMainInvokeEvent, IpcMainEvent } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { IpcChannels } from './ipc-contract'
import type { DirListing, FileEntry } from './ipc-contract'
import { isSafeFileName, isTrustedExternalUrl } from './pathGuard'
import {
  canonicalizeRoots,
  isRealPathWithinRoots,
  resolveExistingWithinRoots,
  resolveNewPathWithinRoots,
} from './fsGuard'
import { assertString } from './ipcValidate'
import { decideNavigation, decideWindowOpen } from './navigationPolicy'
import { isTrustedSenderFrame } from './senderGuard'
import { CloseGuard } from './closeGuard'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─ dist
// │ ├─┬─ electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │ ├── index.html
// │ ├── ...other-static-files-from-public
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(__dirname, '../public')

let win: BrowserWindow | null = null

/**
 * Guards the window `close` handshake. Reset for every window created (see
 * {@link createWindow}) so a re-opened window on macOS still prompts for
 * unsaved changes rather than inheriting a stale "already permitted" state.
 */
const closeGuard = new CloseGuard()

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

/**
 * The URL the window was loaded with. Used to decide whether a navigation
 * target is our own application document (allowed) or a remote page (blocked).
 */
const appUrl = VITE_DEV_SERVER_URL
  ? VITE_DEV_SERVER_URL
  : `file://${path.join(process.env.DIST, 'index.html')}`

/**
 * Markdown extensions the file browser surfaces. Directories are always shown
 * so the user can navigate; other files are hidden to keep the tree focused.
 */
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown'])

/**
 * The set of directories the renderer is allowed to read from / write to.
 *
 * Seeded with the user's Documents folder on startup. When the user explicitly
 * picks a location through the native "save as" dialog we grant access to that
 * directory too (an intentional, user-driven trust decision). Every IPC handler
 * canonicalises (realpath) paths and validates them against this list before
 * touching the filesystem, so neither a malicious renderer nor a symlink/
 * junction planted inside a root can read or write arbitrary files.
 */
const sandboxRoots = new Set<string>()

function grantDirectory(dir: string): void {
  sandboxRoots.add(path.resolve(dir))
}

function allowedRoots(): string[] {
  return [...sandboxRoots]
}

/**
 * Only accept IPC that originates from our own window's top frame, loaded from
 * the expected app URL. This blocks IPC from injected iframes or any web
 * content that is not the application itself.
 */
function isTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): boolean {
  const isMainSender = !!win && event.sender === win.webContents
  return isTrustedSenderFrame(appUrl, isMainSender, event.senderFrame?.url)
}

function assertTrustedSender(event: IpcMainInvokeEvent | IpcMainEvent): void {
  if (!isTrustedSender(event)) {
    throw new Error('Untrusted IPC sender')
  }
}

async function buildListing(dirPath: string): Promise<DirListing> {
  // Canonicalise + sandbox-check the directory before reading it.
  const resolved = await resolveExistingWithinRoots(allowedRoots(), dirPath)
  const dirents = await fs.promises.readdir(resolved, { withFileTypes: true })
  const entries: FileEntry[] = dirents
    .filter((dirent) => {
      if (dirent.isDirectory()) {
        return true
      }
      return MARKDOWN_EXTENSIONS.has(path.extname(dirent.name).toLowerCase())
    })
    .map((dirent) => ({
      name: dirent.name,
      isDirectory: dirent.isDirectory(),
      path: path.join(resolved, dirent.name),
    }))
    .sort((a, b) => {
      // Directories first, then case-insensitive name order.
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

  // Offer a parent only while its real path is still inside an allowed root.
  const parentCandidate = path.dirname(resolved)
  const parent =
    parentCandidate !== resolved &&
    (await isRealPathWithinRoots(allowedRoots(), parentCandidate))
      ? parentCandidate
      : null

  // Report the allowed (canonical) root that contains this directory so the
  // renderer knows the sandbox boundary it is in.
  const realRoots = await canonicalizeRoots(allowedRoots())
  const containingRoot = realRoots.find((root) => resolved === root || resolved.startsWith(root + path.sep)) ?? resolved

  return { root: containingRoot, path: resolved, parent, entries }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.getDocumentsPath, (event) => {
    assertTrustedSender(event)
    return app.getPath('documents')
  })

  ipcMain.handle(IpcChannels.listDir, async (event, dirPath?: unknown) => {
    assertTrustedSender(event)
    const target =
      dirPath === undefined || dirPath === null
        ? app.getPath('documents')
        : assertString(dirPath, 'dirPath')
    return buildListing(target)
  })

  ipcMain.handle(IpcChannels.readFile, async (event, filePath: unknown) => {
    assertTrustedSender(event)
    const resolved = await resolveExistingWithinRoots(
      allowedRoots(),
      assertString(filePath, 'filePath'),
    )
    return fs.promises.readFile(resolved, 'utf-8')
  })

  ipcMain.handle(IpcChannels.saveFile, async (event, filePath: unknown, content: unknown) => {
    assertTrustedSender(event)
    const requested = assertString(filePath, 'filePath')
    const text = assertString(content, 'content')
    // Existing file: follow its real path. New file: validate the real parent
    // directory (and write through it) so a symlinked path cannot escape.
    let resolved: string
    if (fs.existsSync(requested)) {
      resolved = await resolveExistingWithinRoots(allowedRoots(), requested)
    } else {
      resolved = await resolveNewPathWithinRoots(allowedRoots(), requested)
    }
    await fs.promises.writeFile(resolved, text, 'utf-8')
    return { path: resolved }
  })

  ipcMain.handle(IpcChannels.renameFile, async (event, filePath: unknown, nextName: unknown) => {
    assertTrustedSender(event)
    const name = assertString(nextName, 'nextName')
    if (!isSafeFileName(name)) {
      throw new Error('Invalid file name')
    }
    // Resolve the source through symlinks and confirm it is in the sandbox.
    const resolved = await resolveExistingWithinRoots(
      allowedRoots(),
      assertString(filePath, 'filePath'),
    )
    // The destination shares the source's real directory; validate it as a new
    // path so its (canonical) parent must also be inside the sandbox.
    const nextPath = await resolveNewPathWithinRoots(
      allowedRoots(),
      path.join(path.dirname(resolved), name),
    )
    await fs.promises.rename(resolved, nextPath)
    return { path: nextPath }
  })

  ipcMain.handle(IpcChannels.showSaveDialog, async (event, defaultName?: unknown) => {
    assertTrustedSender(event)
    const documents = app.getPath('documents')
    const name =
      typeof defaultName === 'string' && isSafeFileName(defaultName) ? defaultName : 'Untitled.md'
    const options = {
      defaultPath: path.join(documents, name),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) {
      return null
    }
    // The user explicitly chose this location — grant access to its directory.
    grantDirectory(path.dirname(result.filePath))
    return result.filePath
  })

  ipcMain.handle(IpcChannels.openExternal, async (event, url: unknown) => {
    assertTrustedSender(event)
    const link = assertString(url, 'url')
    if (!isTrustedExternalUrl(link)) {
      throw new Error('Refused to open untrusted URL')
    }
    await shell.openExternal(link)
    return true
  })

  // The renderer answers a pending close request here (see the window `close`
  // handler). Registered once, alongside the other handlers.
  ipcMain.on(IpcChannels.respondClose, (event: IpcMainEvent, shouldClose: unknown) => {
    if (!isTrustedSender(event)) {
      return
    }
    if (shouldClose === true) {
      closeGuard.permit()
      win?.close()
    }
  })
}

/**
 * Prevent the renderer (or any injected content) from navigating the window
 * away from our app, and route legitimate external links to the system browser
 * instead of loading them inside the trusted window.
 */
function applyNavigationPolicy(contents: Electron.WebContents): void {
  contents.on('will-navigate', (event, url) => {
    const decision = decideNavigation(appUrl, url)
    if (decision === 'allow') {
      return
    }
    event.preventDefault()
    if (decision === 'external') {
      void shell.openExternal(url)
    }
  })

  contents.setWindowOpenHandler(({ url }) => {
    const decision = decideWindowOpen(url)
    if (decision.openExternal) {
      void shell.openExternal(url)
    }
    // Never let the app spawn its own Electron windows for arbitrary content.
    return { action: 'deny' }
  })

  // Block attaching webviews entirely.
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

function createWindow() {
  // A fresh window must always re-check for unsaved changes before closing,
  // even if a previous window had been permitted to close (macOS re-open).
  closeGuard.reset()

  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC as string, 'vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      // Security baseline: no Node in the renderer, isolated context, sandboxed.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  applyNavigationPolicy(win.webContents)

  // Intercept close so the renderer can warn about unsaved changes. The
  // renderer answers on IpcChannels.respondClose; until then we hold the close.
  win.on('close', (event) => {
    if (closeGuard.canClose || !win) {
      return
    }
    event.preventDefault()
    win.webContents.send(IpcChannels.beforeClose)
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(process.env.DIST as string, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  win = null
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
  grantDirectory(app.getPath('documents'))
  registerIpcHandlers()
  createWindow()
})
