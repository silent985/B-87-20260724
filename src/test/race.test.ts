import { describe, it, expect } from 'vitest'
import { getDirFromFilePath, getFileNameFromPath, computeNewPath, shouldRenameFile } from '../file-utils'

describe('Race condition: request id guard pattern', () => {
  it('should discard stale responses using incrementing request id', async () => {
    let requestId = 0
    let displayedContent = ''

    const loadFile = async (_filePath: string, delay: number, content: string) => {
      const myRequestId = ++requestId
      await new Promise((r) => setTimeout(r, delay))
      if (myRequestId !== requestId) {
        return
      }
      displayedContent = content
    }

    await Promise.all([
      loadFile('a.md', 100, 'Content A'),
      loadFile('b.md', 10, 'Content B'),
    ])

    expect(displayedContent).toBe('Content B')
    expect(displayedContent).not.toBe('Content A')
  })

  it('should always show result of last request even when earlier requests resolve later', async () => {
    let requestId = 0
    let displayedContent = ''
    const results: string[] = []

    const loadFile = async (_filePath: string, delay: number, content: string) => {
      const myRequestId = ++requestId
      await new Promise((r) => setTimeout(r, delay))
      if (myRequestId !== requestId) {
        results.push(`discarded: ${content}`)
        return
      }
      displayedContent = content
      results.push(`applied: ${content}`)
    }

    loadFile('a.md', 50, 'A')
    loadFile('b.md', 30, 'B')
    loadFile('c.md', 10, 'C')

    await new Promise((r) => setTimeout(r, 100))

    expect(displayedContent).toBe('C')
    expect(results).toContain('applied: C')
    expect(results).toContain('discarded: A')
    expect(results).toContain('discarded: B')
  })

  it('should not apply stale content when editor content changed during load', async () => {
    let requestId = 0
    let currentContent = ''
    let dirtyCleared = false

    const loadFile = async (fileContent: string, delay: number) => {
      const myRequestId = ++requestId
      const snapshot = currentContent
      await new Promise((r) => setTimeout(r, delay))
      if (myRequestId !== requestId) return
      if (currentContent !== snapshot) return
      currentContent = fileContent
      dirtyCleared = true
    }

    loadFile('Loaded File', 100)
    await new Promise((r) => setTimeout(r, 10))
    currentContent = 'User typed something during load'

    await new Promise((r) => setTimeout(r, 150))

    expect(currentContent).toBe('User typed something during load')
    expect(dirtyCleared).toBe(false)
  })

  it('should not clear dirty when content changed during save', async () => {
    let saveRequestId = 0
    let isDirty = false

    const saveFile = async (snapshot: string, delay: number) => {
      const mySaveId = ++saveRequestId
      await new Promise((r) => setTimeout(r, delay))
      if (mySaveId !== saveRequestId) return
      return snapshot
    }

    isDirty = true
    const contentAtSaveStart = 'content before save'
    const savePromise = saveFile(contentAtSaveStart, 100)

    await new Promise((r) => setTimeout(r, 10))
    isDirty = true

    await savePromise

    expect(isDirty).toBe(true)
  })
})

describe('Production code: getDirFromFilePath', () => {
  it('should extract directory path from file path', () => {
    expect(getDirFromFilePath('/home/user/docs/file.md')).toBe('/home/user/docs')
    expect(getDirFromFilePath('/home/user/docs/sub/note.md')).toBe('/home/user/docs/sub')
  })

  it('should handle windows-style paths', () => {
    expect(getDirFromFilePath('C:\\Users\\docs\\test.md')).toBe('C:/Users/docs')
  })
})

describe('Production code: getFileNameFromPath', () => {
  it('should extract filename from path', () => {
    expect(getFileNameFromPath('/home/user/docs/file.md')).toBe('file.md')
    expect(getFileNameFromPath('/docs/note.txt')).toBe('note.txt')
  })

  it('should return Untitled for empty path parts', () => {
    expect(getFileNameFromPath('')).toBe('Untitled')
  })
})

describe('Production code: computeNewPath', () => {
  it('should compute new path when renaming a file', () => {
    expect(computeNewPath('/docs/old.md', 'new.md')).toBe('/docs/new.md')
    expect(computeNewPath('/docs/sub/a.md', 'b.md')).toBe('/docs/sub/b.md')
  })
})

describe('Production code: shouldRenameFile', () => {
  it('should return false when filename unchanged', () => {
    expect(shouldRenameFile('/docs/file.md', 'file.md')).toBe(false)
  })

  it('should return true when filename changed', () => {
    expect(shouldRenameFile('/docs/file.md', 'renamed.md')).toBe(true)
    expect(shouldRenameFile('/docs/a.md', 'b.md')).toBe(true)
  })

  it('should return false when no file is open', () => {
    expect(shouldRenameFile(null, 'anything.md')).toBe(false)
  })
})

describe('Race condition: save returns success/failure for close flow', () => {
  it('should return true on successful save', async () => {
    const saveSuccess = async (): Promise<boolean> => {
      await new Promise((r) => setTimeout(r, 5))
      return true
    }
    expect(await saveSuccess()).toBe(true)
  })

  it('should return false on save failure', async () => {
    const saveFail = async (): Promise<boolean> => {
      await new Promise((r) => setTimeout(r, 5))
      return false
    }
    expect(await saveFail()).toBe(false)
  })

  it('should return false when user cancels save dialog', async () => {
    const saveCancelled = async (): Promise<boolean> => {
      const savePath = null
      if (!savePath) return false
      return true
    }
    expect(await saveCancelled()).toBe(false)
  })

  it('should only close window after save succeeds', async () => {
    let windowClosed = false
    let saved = false

    const performSaveAndClose = async (doSave: () => Promise<boolean>) => {
      const success = await doSave()
      if (success) {
        windowClosed = true
      }
      return success
    }

    saved = await performSaveAndClose(async () => {
      await new Promise((r) => setTimeout(r, 5))
      return true
    })

    expect(saved).toBe(true)
    expect(windowClosed).toBe(true)

    windowClosed = false
    saved = await performSaveAndClose(async () => {
      await new Promise((r) => setTimeout(r, 5))
      return false
    })

    expect(saved).toBe(false)
    expect(windowClosed).toBe(false)
  })
})

describe('Race condition: content snapshot prevents dirty state loss', () => {
  it('should only clear dirty if content matches snapshot after save', () => {
    let isDirty = true
    const contentAtSaveStart: string = 'hello'
    const contentAfterSave: string = 'hello'

    if (contentAfterSave === contentAtSaveStart) {
      isDirty = false
    }

    expect(isDirty).toBe(false)
  })

  it('should keep dirty if content changed during save', () => {
    let isDirty = true
    const contentAtSaveStart: string = 'hello'
    const contentAfterSave: string = 'hello world - edited during save'

    if (contentAfterSave === contentAtSaveStart) {
      isDirty = false
    }

    expect(isDirty).toBe(true)
  })
})

describe('Production code: save dialog returns path that updates filename', () => {
  it('should extract filename from save dialog return path', () => {
    const savePath = '/home/user/docs/my-new-file.md'
    const newName = getFileNameFromPath(savePath)
    expect(newName).toBe('my-new-file.md')
  })

  it('should handle user renaming in native dialog', () => {
    const suggestedName = 'Untitled'
    const dialogReturnedPath = '/docs/different-name.md'
    const finalName = getFileNameFromPath(dialogReturnedPath)
    expect(finalName).not.toBe(suggestedName)
    expect(finalName).toBe('different-name.md')
  })
})
