import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Layout, Button, Input, message, Tree, Empty, Breadcrumb } from 'antd'
import { FolderOpenOutlined, FileMarkdownOutlined, SaveOutlined, ArrowUpOutlined } from '@ant-design/icons'
import type { DirectoryTreeProps } from 'antd/es/tree'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FileItem } from './types'
import { getDirFromFilePath, getFileNameFromPath, computeNewPath, shouldRenameFile } from './file-utils'
import './App.css'

const { Header, Sider, Content } = Layout
const { TextArea } = Input
const { DirectoryTree } = Tree

const App: React.FC = () => {
  const [files, setFiles] = useState<FileItem[]>([])
  const [content, setContent] = useState<string>('')
  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('Untitled')
  const [currentDir, setCurrentDir] = useState<string>('')
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const loadRequestIdRef = useRef(0)
  const saveRequestIdRef = useRef(0)
  const contentRef = useRef(content)
  const currentFileRef = useRef(currentFile)
  const fileNameRef = useRef(fileName)
  const currentDirRef = useRef(currentDir)
  const isDirtyRef = useRef(isDirty)

  contentRef.current = content
  currentFileRef.current = currentFile
  fileNameRef.current = fileName
  currentDirRef.current = currentDir
  isDirtyRef.current = isDirty

  const listDir = useCallback(async (dirPath: string) => {
    setIsLoading(true)
    try {
      const fileList = await window.markdownAPI.listDir(dirPath)
      setFiles(fileList)
      setCurrentDir(dirPath)
    } catch (e) {
      message.error('加载目录失败')
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const confirmDiscardChanges = useCallback((): boolean => {
    if (isDirtyRef.current) {
      return window.confirm('您有未保存的更改，确定要放弃吗？')
    }
    return true
  }, [])

  const loadFile = useCallback(async (filePath: string) => {
    if (!confirmDiscardChanges()) return

    const requestId = ++loadRequestIdRef.current
    const contentSnapshot = contentRef.current
    setIsLoading(true)
    try {
      const fileContent = await window.markdownAPI.readFile(filePath)
      if (requestId !== loadRequestIdRef.current) return
      if (contentRef.current !== contentSnapshot) return
      setContent(fileContent)
      setCurrentFile(filePath)
      setIsDirty(false)
      setFileName(getFileNameFromPath(filePath))
    } catch {
      if (requestId === loadRequestIdRef.current) {
        message.error('加载文件失败')
      }
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [confirmDiscardChanges])

  const enterDirectory = useCallback((dirPath: string) => {
    if (!confirmDiscardChanges()) return
    loadRequestIdRef.current++
    setContent('')
    setCurrentFile(null)
    setFileName('Untitled')
    setIsDirty(false)
    listDir(dirPath)
  }, [confirmDiscardChanges, listDir])

  const goUpDirectory = useCallback(() => {
    if (!currentDirRef.current) return
    if (!confirmDiscardChanges()) return
    const parentPath = getDirFromFilePath(currentDirRef.current)
    if (parentPath && parentPath !== currentDirRef.current) {
      loadRequestIdRef.current++
      setContent('')
      setCurrentFile(null)
      setFileName('Untitled')
      setIsDirty(false)
      listDir(parentPath)
    }
  }, [confirmDiscardChanges, listDir])

  const saveFile = useCallback(async (): Promise<boolean> => {
    let filePath = currentFileRef.current
    const contentSnapshot = contentRef.current
    const fileNameSnapshot = fileNameRef.current

    if (filePath) {
      if (shouldRenameFile(filePath, fileNameSnapshot)) {
        const newPath = computeNewPath(filePath, fileNameSnapshot)
        try {
          await window.markdownAPI.renameFile(filePath, newPath)
          filePath = newPath
          setCurrentFile(newPath)
        } catch (e) {
          console.error(e)
          message.error('重命名文件失败')
          return false
        }
      }
    } else {
      try {
        const savePath = await window.markdownAPI.showSaveDialog(fileNameSnapshot)
        if (savePath) {
          filePath = savePath
          setCurrentFile(filePath)
          const newName = getFileNameFromPath(savePath)
          setFileName(newName)
        } else {
          return false
        }
      } catch (e: unknown) {
        console.error(e)
        const msg = e instanceof Error ? e.message : String(e)
        message.error(`创建文件失败: ${msg}`)
        return false
      }
    }

    if (!filePath) return false

    const saveId = ++saveRequestIdRef.current
    try {
      await window.markdownAPI.saveFile(filePath, contentSnapshot)
      if (saveId === saveRequestIdRef.current) {
        if (contentRef.current === contentSnapshot) {
          setIsDirty(false)
        }
      }
      message.success('文件已保存')
      const dir = getDirFromFilePath(filePath)
      listDir(dir)
      return true
    } catch (e) {
      console.error(e)
      message.error('保存文件失败')
      return false
    }
  }, [listDir])

  const handleSaveAndClose = useCallback(async (): Promise<boolean> => {
    return saveFile()
  }, [saveFile])

  useEffect(() => {
    const init = async () => {
      try {
        const defaultPath = await window.markdownAPI.getAppPath()
        listDir(defaultPath)
      } catch (e) {
        console.error('Failed to get default path', e)
      }
    }
    init()
  }, [listDir])

  useEffect(() => {
    window.markdownAPI.setUnsavedChangesHandler(() => isDirtyRef.current)
    window.markdownAPI.setSaveAndCloseHandler(handleSaveAndClose)
  }, [handleSaveAndClose])

  const onSelect: DirectoryTreeProps['onSelect'] = (_keys, info) => {
    const node = info.node as { key: string; isLeaf?: boolean }
    if (!node.isLeaf) {
      enterDirectory(node.key as string)
      return
    }
    loadFile(node.key as string)
  }

  const onContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    setIsDirty(true)
  }

  const onFileNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileName(e.target.value)
    if (currentFile) {
      setIsDirty(true)
    }
  }

  const treeData = files
    .slice()
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map((file) => ({
      title: file.name,
      key: file.path,
      isLeaf: !file.isDirectory,
      icon: file.isDirectory ? <FolderOpenOutlined /> : <FileMarkdownOutlined />,
    }))

  const breadcrumbItems = () => {
    if (!currentDir) return []
    const parts = currentDir.split(/[/\\]/).filter(Boolean)
    return parts.map((part, index) => ({
      title: index === parts.length - 1 ? <strong>{part}</strong> : part,
    }))
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={280} theme="light" style={{ borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>文件浏览器</span>
          <Button
            size="small"
            icon={<ArrowUpOutlined />}
            onClick={goUpDirectory}
            disabled={!currentDir || isLoading}
            title="返回上级目录"
          />
        </div>
        <div style={{ padding: '0 16px 8px', fontSize: '12px', color: '#888', wordBreak: 'break-all' }}>
          <Breadcrumb items={breadcrumbItems()} />
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <DirectoryTree
            defaultExpandAll
            onSelect={onSelect}
            treeData={treeData}
            selectedKeys={currentFile ? [currentFile] : []}
          />
          {files.length === 0 && !isLoading && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无文件" />}
        </div>
      </Sider>
      <Layout style={{ flex: 1, minWidth: 0 }}>
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            <Input
              value={fileName}
              onChange={onFileNameChange}
              style={{ width: 300, fontSize: '1.2em', fontWeight: 'bold' }}
              variant="borderless"
              placeholder="文件名"
              suffix={isDirty ? <span style={{ color: '#ff4d4f', fontSize: '16px' }}>●</span> : null}
            />
          </div>
          <Button type="primary" icon={<SaveOutlined />} onClick={saveFile} disabled={isLoading}>
            保存
          </Button>
        </Header>
        <Content style={{ padding: '24px', background: '#fff', display: 'flex', gap: '12px', height: '100%', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <TextArea
              value={content}
              onChange={onContentChange}
              style={{ flex: 1, resize: 'none', height: '100%' }}
              placeholder="在此输入 Markdown..."
            />
          </div>
          <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: '6px', padding: '12px', overflow: 'auto', height: '100%', minWidth: 0 }}>
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
