const DISPLAY_LABELS: Record<string, string> = {
  ControlLeft: 'CtrlLeft',
  ShiftLeft: 'ShiftLeft',
  AltLeft: 'AltLeft',
  MetaLeft: 'Cmd/WinLeft',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
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

const MODIFIER_ORDER = ['ControlLeft', 'ShiftLeft', 'AltLeft', 'MetaLeft'] as const
const STABLE_HID_KEYS = new Set<string>([
  ...MODIFIER_ORDER,
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Key${letter}`),
  ...'1234567890'.split('').map((digit) => `Digit${digit}`),
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
  'Enter',
  'Escape',
  'Backspace',
  'Tab',
  'Space',
  'PrintScreen',
  'Insert',
  'Home',
  'PageUp',
  'Delete',
  'End',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Minus',
  'Equal',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Semicolon',
  'Quote',
  'Backquote',
  'Comma',
  'Period',
  'Slash',
])

const modifierRank = new Map<string, number>(MODIFIER_ORDER.map((code, index) => [code, index]))

function getOriginalOrder(keys: string[]): Map<string, number> {
  return new Map<string, number>(keys.map((key, index) => [key, index]))
}

export function orderRecordedKeys(keys: string[]): string[] {
  const uniqueKeys = keys.filter((key, index) => key && keys.indexOf(key) === index)
  const originalOrder = getOriginalOrder(uniqueKeys)

  return [...uniqueKeys].sort((left, right) => {
    const leftRank = modifierRank.get(left)
    const rightRank = modifierRank.get(right)

    if (leftRank !== undefined && rightRank !== undefined) {
      return leftRank - rightRank
    }
    if (leftRank !== undefined) {
      return -1
    }
    if (rightRank !== undefined) {
      return 1
    }
    return (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0)
  })
}

export function getRecordedKeyDisplayLabel(code: string): string {
  if (DISPLAY_LABELS[code]) {
    return DISPLAY_LABELS[code]
  }

  const letterMatch = /^Key([A-Z])$/.exec(code)
  if (letterMatch) {
    return letterMatch[1]
  }

  const digitMatch = /^Digit([0-9])$/.exec(code)
  if (digitMatch) {
    return digitMatch[1]
  }

  return code
}

export function hasStableHidMapping(keys: string[]): boolean {
  return keys.length > 0 && keys.every((key) => STABLE_HID_KEYS.has(key))
}

export function getMissingStableHidKeys(keys: string[]): string[] {
  return orderRecordedKeys(keys).filter((key) => !STABLE_HID_KEYS.has(key))
}
