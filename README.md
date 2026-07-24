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
构建完成后，安装包将生成在 `dist` 目录下。

## 📁 项目结构

```
├── electron/        # Electron 主进程和预加载脚本
│   ├── main.ts      # 主进程入口
│   └── preload.ts   # 预加载脚本 (IPC 通信)
├── src/             # React 渲染进程源码
│   ├── App.tsx      # 主应用组件
│   ├── main.tsx     # React 入口
│   └── types.ts     # 类型定义
├── dist/            # 构建产物 (渲染进程及安装包)
├── dist-electron/   # 构建产物 (主进程)
└── vite.config.ts   # Vite 配置
```

## 📝 开发说明

- **IPC 通信**：渲染进程通过 `window.ipcRenderer.invoke` 与主进程通信，API 定义在 `src/types.ts` 和 `electron/preload.ts` 中。
- **安全性**：禁用了 Node.js 集成，仅通过 ContextBridge 暴露必要的 API。

## 📄 许可证

MIT
