import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'

const mocks = vi.hoisted(() => {
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = []

    destroyed = false
    handlers = new Map<string, (...args: any[]) => void>()
    blur = vi.fn()
    hide = vi.fn()
    showInactive = vi.fn()
    setAlwaysOnTop = vi.fn()
    setVisibleOnAllWorkspaces = vi.fn()
    setBounds = vi.fn()
    loadURL = vi.fn()
    destroy = vi.fn(() => {
      this.destroyed = true
      this.handlers.get('closed')?.()
    })
    webContents = {
      once: vi.fn(),
      executeJavaScript: vi.fn(async () => undefined),
    }

    constructor() {
      MockBrowserWindow.instances.push(this)
    }

    isDestroyed() {
      return this.destroyed
    }

    on(event: string, handler: (...args: any[]) => void) {
      this.handlers.set(event, handler)
      return this
    }
  }

  return {
    MockBrowserWindow,
    screen: {
      getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
      getDisplayNearestPoint: vi.fn(() => ({
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      })),
    },
  }
})

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
  BrowserWindow: mocks.MockBrowserWindow,
  screen: mocks.screen,
}))

import {
  consumeSuppressMainWindowAutoShowOnActivate,
  destroyTypelessChatResult,
  getTypelessChatResultHtml,
  registerTypelessChatResultIpc,
  showTypelessChatResult,
} from './typeless-chat-result'

describe('typeless chat result window visibility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.MockBrowserWindow.instances.length = 0
  })

  afterEach(() => {
    destroyTypelessChatResult()
    consumeSuppressMainWindowAutoShowOnActivate()
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('keeps the main window hidden after closing the result when it was hidden before showing', async () => {
    const restoreMainWindowVisibility = vi.fn()

    await showTypelessChatResult(
      {
        userMessageId: 'user-1',
        asrText: '你好',
        replyText: '已完成',
      },
      {
        mainWindowVisible: false,
        restoreMainWindowVisibility,
      }
    )

    const window = mocks.MockBrowserWindow.instances.at(-1)
    expect(window).toBeTruthy()

    const preventDefault = vi.fn()
    window?.handlers.get('close')?.({ preventDefault })
    vi.runAllTimers()

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(window?.blur).toHaveBeenCalledTimes(1)
    expect(window?.hide).toHaveBeenCalledTimes(1)
    expect(restoreMainWindowVisibility).toHaveBeenCalledTimes(1)
    expect(consumeSuppressMainWindowAutoShowOnActivate()).toBe(true)
    expect(consumeSuppressMainWindowAutoShowOnActivate()).toBe(false)
  })

  it('does not toggle main window visibility when it was already visible before showing result', async () => {
    const restoreMainWindowVisibility = vi.fn()

    await showTypelessChatResult(
      {
        userMessageId: 'user-2',
        asrText: '继续',
        replyText: '保持显示',
      },
      {
        mainWindowVisible: true,
        restoreMainWindowVisibility,
      }
    )

    const window = mocks.MockBrowserWindow.instances.at(-1)
    const preventDefault = vi.fn()
    window?.handlers.get('close')?.({ preventDefault })
    vi.runAllTimers()

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(window?.hide).toHaveBeenCalledTimes(1)
    expect(restoreMainWindowVisibility).toHaveBeenCalledTimes(1)
    expect(consumeSuppressMainWindowAutoShowOnActivate()).toBe(false)
  })

  it('matches the original TS result window structure and copy hierarchy', () => {
    const html = getTypelessChatResultHtml()

    expect(html).toContain('result-shell')
    expect(html).toContain('result-card')
    expect(html).toContain('result-topline')
    expect(html).toContain('result-close')
    expect(html).toContain('任务结果')
    expect(html).toContain('识别内容')
    expect(html).toContain('执行结果')
    expect(html).toContain('关闭结果窗口')
  })

  it('registers an explicit close ipc handler for the result window', async () => {
    const handles = new Map<string, (event: unknown, payload?: unknown) => unknown>()
    const show = vi.fn()
    const hide = vi.fn()
    const close = vi.fn()
    const dispose = registerTypelessChatResultIpc({
      ipcMain: {
        handle: (channel, listener) => {
          handles.set(channel, listener)
        },
      },
      show,
      hide,
      close,
      onClosed: () => () => undefined,
      sendToMainWindow: vi.fn(),
    } as never)

    expect(handles.has('typelessChatResult:close')).toBe(true)

    await handles.get('typelessChatResult:close')?.({})

    expect(close).toHaveBeenCalledTimes(1)
    dispose()
  })

  it('falls back to window.close when the close ipc request fails', async () => {
    const dom = new JSDOM(getTypelessChatResultHtml(), {
      runScripts: 'dangerously',
      beforeParse(window) {
        window.electronAPI = {
          closeTypelessChatResult: vi.fn(async () => {
            throw new Error('ipc unavailable')
          }),
        } as typeof window.electronAPI
        window.close = vi.fn()
      },
    })

    const closeButton = dom.window.document.getElementById('close')
    expect(closeButton).toBeTruthy()

    closeButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    await Promise.resolve()
    await Promise.resolve()

    expect(dom.window.close).toHaveBeenCalledTimes(1)
  })
})
