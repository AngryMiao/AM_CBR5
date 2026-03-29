/**
 * 全局键盘钩子服务
 * 使用 uiohook-napi 监听全局键盘事件，支持长按录音功能
 */

import { BrowserWindow, globalShortcut } from 'electron'
import { UiohookKey, uIOhook } from 'uiohook-napi'
import { resolveHotkeyDispatchWindow } from './hotkey-dispatch'
import { showTypelessOverlay, updateTypelessOverlay } from './typeless-overlay'

const log = {
  info: (...args: unknown[]) => console.log('[GlobalKeyboardHook]', ...args),
  warn: (...args: unknown[]) => console.warn('[GlobalKeyboardHook]', ...args),
  error: (...args: unknown[]) => console.error('[GlobalKeyboardHook]', ...args),
}

interface HotkeyConfig {
  key: number
  ctrl: boolean
  meta: boolean
  shift: boolean
  alt: boolean
}

const DEFAULT_HOTKEY: HotkeyConfig = {
  key: UiohookKey.V,
  ctrl: true,
  meta: false,
  shift: true,
  alt: false,
}

const pressedKeys = new Set<number>()
const PRINTABLE_KEYS = new Set<number>([
  UiohookKey.Space,
  UiohookKey.A,
  UiohookKey.B,
  UiohookKey.C,
  UiohookKey.D,
  UiohookKey.E,
  UiohookKey.F,
  UiohookKey.G,
  UiohookKey.H,
  UiohookKey.I,
  UiohookKey.J,
  UiohookKey.K,
  UiohookKey.L,
  UiohookKey.M,
  UiohookKey.N,
  UiohookKey.O,
  UiohookKey.P,
  UiohookKey.Q,
  UiohookKey.R,
  UiohookKey.S,
  UiohookKey.T,
  UiohookKey.U,
  UiohookKey.V,
  UiohookKey.W,
  UiohookKey.X,
  UiohookKey.Y,
  UiohookKey.Z,
  UiohookKey['0'],
  UiohookKey['1'],
  UiohookKey['2'],
  UiohookKey['3'],
  UiohookKey['4'],
  UiohookKey['5'],
  UiohookKey['6'],
  UiohookKey['7'],
  UiohookKey['8'],
  UiohookKey['9'],
  UiohookKey.Semicolon,
  UiohookKey.Equal,
  UiohookKey.Comma,
  UiohookKey.Minus,
  UiohookKey.Period,
  UiohookKey.Slash,
  UiohookKey.Backquote,
  UiohookKey.BracketLeft,
  UiohookKey.Backslash,
  UiohookKey.BracketRight,
  UiohookKey.Quote,
])

const SUPPRESSIBLE_KEY_TO_ACCELERATOR: Record<number, string> = {
  [UiohookKey.Space]: 'Space',
  [UiohookKey.A]: 'A',
  [UiohookKey.B]: 'B',
  [UiohookKey.C]: 'C',
  [UiohookKey.D]: 'D',
  [UiohookKey.E]: 'E',
  [UiohookKey.F]: 'F',
  [UiohookKey.G]: 'G',
  [UiohookKey.H]: 'H',
  [UiohookKey.I]: 'I',
  [UiohookKey.J]: 'J',
  [UiohookKey.K]: 'K',
  [UiohookKey.L]: 'L',
  [UiohookKey.M]: 'M',
  [UiohookKey.N]: 'N',
  [UiohookKey.O]: 'O',
  [UiohookKey.P]: 'P',
  [UiohookKey.Q]: 'Q',
  [UiohookKey.R]: 'R',
  [UiohookKey.S]: 'S',
  [UiohookKey.T]: 'T',
  [UiohookKey.U]: 'U',
  [UiohookKey.V]: 'V',
  [UiohookKey.W]: 'W',
  [UiohookKey.X]: 'X',
  [UiohookKey.Y]: 'Y',
  [UiohookKey.Z]: 'Z',
  [UiohookKey['0']]: '0',
  [UiohookKey['1']]: '1',
  [UiohookKey['2']]: '2',
  [UiohookKey['3']]: '3',
  [UiohookKey['4']]: '4',
  [UiohookKey['5']]: '5',
  [UiohookKey['6']]: '6',
  [UiohookKey['7']]: '7',
  [UiohookKey['8']]: '8',
  [UiohookKey['9']]: '9',
  [UiohookKey.Semicolon]: ';',
  [UiohookKey.Equal]: '=',
  [UiohookKey.Comma]: ',',
  [UiohookKey.Minus]: '-',
  [UiohookKey.Period]: '.',
  [UiohookKey.Slash]: '/',
  [UiohookKey.Backquote]: '`',
  [UiohookKey.BracketLeft]: '[',
  [UiohookKey.Backslash]: '\\',
  [UiohookKey.BracketRight]: ']',
  [UiohookKey.Quote]: "'",
}

let isCtrlPressed = false
let isMetaPressed = false
let isShiftPressed = false
let isAltPressed = false
let isHotkeyActive = false
let currentHotkey: HotkeyConfig = DEFAULT_HOTKEY
let isRunning = false
let showWindowOnHotkey = false
let hotkeyPrimaryKeyDownCount = 0
let suppressShortcutAccelerator: string | null = null
let suppressShortcutRegistered = false
let hotkeyDispatchWindow: BrowserWindow | null = null

export function parseShortcut(shortcut: string): HotkeyConfig {
  const parts = shortcut
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
  const config: HotkeyConfig = {
    key: UiohookKey.V,
    ctrl: false,
    meta: false,
    shift: false,
    alt: false,
  }

  for (const part of parts) {
    switch (part) {
      case 'ctrl':
      case 'control':
        config.ctrl = true
        break
      case 'meta':
      case 'command':
      case 'cmd':
      case 'win':
        config.meta = true
        break
      case 'commandorcontrol':
      case 'mod':
        if (process.platform === 'darwin') {
          config.meta = true
        } else {
          config.ctrl = true
        }
        break
      case 'alt':
      case 'option':
        config.alt = true
        break
      case 'shift':
        config.shift = true
        break
      case 'a':
        config.key = UiohookKey.A
        break
      case 'b':
        config.key = UiohookKey.B
        break
      case 'c':
        config.key = UiohookKey.C
        break
      case 'd':
        config.key = UiohookKey.D
        break
      case 'e':
        config.key = UiohookKey.E
        break
      case 'f':
        config.key = UiohookKey.F
        break
      case 'g':
        config.key = UiohookKey.G
        break
      case 'h':
        config.key = UiohookKey.H
        break
      case 'i':
        config.key = UiohookKey.I
        break
      case 'j':
        config.key = UiohookKey.J
        break
      case 'k':
        config.key = UiohookKey.K
        break
      case 'l':
        config.key = UiohookKey.L
        break
      case 'm':
        config.key = UiohookKey.M
        break
      case 'n':
        config.key = UiohookKey.N
        break
      case 'o':
        config.key = UiohookKey.O
        break
      case 'p':
        config.key = UiohookKey.P
        break
      case 'q':
        config.key = UiohookKey.Q
        break
      case 'r':
        config.key = UiohookKey.R
        break
      case 's':
        config.key = UiohookKey.S
        break
      case 't':
        config.key = UiohookKey.T
        break
      case 'u':
        config.key = UiohookKey.U
        break
      case 'v':
        config.key = UiohookKey.V
        break
      case 'w':
        config.key = UiohookKey.W
        break
      case 'x':
        config.key = UiohookKey.X
        break
      case 'y':
        config.key = UiohookKey.Y
        break
      case 'z':
        config.key = UiohookKey.Z
        break
      case '0':
        config.key = UiohookKey['0']
        break
      case '1':
        config.key = UiohookKey['1']
        break
      case '2':
        config.key = UiohookKey['2']
        break
      case '3':
        config.key = UiohookKey['3']
        break
      case '4':
        config.key = UiohookKey['4']
        break
      case '5':
        config.key = UiohookKey['5']
        break
      case '6':
        config.key = UiohookKey['6']
        break
      case '7':
        config.key = UiohookKey['7']
        break
      case '8':
        config.key = UiohookKey['8']
        break
      case '9':
        config.key = UiohookKey['9']
        break
      case 'f1':
        config.key = UiohookKey.F1
        break
      case 'f2':
        config.key = UiohookKey.F2
        break
      case 'f3':
        config.key = UiohookKey.F3
        break
      case 'f4':
        config.key = UiohookKey.F4
        break
      case 'f5':
        config.key = UiohookKey.F5
        break
      case 'f6':
        config.key = UiohookKey.F6
        break
      case 'f7':
        config.key = UiohookKey.F7
        break
      case 'f8':
        config.key = UiohookKey.F8
        break
      case 'f9':
        config.key = UiohookKey.F9
        break
      case 'f10':
        config.key = UiohookKey.F10
        break
      case 'f11':
        config.key = UiohookKey.F11
        break
      case 'f12':
        config.key = UiohookKey.F12
        break
      case 'space':
        config.key = UiohookKey.Space
        break
      case 'enter':
        config.key = UiohookKey.Enter
        break
      case 'escape':
      case 'esc':
        config.key = UiohookKey.Escape
        break
      case 'backspace':
        config.key = UiohookKey.Backspace
        break
      case 'tab':
        config.key = UiohookKey.Tab
        break
      default: {
        const tokenMap: Record<string, number> = {
          ';': UiohookKey.Semicolon,
          '=': UiohookKey.Equal,
          ',': UiohookKey.Comma,
          '-': UiohookKey.Minus,
          '.': UiohookKey.Period,
          '/': UiohookKey.Slash,
          '`': UiohookKey.Backquote,
          '[': UiohookKey.BracketLeft,
          '\\': UiohookKey.Backslash,
          ']': UiohookKey.BracketRight,
          "'": UiohookKey.Quote,
        }
        const mapped = tokenMap[part]
        if (typeof mapped === 'number') {
          config.key = mapped
          break
        }
        const direct =
          (UiohookKey as Record<string, number>)[part.toUpperCase()] ?? (UiohookKey as Record<string, number>)[part]
        if (typeof direct === 'number') {
          config.key = direct
        }
        break
      }
    }
  }

  return config
}

function matchesHotkey(): boolean {
  const ctrlMatch = currentHotkey.ctrl ? isCtrlPressed : !isCtrlPressed
  const metaMatch = currentHotkey.meta ? isMetaPressed : !isMetaPressed
  const shiftMatch = currentHotkey.shift ? isShiftPressed : !isShiftPressed
  const altMatch = currentHotkey.alt ? isAltPressed : !isAltPressed
  const keyMatch = pressedKeys.has(currentHotkey.key)

  return ctrlMatch && metaMatch && shiftMatch && altMatch && keyMatch
}

function shouldCompensateOriginalInput(): boolean {
  if (suppressShortcutRegistered) {
    return false
  }

  if (showWindowOnHotkey) {
    return false
  }

  if (currentHotkey.ctrl || currentHotkey.meta || currentHotkey.shift || currentHotkey.alt) {
    return false
  }

  return PRINTABLE_KEYS.has(currentHotkey.key)
}

function canSuppressOriginalInputWithGlobalShortcut(): boolean {
  if (showWindowOnHotkey) {
    return false
  }

  if (currentHotkey.ctrl || currentHotkey.meta || currentHotkey.shift || currentHotkey.alt) {
    return false
  }

  return PRINTABLE_KEYS.has(currentHotkey.key)
}

function resolveSuppressShortcutAccelerator(): string | null {
  if (!canSuppressOriginalInputWithGlobalShortcut()) {
    return null
  }

  return SUPPRESSIBLE_KEY_TO_ACCELERATOR[currentHotkey.key] ?? null
}

function unregisterSuppressionShortcut(): void {
  if (suppressShortcutAccelerator) {
    globalShortcut.unregister(suppressShortcutAccelerator)
    log.info('Unregistered suppression global shortcut:', suppressShortcutAccelerator)
  }
  suppressShortcutAccelerator = null
  suppressShortcutRegistered = false
}

function registerSuppressionShortcut(): void {
  unregisterSuppressionShortcut()

  const accelerator = resolveSuppressShortcutAccelerator()
  if (!accelerator) {
    return
  }

  try {
    const registered = globalShortcut.register(accelerator, () => {
      if (!isHotkeyActive) {
        hotkeyPrimaryKeyDownCount = 1
        isHotkeyActive = true
        log.info('Hotkey pressed (globalShortcut suppression) - sending hotkey:down')
        notifyRenderer('hotkey:down')
        return
      }

      hotkeyPrimaryKeyDownCount += 1
    })

    if (!registered) {
      log.warn('Failed to register suppression global shortcut:', accelerator)
      return
    }

    suppressShortcutAccelerator = accelerator
    suppressShortcutRegistered = true
    log.info('Registered suppression global shortcut:', accelerator)
  } catch (error) {
    suppressShortcutRegistered = false
    suppressShortcutAccelerator = null
    log.error('Failed to configure suppression global shortcut:', error)
  }
}

function isSuppressedPrimaryKeyEvent(event: {
  keycode: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}): boolean {
  if (!suppressShortcutRegistered) {
    return false
  }

  return event.keycode === currentHotkey.key && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
}

function eraseOriginalInputEcho(keydownCount: number): void {
  if (!shouldCompensateOriginalInput()) {
    return
  }

  const eraseCount = Math.max(1, keydownCount)

  setTimeout(() => {
    try {
      for (let i = 0; i < eraseCount; i += 1) {
        uIOhook.keyTap(UiohookKey.Backspace)
      }
      log.info('Compensated original key input echo with Backspace x', eraseCount)
    } catch (error) {
      log.error('Failed to compensate key input echo:', error)
    }
  }, 12)
}

function handleKeyDown(event: {
  keycode: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}): void {
  isCtrlPressed = event.ctrlKey
  isMetaPressed = event.metaKey
  isShiftPressed = event.shiftKey
  isAltPressed = event.altKey
  pressedKeys.add(event.keycode)

  const matches = matchesHotkey()

  if (!matches) {
    return
  }

  if (isSuppressedPrimaryKeyEvent(event)) {
    if (!isHotkeyActive) {
      hotkeyPrimaryKeyDownCount = 1
      isHotkeyActive = true
      log.info('Hotkey pressed (keydown fallback under suppression) - sending hotkey:down')
      notifyRenderer('hotkey:down')
      return
    }

    hotkeyPrimaryKeyDownCount += 1
    return
  }

  if (!isHotkeyActive) {
    hotkeyPrimaryKeyDownCount = event.keycode === currentHotkey.key ? 1 : 0
    isHotkeyActive = true
    log.info('Hotkey pressed (keydown) - sending hotkey:down')
    notifyRenderer('hotkey:down')
    return
  }

  if (event.keycode === currentHotkey.key) {
    hotkeyPrimaryKeyDownCount += 1
  }
}

function handleKeyUp(event: {
  keycode: number
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}): void {
  isCtrlPressed = event.ctrlKey
  isMetaPressed = event.metaKey
  isShiftPressed = event.shiftKey
  isAltPressed = event.altKey
  pressedKeys.delete(event.keycode)

  const matches = matchesHotkey()

  if (isHotkeyActive && !matches) {
    isHotkeyActive = false
    eraseOriginalInputEcho(hotkeyPrimaryKeyDownCount)
    hotkeyPrimaryKeyDownCount = 0
    log.info('Hotkey released (keyup)')
    notifyRenderer('hotkey:up')
  }
}

function notifyRenderer(event: 'hotkey:down' | 'hotkey:up'): void {
  // Typeless overlay 也是 BrowserWindow，热键事件必须优先发给真正的主窗口，否则 renderer 无法启动录音链路。
  const mainWindow = resolveHotkeyDispatchWindow(hotkeyDispatchWindow, BrowserWindow.getAllWindows())

  if (!showWindowOnHotkey) {
    if (event === 'hotkey:down') {
      showTypelessOverlay({ mode: 'listening', text: '正在聆听...' })
    } else {
      updateTypelessOverlay({ mode: 'processing', text: '正在识别...' })
    }
  }

  if (mainWindow) {
    // Chat 模式下显示窗口
    if (showWindowOnHotkey && event === 'hotkey:down') {
      if (!mainWindow.isFocused()) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore()
        }
        mainWindow.show()
        mainWindow.focus()
      }
    }

    mainWindow.webContents.send(event)
  } else {
    log.error('No main window found!')
  }
}

export function startGlobalKeyboardHook(shortcut?: string, showWindow = false): void {
  if (isRunning) {
    log.info('Global keyboard hook already running')
    return
  }

  if (shortcut) {
    currentHotkey = parseShortcut(shortcut)
  }

  hotkeyPrimaryKeyDownCount = 0
  showWindowOnHotkey = showWindow
  registerSuppressionShortcut()

  log.info('Starting global keyboard hook with shortcut:', shortcut || 'Ctrl+Shift+V', 'showWindow:', showWindow)

  uIOhook.on('keydown', handleKeyDown)
  uIOhook.on('keyup', handleKeyUp)
  uIOhook.start()

  isRunning = true
  log.info('Global keyboard hook started')
}

export function setHotkeyDispatchWindow(window: BrowserWindow | null): void {
  hotkeyDispatchWindow = window
}

export function stopGlobalKeyboardHook(): void {
  if (!isRunning) {
    log.info('Global keyboard hook not running')
    return
  }

  log.info('Stopping global keyboard hook')

  unregisterSuppressionShortcut()

  uIOhook.removeAllListeners('keydown')
  uIOhook.removeAllListeners('keyup')
  uIOhook.stop()

  pressedKeys.clear()
  isCtrlPressed = false
  isMetaPressed = false
  isShiftPressed = false
  isAltPressed = false
  isHotkeyActive = false
  isRunning = false
  showWindowOnHotkey = false
  hotkeyPrimaryKeyDownCount = 0
  suppressShortcutAccelerator = null
  suppressShortcutRegistered = false

  log.info('Global keyboard hook stopped')
}

export function updateHotkey(shortcut: string): void {
  currentHotkey = parseShortcut(shortcut)
  if (isRunning) {
    registerSuppressionShortcut()
  }
  log.info('Hotkey updated to:', shortcut)
}

export function isHookRunning(): boolean {
  return isRunning
}
