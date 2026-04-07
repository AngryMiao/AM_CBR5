import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
  },
  uIOhook: {
    on: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    removeAllListeners: vi.fn(),
    keyTap: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  globalShortcut: mocks.globalShortcut,
}))

vi.mock('uiohook-napi', () => ({
  UiohookKey: {
    AltRight: 1,
    Space: 2,
    A: 3,
    B: 4,
    C: 5,
    D: 6,
    E: 7,
    F: 8,
    G: 9,
    H: 10,
    I: 11,
    J: 12,
    K: 13,
    L: 14,
    M: 15,
    N: 16,
    O: 17,
    P: 18,
    Q: 19,
    R: 20,
    S: 21,
    T: 22,
    U: 23,
    V: 24,
    W: 25,
    X: 26,
    Y: 27,
    Z: 28,
    0: 29,
    1: 30,
    2: 31,
    3: 32,
    4: 33,
    5: 34,
    6: 35,
    7: 36,
    8: 37,
    9: 38,
    Semicolon: 39,
    Equal: 40,
    Comma: 41,
    Minus: 42,
    Period: 43,
    Slash: 44,
    Backquote: 45,
    BracketLeft: 46,
    Backslash: 47,
    BracketRight: 48,
    Quote: 49,
    PageUp: 50,
    PageDown: 51,
    Home: 52,
    End: 53,
    ArrowLeft: 54,
    ArrowRight: 55,
    ArrowUp: 56,
    ArrowDown: 57,
    Ctrl: 58,
    CtrlRight: 59,
    Shift: 60,
    ShiftRight: 61,
    Alt: 62,
    Meta: 63,
    MetaRight: 64,
    CapsLock: 65,
    Enter: 66,
    Tab: 67,
    Escape: 68,
    Backspace: 69,
    Insert: 70,
    Delete: 71,
    PrintScreen: 72,
    NumLock: 73,
    ScrollLock: 74,
    F1: 75,
  },
  uIOhook: mocks.uIOhook,
}))

vi.mock('./hotkey-dispatch', () => ({
  resolveHotkeyDispatchWindow: vi.fn(() => undefined),
}))

vi.mock('./typeless-overlay', () => ({
  showTypelessOverlay: vi.fn(),
  updateTypelessOverlay: vi.fn(),
}))

import { UiohookKey } from 'uiohook-napi'
import { startGlobalKeyboardHook, stopGlobalKeyboardHook } from './global-keyboard-hook'
import { resolveHotkeyDispatchWindow } from './hotkey-dispatch'
import { showTypelessOverlay, updateTypelessOverlay } from './typeless-overlay'

describe('global keyboard hook suppression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    stopGlobalKeyboardHook()
  })

  it('registers a suppression shortcut for PageDown in typeless mode', () => {
    startGlobalKeyboardHook('PageDown', false)

    expect(mocks.globalShortcut.register).toHaveBeenCalledWith('PageDown', expect.any(Function))
  })

  it('does not show or update the typeless overlay directly from the main process hotkey hook', () => {
    const dispatchWindow = {
      isDestroyed: () => false,
      isFocused: () => false,
      isMinimized: () => false,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: {
        send: vi.fn(),
      },
    }
    vi.mocked(resolveHotkeyDispatchWindow).mockReturnValue(dispatchWindow as never)

    startGlobalKeyboardHook('PageDown', false)

    const keydownHandler = mocks.uIOhook.on.mock.calls.find(([eventName]) => eventName === 'keydown')?.[1] as
      | ((event: { keycode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }) => void)
      | undefined
    const keyupHandler = mocks.uIOhook.on.mock.calls.find(([eventName]) => eventName === 'keyup')?.[1] as
      | ((event: { keycode: number; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }) => void)
      | undefined

    expect(keydownHandler).toBeTypeOf('function')
    expect(keyupHandler).toBeTypeOf('function')

    keydownHandler?.({
      keycode: UiohookKey.PageDown,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    })
    keyupHandler?.({
      keycode: UiohookKey.PageDown,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
    })

    expect(dispatchWindow.webContents.send).toHaveBeenNthCalledWith(1, 'hotkey:down')
    expect(dispatchWindow.webContents.send).toHaveBeenNthCalledWith(2, 'hotkey:up')
    expect(showTypelessOverlay).not.toHaveBeenCalled()
    expect(updateTypelessOverlay).not.toHaveBeenCalled()
  })
})
