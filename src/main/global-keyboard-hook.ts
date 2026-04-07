/**
 * 全局键盘钩子服务
 * 使用 uiohook-napi 监听全局键盘事件，支持长按录音功能
 */

import { DEFAULT_VOICE_HOTKEY, normalizeStoredVoiceHotkey } from '@shared/voice-hotkey'
import { BrowserWindow, globalShortcut } from 'electron'
import { UiohookKey, uIOhook } from 'uiohook-napi'
import { resolveHotkeyDispatchWindow } from './hotkey-dispatch'

const log = {
  info: (...args: unknown[]) => console.log('[GlobalKeyboardHook]', ...args),
  warn: (...args: unknown[]) => console.warn('[GlobalKeyboardHook]', ...args),
  error: (...args: unknown[]) => console.error('[GlobalKeyboardHook]', ...args),
}

interface HotkeyConfig {
  requiredKeys: Set<number>
  primaryKey: number
}

const DEFAULT_HOTKEY: HotkeyConfig = {
  requiredKeys: new Set([UiohookKey.AltRight]),
  primaryKey: UiohookKey.AltRight,
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

const SUPPRESSIBLE_SINGLE_KEYS = new Set<number>([
  ...PRINTABLE_KEYS,
  UiohookKey.PageUp,
  UiohookKey.PageDown,
  UiohookKey.Home,
  UiohookKey.End,
  UiohookKey.ArrowLeft,
  UiohookKey.ArrowRight,
  UiohookKey.ArrowUp,
  UiohookKey.ArrowDown,
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
  [UiohookKey.PageUp]: 'PageUp',
  [UiohookKey.PageDown]: 'PageDown',
  [UiohookKey.Home]: 'Home',
  [UiohookKey.End]: 'End',
  [UiohookKey.ArrowLeft]: 'Left',
  [UiohookKey.ArrowRight]: 'Right',
  [UiohookKey.ArrowUp]: 'Up',
  [UiohookKey.ArrowDown]: 'Down',
}

let isHotkeyActive = false
let currentHotkey: HotkeyConfig = DEFAULT_HOTKEY
let isRunning = false
let showWindowOnHotkey = false
let hotkeyPrimaryKeyDownCount = 0
let suppressShortcutAccelerator: string | null = null
let suppressShortcutRegistered = false
let hotkeyDispatchWindow: BrowserWindow | null = null

const EXACT_TOKEN_TO_UIOHOOK: Record<string, number> = {
  LeftCtrl: UiohookKey.Ctrl,
  RightCtrl: UiohookKey.CtrlRight,
  LeftShift: UiohookKey.Shift,
  RightShift: UiohookKey.ShiftRight,
  LeftAlt: UiohookKey.Alt,
  RightAlt: UiohookKey.AltRight,
  LeftMeta: UiohookKey.Meta,
  RightMeta: UiohookKey.MetaRight,
  CapsLock: UiohookKey.CapsLock,
  Enter: UiohookKey.Enter,
  Space: UiohookKey.Space,
  Tab: UiohookKey.Tab,
  Escape: UiohookKey.Escape,
  Backspace: UiohookKey.Backspace,
  Insert: UiohookKey.Insert,
  Delete: UiohookKey.Delete,
  Home: UiohookKey.Home,
  End: UiohookKey.End,
  PageUp: UiohookKey.PageUp,
  PageDown: UiohookKey.PageDown,
  ArrowLeft: UiohookKey.ArrowLeft,
  ArrowRight: UiohookKey.ArrowRight,
  ArrowUp: UiohookKey.ArrowUp,
  ArrowDown: UiohookKey.ArrowDown,
  PrintScreen: UiohookKey.PrintScreen,
  NumLock: UiohookKey.NumLock,
  ScrollLock: UiohookKey.ScrollLock,
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

function resolveExactTokenToKeycode(token: string): number {
  if (EXACT_TOKEN_TO_UIOHOOK[token] !== undefined) {
    return EXACT_TOKEN_TO_UIOHOOK[token]
  }

  if (/^[A-Z]$/.test(token)) {
    return (UiohookKey as Record<string, number>)[token]
  }

  if (/^[0-9]$/.test(token)) {
    return (UiohookKey as Record<string, number>)[token]
  }

  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(token)) {
    return (UiohookKey as Record<string, number>)[token]
  }

  return (UiohookKey as Record<string, number>)[token]
}

export function parseShortcut(shortcut: string): HotkeyConfig {
  const normalized = normalizeStoredVoiceHotkey(shortcut || DEFAULT_VOICE_HOTKEY)
  const parts = normalized
    .split('+')
    .map((p) => p.trim())
  const keycodes = parts.map(resolveExactTokenToKeycode).filter((value): value is number => typeof value === 'number')
  const primaryKey = keycodes[keycodes.length - 1] ?? UiohookKey.AltRight

  return {
    requiredKeys: new Set(keycodes),
    primaryKey,
  }
}

export function isExactHotkeyMatch(requiredKeys: Set<number>, activeKeys: Set<number>): boolean {
  if (requiredKeys.size !== activeKeys.size) {
    return false
  }

  for (const key of requiredKeys) {
    if (!activeKeys.has(key)) {
      return false
    }
  }

  return true
}

function shouldCompensateOriginalInput(): boolean {
  if (suppressShortcutRegistered) {
    return false
  }

  if (showWindowOnHotkey) {
    return false
  }

  if (currentHotkey.requiredKeys.size !== 1) {
    return false
  }

  return PRINTABLE_KEYS.has(currentHotkey.primaryKey)
}

function canSuppressOriginalInputWithGlobalShortcut(): boolean {
  if (showWindowOnHotkey) {
    return false
  }

  if (currentHotkey.requiredKeys.size !== 1) {
    return false
  }

  return SUPPRESSIBLE_SINGLE_KEYS.has(currentHotkey.primaryKey)
}

function resolveSuppressShortcutAccelerator(): string | null {
  if (!canSuppressOriginalInputWithGlobalShortcut()) {
    return null
  }

  return SUPPRESSIBLE_KEY_TO_ACCELERATOR[currentHotkey.primaryKey] ?? null
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

  return event.keycode === currentHotkey.primaryKey && currentHotkey.requiredKeys.size === 1
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
  pressedKeys.add(event.keycode)

  const matches = isExactHotkeyMatch(currentHotkey.requiredKeys, pressedKeys)

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
    hotkeyPrimaryKeyDownCount = event.keycode === currentHotkey.primaryKey ? 1 : 0
    isHotkeyActive = true
    log.info('Hotkey pressed (keydown) - sending hotkey:down')
    notifyRenderer('hotkey:down')
    return
  }

  if (event.keycode === currentHotkey.primaryKey) {
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
  pressedKeys.delete(event.keycode)

  const matches = isExactHotkeyMatch(currentHotkey.requiredKeys, pressedKeys)

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

  log.info('Starting global keyboard hook with shortcut:', shortcut || DEFAULT_VOICE_HOTKEY, 'showWindow:', showWindow)

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
