# 本地 Markdown 桌面应用 (Markdown Local App)

基于 Electron + React + TypeScript + Vite + Ant Design 构建的安全本地 Markdown 编辑器。

## ✨ 功能特性

- **本地文件管理**：默认打开 Documents 目录，支持子目录导航和返回上级
- **实时预览**：集成 `react-markdown` + GFM，提供 GitHub 风格 Markdown 预览
- **智能保存**：
  - 编辑标题栏直接重命名已有文件
  - 新文件自动弹出"另存为"对话框
  - 保存后自动刷新文件列表
- **未保存保护**：切换文件、切换目录、关闭窗口时检测未保存更改
- **类型安全**：完全使用 TypeScript 开发，所有 IPC API 强类型

## � 安全架构

本应用采用多层安全防护，防止远程代码执行和任意文件访问：

### Preload（预加载脚本）
- **Context Isolation**：启用 `contextIsolation: true`，渲染进程无法访问 Node.js API
- **白名单 IPC**：`preload.ts` 不暴露通用 `ipcRenderer`，仅通过 `contextBridge` 暴露 `markdownAPI` 强类型方法
- **通道校验**：所有 IPC 调用经过白名单校验，非白名单通道直接抛出异常
- **类型导出**：[shared/api-types.ts](file:///d:/code/trae/gsb/20260724/B-87-bug修复-1/Charmander/shared/api-types.ts) 定义共享类型，preload 和渲染进程共享同一类型定义

### 主进程安全
- **IPC 来源校验**：
  - 开发模式：仅允许 dev server 同源（hostname + port 匹配）
  - 生产模式：仅允许应用自身入口 `file://.../dist/index.html`（精确匹配，去除 query/hash）
- **目录白名单**：所有文件操作限制在 `app.getPath('documents')` 目录内
- **Symlink 防护**：使用 `fs.realpath` 解析符号链接/ junction，防止绕过目录限制
- **路径遍历防护**：`path.relative` 检测 `../` 路径遍历攻击
- **参数严格校验**：所有 IPC 参数经过类型、长度、null 字节检查，拒绝多余参数
- **文件类型校验**：read-file 确保目标是普通文件，list-dir 确保目标是目录
- **导航拦截**：
  - `will-navigate` 阻止渲染进程导航到非信任 URL
  - `setWindowOpenHandler` 阻止 `window.open` 创建新窗口
  - 仅 `http:`/`https:`/`mailto:` 链接通过 `shell.openExternal` 在系统浏览器打开

### 文件结构

```
electron/
├── main.ts          # 主进程：窗口创建、IPC handlers、安全校验、导航拦截
├── preload.ts       # 预加载：白名单 IPC 桥接
└── security.ts      # 安全校验函数：路径校验、参数校验、来源验证
shared/
├── api-types.ts     # MarkdownAPI 共享类型定义
└── ipc-channels.ts  # IPC 通道白名单
src/
├── App.tsx          # 主应用组件（含可测试的工具函数）
├── types.ts         # 类型重导出 + Window 全局声明
└── test/            # 测试用例
```

## 🛠️ 技术栈

- **桌面运行时**: Electron
- **前端框架**: React 19
- **构建工具**: Vite 7
- **UI 组件库**: Ant Design 6
- **语言**: TypeScript 5.9
- **测试**: Vitest

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

### 运行测试

```bash
npm test
```

### Lint 和类型检查

```bash
npm run lint
npx tsc --noEmit -p tsconfig.app.json
```

### 构建应用

```bash
npm run build
```

## 🧪 竞态条件防护

应用使用以下机制防止异步竞态问题：

1. **请求序号 (Request ID)**：每次文件加载分配递增 ID，过期响应被丢弃
2. **内容快照 (Content Snapshot)**：加载/保存开始时记录内容快照，完成后比对防止覆盖用户编辑
3. **保存序号 (Save ID)**：保存操作同样使用序号，避免并发保存问题
4. **脏状态保护**：仅在保存完成且内容未变化时才清除 dirty 标记
5. **关闭流程确认**：主进程发送 `save-and-close` → 渲染进程执行保存 → 通过 `save-result` 通道返回结果 → 仅成功时关闭窗口
