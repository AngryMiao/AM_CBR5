import { orderRecordedKeys } from './keyboardShortcuts'

export const DEFAULT_VOICE_HOTKEY = 'RightAlt'

const EXACT_MODIFIER_TOKENS = new Set([
  'LeftCtrl',
  'RightCtrl',
  'LeftShift',
  'RightShift',
  'LeftAlt',
  'RightAlt',
  'LeftMeta',
  'RightMeta',
])

const GENERIC_MODIFIER_TOKENS = new Set([
  'Ctrl',
  'Control',
  'Shift',
  'Alt',
  'Meta',
  'Command',
  'CommandOrControl',
  'Option',
])

const SPECIAL_TOKENS = new Set([
  'CapsLock',
  'Enter',
  'Space',
  'Tab',
  'Escape',
  'Backspace',
  'Insert',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PrintScreen',
  'NumLock',
  'ScrollLock',
])

const DOM_CODE_TO_TOKEN: Record<string, string> = {
  ControlLeft: 'LeftCtrl',
  ControlRight: 'RightCtrl',
  ShiftLeft: 'LeftShift',
  ShiftRight: 'RightShift',
  AltLeft: 'LeftAlt',
  AltRight: 'RightAlt',
  MetaLeft: 'LeftMeta',
  MetaRight: 'RightMeta',
  CapsLock: 'CapsLock',
  Enter: 'Enter',
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  PrintScreen: 'PrintScreen',
  NumLock: 'NumLock',
  ScrollLock: 'ScrollLock',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
}

const TOKEN_TO_RECORDED_KEY: Record<string, string> = {
  LeftCtrl: 'ControlLeft',
  RightCtrl: 'ControlRight',
  LeftShift: 'ShiftLeft',
  RightShift: 'ShiftRight',
  LeftAlt: 'AltLeft',
  RightAlt: 'AltRight',
  LeftMeta: 'MetaLeft',
  RightMeta: 'MetaRight',
  CapsLock: 'CapsLock',
  Enter: 'Enter',
  Space: 'Space',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Insert: 'Insert',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  PrintScreen: 'PrintScreen',
  NumLock: 'NumLock',
  ScrollLock: 'ScrollLock',
  '`': 'Backquote',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
}

const TOKEN_ORDER: Record<string, number> = {
  LeftCtrl: 10,
  RightCtrl: 11,
  LeftShift: 20,
  RightShift: 21,
  LeftAlt: 30,
  RightAlt: 31,
  LeftMeta: 40,
  RightMeta: 41,
}

function codeToToken(code: string): string | null {
  if (DOM_CODE_TO_TOKEN[code]) {
    return DOM_CODE_TO_TOKEN[code]
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3)
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5)
  }

  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code
  }

  return null
}

function tokenToRecordedKey(token: string) {
  if (TOKEN_TO_RECORDED_KEY[token]) {
    return TOKEN_TO_RECORDED_KEY[token]
  }

  if (/^[A-Z]$/.test(token)) {
    return `Key${token}`
  }

  if (/^[0-9]$/.test(token)) {
    return `Digit${token}`
  }

  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(token)) {
    return token
  }

  return null
}

function normalizeTokens(tokens: string[]) {
  const deduped = [...new Set(tokens.filter(Boolean))]
  return deduped.sort((left, right) => {
    const leftOrder = TOKEN_ORDER[left] ?? 100
    const rightOrder = TOKEN_ORDER[right] ?? 100

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    return left.localeCompare(right)
  })
}

function parseExactDefaultHotkey(value: string) {
  const trimmed = value
    .trim()
    .replace(/^Hold\s+/i, '')
    .replace(/^Press\s+/i, '')

  if (!trimmed) {
    return null
  }

  const parts = trimmed
    .split('+')
    .map((item) => item.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return null
  }

  if (parts.some((part) => GENERIC_MODIFIER_TOKENS.has(part))) {
    return null
  }

  const normalized = normalizeTokens(parts)
  return normalized.every(isSupportedDefaultHotkeyToken) ? normalized : null
}

export function isSupportedDefaultHotkeyToken(token: string) {
  if (EXACT_MODIFIER_TOKENS.has(token) || SPECIAL_TOKENS.has(token)) {
    return true
  }

  if (/^[A-Z]$/.test(token) || /^[0-9]$/.test(token)) {
    return true
  }

  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(token)) {
    return true
  }

  return ['`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/'].includes(token)
}

export function isValidDefaultHotkey(value: string) {
  return parseExactDefaultHotkey(value) !== null
}

export function normalizeStoredDefaultHotkey(value?: string | null) {
  const parsed = value ? parseExactDefaultHotkey(value) : null
  return parsed ? parsed.join('+') : DEFAULT_VOICE_HOTKEY
}

export function defaultHotkeyToRecordedKeys(value: string) {
  const normalized = normalizeStoredDefaultHotkey(value)
  const tokens = normalized
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)

  return orderRecordedKeys(
    tokens
      .map(tokenToRecordedKey)
      .filter((recordedKey): recordedKey is string => Boolean(recordedKey)),
  )
}

export function formatDefaultHotkeyRecordedKeys(recordedKeys: string[]) {
  const tokens = normalizeTokens(
    orderRecordedKeys(recordedKeys)
      .map(codeToToken)
      .filter((token): token is string => Boolean(token)),
  )

  return tokens.join(' + ')
}

export function recordedKeysToDefaultHotkey(recordedKeys: string[]) {
  const tokens = normalizeTokens(
    orderRecordedKeys(recordedKeys)
      .map(codeToToken)
      .filter((token): token is string => Boolean(token)),
  )

  return tokens.join('+')
}
