import React, { useState, useEffect } from 'react';
import { Layout, Button, Input, message, Tree, Empty } from 'antd';
import { FolderOpenOutlined, FileMarkdownOutlined, SaveOutlined } from '@ant-design/icons';
import type { DirectoryTreeProps } from 'antd/es/tree';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { FileItem } from './types';
import './App.css';

const { Header, Sider, Content } = Layout;
const { TextArea } = Input;
const { DirectoryTree } = Tree;

const App: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [content, setContent] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('Untitled');

  useEffect(() => {
    // Initial load - maybe load a default directory or ask user?
    // For now, let's try to list the current directory or home (needs proper path from main process)
    // Actually, we can just start empty and let user "Open Folder" (implementation TBD)
    // But for this MVP, let's load the current working directory from where the app launched
    // We can ask the main process for the CWD using a new IPC or just pass it in list-dir
    const init = async () => {
        try {
            const defaultPath = await window.ipcRenderer.invoke('get-app-path');
            listDir(defaultPath);
        } catch (e) {
            console.error('Failed to get default path', e);
        }
    };
    init(); 
  }, []);

  const listDir = async (path: string) => {
    try {
        const fileList = await window.ipcRenderer.invoke('list-dir', path);
        setFiles(fileList);
        // setCurrentPath(path);
    } catch (e) {
        message.error('Failed to load directory');
        console.error(e);
    }
  };

  const loadFile = async (filePath: string) => {
      try {
          const fileContent = await window.ipcRenderer.invoke('read-file', filePath);
          setContent(fileContent);
          setCurrentFile(filePath);
          // Set filename from path, e.g. /path/to/foo.md -> foo.md
          // Basic split since we might be on windows or mac
          // Actually let's assume forward slashes or handle both
          const name = filePath.split(/[/\\]/).pop() || 'Untitled';
          setFileName(name);
      } catch {
          message.error('Failed to load file');
      } finally {
          // setLoading(false);
      }
  };

  const saveFile = async () => {
      let filePath = currentFile;
      if (!filePath) {
          try {
              const savePath = await window.ipcRenderer.invoke('show-save-dialog', fileName);
              if (savePath) {
                  filePath = savePath;
                  setCurrentFile(filePath);
                   // Optionally refresh list if in same dir, but tricky without knowing defaults. 
                   // Let's just save. 
                   // Ideally we should reload the directory list if the new file is in the current directory.
                   const defaultPath = await window.ipcRenderer.invoke('get-app-path');
                   listDir(defaultPath); // Quick refresh of documents
                   
                   // Update filename state to match saved file
                   const name = filePath.split(/[/\\]/).pop() || fileName;
                   setFileName(name);
              } else {
                  return; // User cancelled
              }
          } catch (e: any) {
              console.error(e);
              message.error(`Failed to create file: ${e.message}`);
              return;
          }
      }

      if (!filePath) return;

      try {
          await window.ipcRenderer.invoke('save-file', filePath, content);
          message.success('File saved');
      } catch {
          message.error('Failed to save file');
      }
  };

  const onSelect: DirectoryTreeProps['onSelect'] = (_keys, info) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const node = info.node as any; // Cast to avoid strict type issues with custom data
    // In our case, we need to map the tree data structure to our file structure
    // But AntD DirectoryTree expects data in a specific format.
    // Let's refactor to use a simpler Menu or List for now, or adapt the data.
    
    // Actually, let's stick to a simple List/Menu for the first iteration as Tree requires recursive data structure
    // which list-dir (flat for one level) doesn't fully provide effortlessly without recursion.
    // But wait, list-dir returns 1 level.
    if (!node.isLeaf) {
        // It's a directory, maybe double click to enter?
        return;
    }
    // It's a file
    // We need the full path. We can store it in the key.
    loadFile(node.key as string);
  };

  // Adapter for AntD Tree Data
  const treeData = files.map(file => ({
      title: file.name,
      key: file.path,
      isLeaf: !file.isDirectory,
      icon: file.isDirectory ? <FolderOpenOutlined /> : <FileMarkdownOutlined />
  }));

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={250} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '16px', fontWeight: 'bold' }}>Files</div>
        <DirectoryTree
            defaultExpandAll
            onSelect={onSelect}
            treeData={treeData}
            onExpand={() => {
                // Handle entering directories if we want deeply nested
                // For now, assume flat or use list-dir logic to drill down
                // If we want allow drilling down, we need to fetch children.
                // Let's keep it simple: single level for now or recursive later.
                // We'll just show the files in current dir.
                // Users can only see files in root dir for starts.
            }}
        />
        {files.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No files" />}
      </Sider>
      <Layout style={{ flex: 1, minWidth: 0 }}>
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
            <Input 
                value={fileName} 
                onChange={(e) => setFileName(e.target.value)} 
                style={{ width: 300, fontSize: '1.2em', fontWeight: 'bold' }} 
                variant="borderless"
                placeholder="Filename"
            />
            <Button type="primary" icon={<SaveOutlined />} onClick={saveFile}>
                Save
            </Button>
        </Header>
        <Content style={{ padding: '24px', background: '#fff', display: 'flex', gap: '12px', height: '100%', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
                <TextArea 
                    value={content} 
                    onChange={e => setContent(e.target.value)} 
                    style={{ flex: 1, resize: 'none', height: '100%' }} 
                    placeholder="Type markdown here..." 
                />
            </div>
            <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: '6px', padding: '12px', overflow: 'auto', height: '100%', minWidth: 0 }}>
                {/* Simplified Preview - could add react-markdown later */}
                <div className="markdown-preview">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                    </ReactMarkdown>
                </div>
            </div>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;
