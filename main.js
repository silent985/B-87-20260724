import { app as d, BrowserWindow as W, ipcMain as u, dialog as T, shell as y } from "electron";
import { fileURLToPath as k } from "node:url";
import o from "node:path";
import h from "node:fs";
const c = {
  listDir: "fs:list-dir",
  readFile: "fs:read-file",
  saveFile: "fs:save-file",
  renameFile: "fs:rename-file",
  showSaveDialog: "dialog:show-save",
  getDocumentsPath: "app:documents-path",
  openExternal: "shell:open-external",
  /** main -> renderer: the user tried to close the window. */
  beforeClose: "app:before-close",
  /** renderer -> main: proceed with (or abort) closing the window. */
  respondClose: "app:respond-close"
};
function A(e, t) {
  const n = o.resolve(e), r = o.resolve(t);
  if (r === n)
    return !0;
  const i = o.relative(n, r);
  return i.length > 0 && !i.startsWith("..") && !o.isAbsolute(i);
}
function P(e, t) {
  return e.some((n) => A(n, t));
}
function E(e) {
  return e.length === 0 || e === "." || e === ".." ? !1 : o.basename(e) === e;
}
function x(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  return t.protocol === "https:" || t.protocol === "http:";
}
function F(e, t) {
  let n, r;
  try {
    n = new URL(e), r = new URL(t);
  } catch {
    return !1;
  }
  return n.protocol === "file:" ? r.protocol === "file:" && r.pathname === n.pathname : r.origin === n.origin;
}
const g = (e) => h.promises.realpath(e);
async function R(e, t = g) {
  const n = [];
  for (const r of e)
    try {
      n.push(await t(r));
    } catch {
    }
  return n;
}
async function m(e, t, n = g) {
  const r = await n(t), i = await R(e, n);
  if (!P(i, r))
    throw new Error("Access denied: path is outside the allowed directories");
  return r;
}
async function C(e, t, n = g) {
  const r = o.basename(t);
  if (!E(r))
    throw new Error("Invalid file name");
  const i = o.dirname(o.resolve(t)), s = await n(i), I = await R(e, n);
  if (!P(I, s))
    throw new Error("Access denied: path is outside the allowed directories");
  return o.join(s, r);
}
async function N(e, t, n = g) {
  try {
    const r = await n(t), i = await R(e, n);
    return P(i, r);
  } catch {
    return !1;
  }
}
function p(e, t) {
  if (typeof e != "string")
    throw new Error(`Invalid argument: ${t} must be a string`);
  return e;
}
function M(e, t) {
  return F(e, t) ? "allow" : x(t) ? "external" : "block";
}
function O(e) {
  return { allowWindow: !1, openExternal: x(e) };
}
function B(e, t, n) {
  return !t || !n ? !1 : F(e, n);
}
class $ {
  permitted = !1;
  /** Whether a pending `close` should be allowed to proceed. */
  get canClose() {
    return this.permitted;
  }
  /** Record that the renderer authorised closing (no/for-discarded changes). */
  permit() {
    this.permitted = !0;
  }
  /**
   * Return the guard to its initial "must prompt" state. Called when a new
   * window is created so a re-opened window always re-checks for unsaved work.
   */
  reset() {
    this.permitted = !1;
  }
}
const S = o.dirname(k(import.meta.url));
process.env.DIST = o.join(S, "../dist");
process.env.VITE_PUBLIC = d.isPackaged ? process.env.DIST : o.join(S, "../public");
let a = null;
const D = new $(), v = process.env.VITE_DEV_SERVER_URL, U = v || `file://${o.join(process.env.DIST, "index.html")}`, q = /* @__PURE__ */ new Set([".md", ".markdown"]), L = /* @__PURE__ */ new Set();
function j(e) {
  L.add(o.resolve(e));
}
function f() {
  return [...L];
}
function _(e) {
  const t = !!a && e.sender === a.webContents;
  return B(U, t, e.senderFrame?.url);
}
function w(e) {
  if (!_(e))
    throw new Error("Untrusted IPC sender");
}
async function G(e) {
  const t = await m(f(), e), r = (await h.promises.readdir(t, { withFileTypes: !0 })).filter((l) => l.isDirectory() ? !0 : q.has(o.extname(l.name).toLowerCase())).map((l) => ({
    name: l.name,
    isDirectory: l.isDirectory(),
    path: o.join(t, l.name)
  })).sort((l, b) => l.isDirectory !== b.isDirectory ? l.isDirectory ? -1 : 1 : l.name.localeCompare(b.name)), i = o.dirname(t), s = i !== t && await N(f(), i) ? i : null;
  return { root: (await R(f())).find((l) => t === l || t.startsWith(l + o.sep)) ?? t, path: t, parent: s, entries: r };
}
function H() {
  u.handle(c.getDocumentsPath, (e) => (w(e), d.getPath("documents"))), u.handle(c.listDir, async (e, t) => {
    w(e);
    const n = t == null ? d.getPath("documents") : p(t, "dirPath");
    return G(n);
  }), u.handle(c.readFile, async (e, t) => {
    w(e);
    const n = await m(
      f(),
      p(t, "filePath")
    );
    return h.promises.readFile(n, "utf-8");
  }), u.handle(c.saveFile, async (e, t, n) => {
    w(e);
    const r = p(t, "filePath"), i = p(n, "content");
    let s;
    return h.existsSync(r) ? s = await m(f(), r) : s = await C(f(), r), await h.promises.writeFile(s, i, "utf-8"), { path: s };
  }), u.handle(c.renameFile, async (e, t, n) => {
    w(e);
    const r = p(n, "nextName");
    if (!E(r))
      throw new Error("Invalid file name");
    const i = await m(
      f(),
      p(t, "filePath")
    ), s = await C(
      f(),
      o.join(o.dirname(i), r)
    );
    return await h.promises.rename(i, s), { path: s };
  }), u.handle(c.showSaveDialog, async (e, t) => {
    w(e);
    const n = d.getPath("documents"), r = typeof t == "string" && E(t) ? t : "Untitled.md", i = {
      defaultPath: o.join(n, r),
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }]
    }, s = a ? await T.showSaveDialog(a, i) : await T.showSaveDialog(i);
    return s.canceled || !s.filePath ? null : (j(o.dirname(s.filePath)), s.filePath);
  }), u.handle(c.openExternal, async (e, t) => {
    w(e);
    const n = p(t, "url");
    if (!x(n))
      throw new Error("Refused to open untrusted URL");
    return await y.openExternal(n), !0;
  }), u.on(c.respondClose, (e, t) => {
    _(e) && t === !0 && (D.permit(), a?.close());
  });
}
function z(e) {
  e.on("will-navigate", (t, n) => {
    const r = M(U, n);
    r !== "allow" && (t.preventDefault(), r === "external" && y.openExternal(n));
  }), e.setWindowOpenHandler(({ url: t }) => (O(t).openExternal && y.openExternal(t), { action: "deny" })), e.on("will-attach-webview", (t) => {
    t.preventDefault();
  });
}
function V() {
  D.reset(), a = new W({
    icon: o.join(process.env.VITE_PUBLIC, "vite.svg"),
    webPreferences: {
      preload: o.join(S, "preload.mjs"),
      // Security baseline: no Node in the renderer, isolated context, sandboxed.
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0,
      webSecurity: !0
    }
  }), z(a.webContents), a.on("close", (e) => {
    D.canClose || !a || (e.preventDefault(), a.webContents.send(c.beforeClose));
  }), v ? (a.loadURL(v), a.webContents.openDevTools()) : a.loadFile(o.join(process.env.DIST, "index.html"));
}
d.on("window-all-closed", () => {
  a = null, process.platform !== "darwin" && d.quit();
});
d.on("activate", () => {
  W.getAllWindows().length === 0 && V();
});
d.whenReady().then(() => {
  j(d.getPath("documents")), H(), V();
});
