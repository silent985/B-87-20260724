import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Layout,
  Button,
  Input,
  message,
  Tree,
  Empty,
  Modal,
  Space,
  Tooltip,
} from 'antd';
import {
  FolderOpenOutlined,
  FileMarkdownOutlined,
  SaveOutlined,
  FolderAddOutlined,
  FileAddOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import type { TreeProps } from 'antd/es/tree';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FileItem } from './types';
import { createLastWin } from './utils/lastWin';
import { baseName, dirName, ensureMdExtension, joinPath } from './utils/path';
import './App.css';

const { Header, Sider, Content } = Layout;
const { TextArea } = Input;

interface AppTreeNode {
  title: string;
  key: string;
  icon: React.ReactNode;
  isLeaf: boolean;
  isDir: boolean;
}

interface UnsavedModalState {
  title: string;
  onSave: () => void | Promise<void>;
  onDiscard: () => void | Promise<void>;
}

const App: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [savedContent, setSavedContent] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('Untitled');
  const [loading, setLoading] = useState(false);
  const [unsavedModal, setUnsavedModal] = useState<UnsavedModalState | null>(null);

  const dirty = content !== savedContent;

  const fileLoader = useMemo(() => createLastWin<string>(), []);
  const dirLoader = useMemo(() => createLastWin<FileItem[]>(), []);
  const contentRef = useRef(content);
  const savedContentRef = useRef(savedContent);
  const currentFileRef = useRef(currentFile);
  const fileNameRef = useRef(fileName);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  useEffect(() => {
    savedContentRef.current = savedContent;
  }, [savedContent]);
  useEffect(() => {
    currentFileRef.current = currentFile;
  }, [currentFile]);
  useEffect(() => {
    fileNameRef.current = fileName;
  }, [fileName]);

  const listDir = useCallback(
    async (dirPath: string) => {
      try {
        setLoading(true);
        const result = await dirLoader.run(() => window.markdownApi.listDir(dirPath));
        if (result === null) return;
        setFiles(result);
        setCurrentPath(dirPath);
      } catch (e) {
        message.error('加载目录失败');
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [dirLoader]
  );

  useEffect(() => {
    const init = async () => {
      try {
        const defaultPath = await window.markdownApi.getAppPath();
        listDir(defaultPath);
      } catch (e) {
        console.error('Failed to get default path', e);
      }
    };
    init();
  }, [listDir]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (contentRef.current !== savedContentRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    const unsub = window.markdownApi.onMainMessage(() => {});
    return unsub;
  }, []);

  const performLoadFile = useCallback(
    async (filePath: string) => {
      try {
        setLoading(true);
        const result = await fileLoader.run(() => window.markdownApi.readFile(filePath));
        if (result === null) return;
        setContent(result);
        setSavedContent(result);
        setCurrentFile(filePath);
        setFileName(baseName(filePath));
      } catch {
        message.error('加载文件失败');
      } finally {
        setLoading(false);
      }
    },
    [fileLoader]
  );

  const performSave = useCallback(async (): Promise<boolean> => {
    let targetPath = currentFileRef.current;

    if (!targetPath) {
      try {
        const result = await window.markdownApi.showSaveDialog(fileNameRef.current || 'Untitled');
        if (result.canceled || !result.filePath) {
          return false;
        }
        targetPath = result.filePath;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        message.error(`创建文件失败: ${msg}`);
        return false;
      }
    } else {
      const dir = dirName(targetPath);
      const newName = ensureMdExtension(fileNameRef.current);
      const candidatePath = joinPath(dir, newName);
      if (candidatePath !== targetPath) {
        try {
          await window.markdownApi.writeFile(candidatePath, contentRef.current);
          try {
            await window.markdownApi.deleteFile(targetPath);
          } catch {
            // old file deletion failed; new file already written
          }
          targetPath = candidatePath;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          message.error(`重命名文件失败: ${msg}`);
          return false;
        }
      }
    }

    try {
      await window.markdownApi.writeFile(targetPath, contentRef.current);
      setSavedContent(contentRef.current);
      setCurrentFile(targetPath);
      setFileName(baseName(targetPath));
      const dir = dirName(targetPath);
      if (dir) {
        await listDir(dir);
      }
      message.success('文件已保存');
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      message.error(`保存文件失败: ${msg}`);
      return false;
    }
  }, [listDir]);

  const confirmDiscard = useCallback(
    (title: string, onProceed: () => void | Promise<void>) => {
      if (contentRef.current === savedContentRef.current) {
        onProceed();
        return;
      }
      setUnsavedModal({
        title,
        onSave: async () => {
          await performSave();
          setUnsavedModal(null);
          await onProceed();
        },
        onDiscard: () => {
          setUnsavedModal(null);
          onProceed();
        },
      });
    },
    [performSave]
  );

  const handleSaveClick = useCallback(() => {
    void performSave();
  }, [performSave]);

  const handleSelectFile = useCallback(
    (filePath: string) => {
      confirmDiscard('切换文件', () => {
        fileLoader.invalidate();
        void performLoadFile(filePath);
      });
    },
    [confirmDiscard, fileLoader, performLoadFile]
  );

  const handleEnterDir = useCallback(
    (dirPath: string) => {
      confirmDiscard('切换目录', () => {
        dirLoader.invalidate();
        void listDir(dirPath);
      });
    },
    [confirmDiscard, dirLoader, listDir]
  );

  const handleGoUp = useCallback(() => {
    if (!currentPath) return;
    const parent = dirName(currentPath);
    if (!parent || parent === currentPath) return;
    confirmDiscard('返回上级目录', () => {
      dirLoader.invalidate();
      void listDir(parent);
    });
  }, [currentPath, confirmDiscard, dirLoader, listDir]);

  const handleNewFile = useCallback(() => {
    confirmDiscard('新建文件', () => {
      fileLoader.invalidate();
      setContent('');
      setSavedContent('');
      setCurrentFile(null);
      setFileName('Untitled.md');
    });
  }, [confirmDiscard, fileLoader]);

  const handleOpenFolder = useCallback(async () => {
    try {
      const result = await window.markdownApi.showOpenDialog();
      if (!result.canceled && result.filePaths.length > 0) {
        const proceed = () => {
          dirLoader.invalidate();
          void listDir(result.filePaths[0]);
        };
        if (contentRef.current !== savedContentRef.current) {
          confirmDiscard('打开文件夹', proceed);
        } else {
          proceed();
        }
      }
    } catch (e) {
      console.error(e);
      message.error('打开文件夹失败');
    }
  }, [confirmDiscard, dirLoader, listDir]);

  const onTreeSelect: TreeProps['onSelect'] = (_keys, info) => {
    const node = info.node as unknown as AppTreeNode;
    const nodePath = node.key;
    if (nodePath === '__up__') {
      handleGoUp();
      return;
    }
    if (node.isDir) {
      handleEnterDir(nodePath);
    } else {
      handleSelectFile(nodePath);
    }
  };

  const parentPath = currentPath ? dirName(currentPath) : '';
  const canGoUp = !!parentPath && parentPath !== currentPath;

  const treeData = useMemo<AppTreeNode[]>(() => {
    const items: AppTreeNode[] = [];
    if (canGoUp) {
      items.push({
        title: '..',
        key: '__up__',
        icon: <ArrowUpOutlined />,
        isLeaf: true,
        isDir: false,
      });
    }
    for (const f of files) {
      items.push({
        title: f.name,
        key: f.path,
        icon: f.isDirectory ? <FolderOpenOutlined /> : <FileMarkdownOutlined />,
        isLeaf: !f.isDirectory,
        isDir: f.isDirectory,
      });
    }
    return items;
  }, [files, canGoUp]);

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider
        width={260}
        theme="light"
        style={{
          borderRight: '1px solid #f0f0f0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            fontWeight: 'bold',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>文件浏览器</span>
          <Space size={4}>
            <Tooltip title="新建文件">
              <Button size="small" icon={<FileAddOutlined />} onClick={handleNewFile} />
            </Tooltip>
            <Tooltip title="打开文件夹">
              <Button size="small" icon={<FolderAddOutlined />} onClick={handleOpenFolder} />
            </Tooltip>
          </Space>
        </div>
        <div style={{ padding: '6px 16px', fontSize: 12, color: '#888', wordBreak: 'break-all' }}>
          {currentPath || '未选择目录'}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {files.length > 0 || canGoUp ? (
            <Tree
              showIcon
              blockNode
              treeData={treeData}
              onSelect={onTreeSelect}
              selectedKeys={currentFile ? [currentFile] : []}
            />
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="无文件"
              style={{ marginTop: 24 }}
            />
          )}
          {loading && (
            <div style={{ padding: 8, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          )}
        </div>
      </Sider>
      <Layout style={{ flex: 1, minWidth: 0 }}>
        <Header
          style={{
            background: '#fff',
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <Input
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            style={{ width: 360, fontSize: '1.1em', fontWeight: 'bold' }}
            variant="borderless"
            placeholder="文件名"
            suffix={dirty ? <span style={{ color: '#faad14', fontSize: 18 }}>●</span> : null}
          />
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveClick}>
            保存
          </Button>
        </Header>
        <Content
          style={{
            padding: '24px',
            background: '#fff',
            display: 'flex',
            gap: '12px',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ flex: 1, resize: 'none', height: '100%' }}
              placeholder="在此输入 Markdown..."
            />
          </div>
          <div
            style={{
              flex: 1,
              border: '1px solid #d9d9d9',
              borderRadius: '6px',
              padding: '12px',
              overflow: 'auto',
              height: '100%',
              minWidth: 0,
            }}
          >
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        </Content>
      </Layout>
      <Modal
        open={!!unsavedModal}
        title={unsavedModal?.title}
        onCancel={() => setUnsavedModal(null)}
        footer={[
          <Button key="cancel" onClick={() => setUnsavedModal(null)}>
            取消
          </Button>,
          <Button key="discard" onClick={() => void unsavedModal?.onDiscard()}>
            不保存
          </Button>,
          <Button key="save" type="primary" onClick={() => void unsavedModal?.onSave()}>
            保存
          </Button>,
        ]}
      >
        <p>当前文件有未保存的更改，是否保存？</p>
      </Modal>
    </Layout>
  );
};

export default App;
