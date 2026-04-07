import type { KeyboardShortcut } from '../../lib/tauri'

const DISPLAY_LABELS: Record<string, string> = {
  ControlLeft: 'CtrlLeft',
  ControlRight: 'CtrlRight',
  ShiftLeft: 'ShiftLeft',
  ShiftRight: 'ShiftRight',
  AltLeft: 'AltLeft',
  AltRight: 'AltRight',
  MetaLeft: 'Cmd/WinLeft',
  MetaRight: 'Cmd/WinRight',
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

const MODIFIER_ORDER = [
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
] as const

const MODIFIER_HID: Record<string, string> = {
  ControlLeft: '0700E0',
  ControlRight: '0700E4',
  ShiftLeft: '0700E1',
  ShiftRight: '0700E5',
  AltLeft: '0700E2',
  AltRight: '0700E6',
  MetaLeft: '0700E3',
  MetaRight: '0700E7',
}

const KEY_HID: Record<string, string> = {
  Enter: '070028',
  Escape: '070029',
  Backspace: '07002A',
  Tab: '07002B',
  Space: '07002C',
  Minus: '07002D',
  Equal: '07002E',
  BracketLeft: '07002F',
  BracketRight: '070030',
  Backslash: '070031',
  Semicolon: '070033',
  Quote: '070034',
  Backquote: '070035',
  Comma: '070036',
  Period: '070037',
  Slash: '070038',
  PrintScreen: '070046',
  Insert: '070049',
  Home: '07004A',
  PageUp: '07004B',
  Delete: '07004C',
  End: '07004D',
  PageDown: '07004E',
  ArrowRight: '07004F',
  ArrowLeft: '070050',
  ArrowDown: '070051',
  ArrowUp: '070052',
}

const STABLE_HID_KEYS = new Set<string>([
  ...MODIFIER_ORDER,
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `Key${letter}`),
  ...'1234567890'.split('').map((digit) => `Digit${digit}`),
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
  ...Object.keys(KEY_HID),
])

const modifierRank = new Map<string, number>(
  MODIFIER_ORDER.map((code, index) => [code, index]),
)

function getOriginalOrder(keys: string[]): Map<string, number> {
  return new Map<string, number>(keys.map((key, index) => [key, index]))
}

function keyDown(hid: string) {
  return `11${hid}`
}

function keyUp(hid: string) {
  return `10${hid}`
}

function hidForRecordedKey(code: string) {
  if (MODIFIER_HID[code]) {
    return MODIFIER_HID[code]
  }

  const letterMatch = /^Key([A-Z])$/.exec(code)
  if (letterMatch) {
    return `0700${(letterMatch[1].charCodeAt(0) - 61).toString(16).toUpperCase().padStart(2, '0')}`
  }

  const digitMatch = /^Digit([0-9])$/.exec(code)
  if (digitMatch) {
    const value = digitMatch[1]
    const mapping: Record<string, string> = {
      '1': '07001E',
      '2': '07001F',
      '3': '070020',
      '4': '070021',
      '5': '070022',
      '6': '070023',
      '7': '070024',
      '8': '070025',
      '9': '070026',
      '0': '070027',
    }
    return mapping[value]
  }

  if (/^F([1-9]|1[0-2])$/.test(code)) {
    const index = Number(code.slice(1))
    return `0700${(57 + index).toString(16).toUpperCase().padStart(2, '0')}`
  }

  return KEY_HID[code]
}

function createShortcut(
  id: string,
  triggerWords: string[],
  recordedKeys: string[],
): KeyboardShortcut {
  return {
    id,
    trigger_words: triggerWords,
    recorded_keys: orderRecordedKeys(recordedKeys),
    key_codes: buildKeyCodes(recordedKeys),
    enabled: true,
  }
}

export function parseTriggerWords(value: string) {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function orderRecordedKeys(keys: string[]) {
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

export function getRecordedKeyDisplayLabel(code: string) {
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

export function formatRecordedKeys(keys: string[]) {
  return orderRecordedKeys(keys)
    .map((code) => getRecordedKeyDisplayLabel(code))
    .join(' + ')
}

export function hasStableHidMapping(keys: string[]) {
  return keys.length > 0 && keys.every((key) => STABLE_HID_KEYS.has(key))
}

export function buildKeyCodes(keys: string[]) {
  const orderedKeys = orderRecordedKeys(keys)
  const modifierKeys = orderedKeys.filter((key) => modifierRank.has(key))
  const normalKeys = orderedKeys.filter((key) => !modifierRank.has(key))
  const codes: string[] = []

  for (const modifier of modifierKeys) {
    const hid = hidForRecordedKey(modifier)
    if (hid) {
      codes.push(keyDown(hid))
    }
  }

  for (const key of normalKeys) {
    const hid = hidForRecordedKey(key)
    if (hid) {
      codes.push(keyDown(hid))
      codes.push(keyUp(hid))
    }
  }

  for (let index = modifierKeys.length - 1; index >= 0; index -= 1) {
    const hid = hidForRecordedKey(modifierKeys[index])
    if (hid) {
      codes.push(keyUp(hid))
    }
  }

  return codes
}

export function createCustomShortcut(triggerWords: string[], recordedKeys: string[]) {
  return createShortcut(`ks_custom_${Date.now()}`, triggerWords, recordedKeys)
}

export function getDefaultKeyboardShortcuts() {
  const userAgentData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData
  const isMac = /mac/i.test(userAgentData?.platform ?? navigator.platform ?? '')
  const modifierKey = isMac ? 'MetaLeft' : 'ControlLeft'

  return [
    createShortcut('ks_copy', ['复制', '拷贝'], [modifierKey, 'KeyC']),
    createShortcut('ks_paste', ['粘贴'], [modifierKey, 'KeyV']),
    createShortcut('ks_cut', ['剪切'], [modifierKey, 'KeyX']),
    createShortcut('ks_undo', ['撤销'], [modifierKey, 'KeyZ']),
    createShortcut(
      'ks_redo',
      ['重做'],
      isMac ? ['MetaLeft', 'ShiftLeft', 'KeyZ'] : ['ControlLeft', 'KeyY'],
    ),
    createShortcut('ks_select_all', ['全选'], [modifierKey, 'KeyA']),
    createShortcut('ks_save', ['保存'], [modifierKey, 'KeyS']),
    createShortcut('ks_enter', ['回车', '换行'], ['Enter']),
    createShortcut('ks_backspace', ['删除', '退格'], ['Backspace']),
    createShortcut('ks_tab', ['Tab', '制表符'], ['Tab']),
    createShortcut(
      'ks_switch_window',
      ['切换窗口'],
      isMac ? ['MetaLeft', 'Tab'] : ['AltLeft', 'Tab'],
    ),
    createShortcut('ks_escape', ['取消', '退出'], ['Escape']),
  ]
}
