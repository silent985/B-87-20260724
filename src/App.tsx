import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { App as AntdApp, Button, Empty, Input, Layout, List, Typography } from 'antd'
import {
  ArrowUpOutlined,
  FileMarkdownOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FileEntry } from './types'
import { EditorSession } from './lib/editorSession'
import './App.css'

const { Header, Sider, Content } = Layout
const { TextArea } = Input

const App: React.FC = () => {
  const { message, modal } = AntdApp.useApp()

  // The session owns all file-lifecycle state and concurrency. It is created
  // once (lazy state initialiser) and lives for the component's lifetime;
  // React just subscribes to it.
  const [session] = useState(
    () =>
      new EditorSession(window.api, {
        // Placeholder handlers; replaced with live antd hooks in the effect below.
        confirmDiscard: async () => true,
        notifyError: () => {},
        notifySuccess: () => {},
      }),
  )

  const state = useSyncExternalStore(session.subscribe, session.getState)
  const dirty = state.content !== state.savedContent

  // Keep the session's UI collaborators pointed at the current antd hooks.
  useEffect(() => {
    session.configure({
      // The session only calls this when the document is actually dirty, so it
      // is a plain confirmation prompt.
      confirmDiscard: () =>
        new Promise<boolean>((resolve) => {
          modal.confirm({
            title: '尚未保存',
            content: '当前文件有未保存的修改，切换后修改将丢失。是否继续？',
            okText: '放弃修改',
            cancelText: '取消',
            okButtonProps: { danger: true },
            onOk: () => resolve(true),
            onCancel: () => resolve(false),
          })
        }),
      notifyError: (msg) => message.error(msg),
      notifySuccess: (msg) => message.success(msg),
    })
  }, [session, modal, message])

  // Initial directory load.
  useEffect(() => {
    void session.init()
  }, [session])

  // Warn about unsaved changes when the window is closing.
  useEffect(() => {
    const unsubscribe = window.api.onBeforeClose(() => {
      if (!(session.dirty)) {
        window.api.respondClose(true)
        return
      }
      modal.confirm({
        title: '尚未保存',
        content: '有未保存的修改，确定要退出吗？',
        okText: '直接退出',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => window.api.respondClose(true),
        onCancel: () => window.api.respondClose(false),
      })
    })
    return unsubscribe
  }, [session, modal])

  const onEntryClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      void session.openDirectory(entry.path)
    } else {
      void session.openFile(entry.path)
    }
  }

  // Open http(s) links from the preview in the system browser rather than
  // navigating the trusted window.
  const markdownComponents = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault()
            if (href) {
              void window.api.openExternal(href)
            }
          }}
        >
          {children}
        </a>
      ),
    }),
    [],
  )

  const entries = state.listing?.entries ?? []

  return (
    <Layout style={{ height: '100vh' }}>
      <Sider width={260} theme="light" style={{ borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
          <Typography.Text strong>文件</Typography.Text>
          <span>
            <Button
              type="text"
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={!state.listing?.parent}
              onClick={() => void session.goUp()}
              title="返回上一级"
            />
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => void session.refreshListing()}
              title="刷新"
            />
          </span>
        </div>
        <div style={{ padding: '4px 16px', color: '#999', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={state.listing?.path}>
          {state.listing?.path ?? ''}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {entries.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="空目录" style={{ marginTop: 48 }} />
          ) : (
            <List
              size="small"
              dataSource={entries}
              renderItem={(entry) => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '6px 16px' }}
                  onClick={() => onEntryClick(entry)}
                >
                  <span style={{ marginRight: 8 }}>
                    {entry.isDirectory ? <FolderOpenOutlined /> : <FileMarkdownOutlined />}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.name}
                  </span>
                </List.Item>
              )}
            />
          )}
        </div>
      </Sider>
      <Layout style={{ flex: 1, minWidth: 0 }}>
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
          <Input
            value={state.fileName}
            onChange={(e) => session.setFileName(e.target.value)}
            onBlur={() => void session.rename(state.fileName)}
            onPressEnter={() => void session.rename(state.fileName)}
            style={{ width: 320, fontSize: '1.2em', fontWeight: 'bold' }}
            variant="borderless"
            placeholder="文件名"
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => void session.save()}
            disabled={!dirty && state.currentFile !== null}
          >
            {dirty ? '保存 *' : '保存'}
          </Button>
        </Header>
        <Content style={{ padding: '24px', background: '#fff', display: 'flex', gap: '12px', height: '100%', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
            <TextArea
              value={state.content}
              onChange={(e) => session.setContent(e.target.value)}
              style={{ flex: 1, resize: 'none', height: '100%' }}
              placeholder="在此输入 Markdown..."
            />
          </div>
          <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: '6px', padding: '12px', overflow: 'auto', height: '100%', minWidth: 0 }}>
            <div className="markdown-preview">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {state.content}
              </ReactMarkdown>
            </div>
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
