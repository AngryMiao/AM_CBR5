import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  BrowserWindow: mocks.MockBrowserWindow,
  screen: mocks.screen,
}))

import {
  consumeSuppressMainWindowAutoShowOnActivate,
  destroyTypelessChatResult,
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
})
