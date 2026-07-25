export type { FileItem, MarkdownAPI } from '../shared/api-types'

declare global {
  interface Window {
    markdownAPI: import('../shared/api-types').MarkdownAPI
  }
}
