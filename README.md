# 本地 Markdown 桌面应用 (Markdown Local App)

这是一个基于 Electron + React + TypeScript + Vite + Ant Design 构建的本地个人离线使用的 Markdown 桌面应用程序。

## ✨ 功能特性

- **本地文件管理**：默认打开 Document 目录，浏览并管理 Markdown 文件。
- **所见即所得 (预览)**：集成 `react-markdown`，提供实时的 GitHub 风格 Markdown 预览。
- **智能保存**：
    - 支持编辑标题直接重命名/新建文件。
    - 新建文件自动弹出“另存为”对话框。
    - 智能识别默认保存路径。
- **文件读写**：支持读取和保存 Markdown 文件到本地磁盘。
- **现代化 UI**：使用 Ant Design 6.1.0 构建的美观界面，适配 Flex 布局。
- **类型安全**：完全使用 TypeScript 开发。

## 🛠️ 技术栈

- **桌面运行时**: [Electron](https://www.electronjs.org/)
- **前端框架**: [React](https://react.dev/)
- **构建工具**: [Vite](https://vitejs.dev/)
- **UI 组件库**: [Ant Design](https://ant.design/)
- **语言**: [TypeScript](https://www.typescriptlang.org/)

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```
此命令将启动 Vite 开发服务器并打开 Electron 窗口。

### 3. 构建应用

```bash
npm run build
```
构建完成后，安装包将生成在 `release` 目录下（渲染进程产物在 `dist`，主进程产物在 `dist-electron`）。

## 📁 项目结构

```
├── electron/            # Electron 主进程 / 预加载 / 安全模块
│   ├── main.ts          # 主进程入口
│   ├── preload.ts       # 预加载脚本 (强类型白名单 API)
│   ├── ipc-contract.ts  # IPC 通道与共享类型 (无依赖)
│   ├── pathGuard.ts     # 纯路径/URL 校验
│   ├── fsGuard.ts       # 基于 realpath 的文件系统沙箱
│   ├── senderGuard.ts   # IPC 来源(frame)校验
│   ├── navigationPolicy.ts # 导航/新窗口决策
│   └── closeGuard.ts    # 关闭许可状态 (支持 reset)
├── src/                 # React 渲染进程源码
│   ├── App.tsx          # 主应用组件 (订阅 EditorSession)
│   ├── lib/editorSession.ts # 无头文件生命周期协调器 (竞态/串行化)
│   ├── lib/mutex.ts     # 异步互斥锁
│   └── types.ts         # 类型定义
├── test/                # Vitest 单元测试
├── dist/                # 构建产物 (渲染进程)
├── dist-electron/       # 构建产物 (主进程 / 预加载)
├── release/             # 构建产物 (安装包，独立于 dist 避免递归打包)
└── vite.config.ts       # Vite 配置
```

## 📝 开发说明

- **IPC 通信**：渲染进程只能通过预加载脚本暴露在 `window.api` 上的**强类型白名单方法**与主进程通信，接口定义在 [electron/ipc-contract.ts](electron/ipc-contract.ts)。**不再暴露通用的 `ipcRenderer`**，因此渲染进程无法调用任意通道。
- **安全边界**：
    - 渲染进程启用 `contextIsolation`、`sandbox`，并禁用 `nodeIntegration`。
    - 主进程对每一条 IPC 都校验**来源（sender + frame URL，见 [senderGuard.ts](electron/senderGuard.ts)）**、**参数类型**（[ipcValidate.ts](electron/ipcValidate.ts)）以及**允许访问的目录**。
    - **基于 realpath 的沙箱**（[fsGuard.ts](electron/fsGuard.ts)）：读/写/重命名前先用 `fs.realpath` 解析真实路径再判断是否落在允许目录内，从而阻止通过 **symlink / Windows junction** 越过允许目录；新建文件写入前校验其**真实父目录**并通过规范化父目录写入。
    - 拦截 `will-navigate` 与 `window.open`（[navigationPolicy.ts](electron/navigationPolicy.ts)），仅允许应用自身文档导航；可信的 `http(s)` 链接通过系统浏览器打开。
    - 文件重命名只允许单一路径段（禁止 `..`、路径分隔符），防止越权移动文件。
- **竞态与未保存保护**：文件生命周期由 [EditorSession](src/lib/editorSession.ts) 统一协调——切换使用单调 token 丢弃过期异步结果；保存与重命名通过 [Mutex](src/lib/mutex.ts) 串行化，且在临界区读取当前路径，避免 `onBlur` 重命名与保存/切换并发写入旧路径或覆盖过期状态；切换/进目录/关闭前存在未保存修改会弹出确认。
- **关闭协议**：主进程在 `close` 时拦截并询问渲染进程（`app:before-close` / `app:respond-close`）。关闭许可由 [CloseGuard](electron/closeGuard.ts) 管理，**每次创建窗口都会 `reset()`**，确保 macOS 重开窗口后仍会提示未保存内容。
- **构建产物隔离**：electron-builder 输出目录设为 `release`（`directories.output`），与 Vite 的 `dist` 分离，避免把打包结果递归打进 `app.asar`。
- **测试**：`npm test` 运行 Vitest（82 项），覆盖 realpath/symlink 逃逸（[fsGuard.test.ts](test/fsGuard.test.ts)）、IPC 来源与参数（[senderGuard.test.ts](test/senderGuard.test.ts) / [ipcValidate.test.ts](test/ipcValidate.test.ts)）、导航拦截（[navigationPolicy.test.ts](test/navigationPolicy.test.ts)）、重命名/保存/切换竞态（[editorSession.test.ts](test/editorSession.test.ts) / [mutex.test.ts](test/mutex.test.ts)）与关闭协议（[closeGuard.test.ts](test/closeGuard.test.ts)）。

## 📄 许可证

MIT
