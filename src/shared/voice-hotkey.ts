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

const GENERIC_MODIFIER_TOKENS = new Set(['Ctrl', 'Shift', 'Alt', 'Meta', 'Command', 'Control', 'CommandOrControl'])

const SPECIAL_VOICE_TOKENS = new Set([
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

function normalizeTokens(tokens: string[]): string[] {
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

function parseExactVoiceHotkey(value: string): string[] | null {
  if (!value.trim()) {
    return null
  }

  const parts = value
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
  return normalized.every(isSupportedVoiceToken) ? normalized : null
}

function tokenMatchesShortcutToken(voiceToken: string, shortcutToken: string): boolean {
  switch (shortcutToken) {
    case 'Alt':
    case 'Option':
      return voiceToken === 'LeftAlt' || voiceToken === 'RightAlt'
    case 'Ctrl':
    case 'Control':
      return voiceToken === 'LeftCtrl' || voiceToken === 'RightCtrl'
    case 'Shift':
      return voiceToken === 'LeftShift' || voiceToken === 'RightShift'
    case 'Meta':
    case 'Command':
      return voiceToken === 'LeftMeta' || voiceToken === 'RightMeta'
    case 'CommandOrControl':
      return (
        voiceToken === 'LeftCtrl'
        || voiceToken === 'RightCtrl'
        || voiceToken === 'LeftMeta'
        || voiceToken === 'RightMeta'
      )
    default:
      return voiceToken === shortcutToken
  }
}

function shortcutConflictsWithVoiceHotkey(voiceTokens: string[], shortcut: string): boolean {
  if (!shortcut.trim()) {
    return false
  }

  const shortcutTokens = shortcut
    .split('+')
    .map((item) => item.trim())
    .filter(Boolean)

  if (shortcutTokens.length !== voiceTokens.length) {
    return false
  }

  const remaining = [...voiceTokens]

  for (const shortcutToken of shortcutTokens) {
    const index = remaining.findIndex((voiceToken) => tokenMatchesShortcutToken(voiceToken, shortcutToken))
    if (index < 0) {
      return false
    }
    remaining.splice(index, 1)
  }

  return remaining.length === 0
}

export function isSupportedVoiceToken(token: string): boolean {
  if (EXACT_MODIFIER_TOKENS.has(token)) {
    return true
  }

  if (SPECIAL_VOICE_TOKENS.has(token)) {
    return true
  }

  if (/^[A-Z]$/.test(token) || /^[0-9]$/.test(token) || /^F([1-9]|1[0-9]|2[0-4])$/.test(token)) {
    return true
  }

  return ['`', '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/'].includes(token)
}

export function normalizeRecordedVoiceHotkey(codes: string[]): string {
  const tokens = normalizeTokens(codes.map(codeToToken).filter((value): value is string => !!value))
  return tokens.join('+')
}

export function isValidVoiceHotkey(value: string): boolean {
  return parseExactVoiceHotkey(value) !== null
}

export function normalizeStoredVoiceHotkey(value?: string | null): string {
  const parsed = value ? parseExactVoiceHotkey(value) : null
  return parsed ? parsed.join('+') : DEFAULT_VOICE_HOTKEY
}

export function doesVoiceHotkeyConflict(
  voiceHotkey: string,
  shortcuts: {
    quickToggle?: string
    inputBoxSendMessage?: string
  }
): boolean {
  const voiceTokens = parseExactVoiceHotkey(voiceHotkey)
  if (!voiceTokens) {
    return false
  }

  return [shortcuts.quickToggle, shortcuts.inputBoxSendMessage].some((shortcut) =>
    shortcut ? shortcutConflictsWithVoiceHotkey(voiceTokens, shortcut) : false
  )
}
