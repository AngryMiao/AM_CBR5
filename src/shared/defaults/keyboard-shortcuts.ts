import type { KeyboardShortcut } from '../types/voice'

// USB HID key codes (without 0x00 prefix)
const HID = {
  // Modifier keys
  CtrlLeft: '0700E0',
  CmdLeft: '0700E3',
  ShiftLeft: '0700E1',
  AltLeft: '0700E2',
  // Letters A-Z
  A: '070004',
  B: '070005',
  C: '070006',
  D: '070007',
  E: '070008',
  F: '070009',
  G: '07000A',
  H: '07000B',
  I: '07000C',
  J: '07000D',
  K: '07000E',
  L: '07000F',
  M: '070010',
  N: '070011',
  O: '070012',
  P: '070013',
  Q: '070014',
  R: '070015',
  S: '070016',
  T: '070017',
  U: '070018',
  V: '070019',
  W: '07001A',
  X: '07001B',
  Y: '07001C',
  Z: '07001D',
  // Number keys 1-9, 0
  Num1: '07001E',
  Num2: '07001F',
  Num3: '070020',
  Num4: '070021',
  Num5: '070022',
  Num6: '070023',
  Num7: '070024',
  Num8: '070025',
  Num9: '070026',
  Num0: '070027',
  // Common editing keys
  Enter: '070028',
  Escape: '070029',
  Backspace: '07002A',
  Tab: '07002B',
  Space: '07002C',
  // Punctuation
  Minus: '07002D',
  Equal: '07002E',
  BracketLeft: '07002F',
  BracketRight: '070030',
  Backslash: '070031',
  Semicolon: '070033',
  Apostrophe: '070034',
  Grave: '070035',
  Comma: '070036',
  Period: '070037',
  Slash: '070038',
  // Function keys F1-F12
  F1: '07003A',
  F2: '07003B',
  F3: '07003C',
  F4: '07003D',
  F5: '07003E',
  F6: '07003F',
  F7: '070040',
  F8: '070041',
  F9: '070042',
  F10: '070043',
  F11: '070044',
  F12: '070045',
  // Navigation keys
  PrintScreen: '070046',
  Insert: '070049',
  Home: '07004A',
  PageUp: '07004B',
  Delete: '07004C',
  End: '07004D',
  PageDown: '07004E',
  // Arrow keys
  Right: '07004F',
  Left: '070050',
  Down: '070051',
  Up: '070052',
} as const

function keyDown(hid: string): string {
  return `11${hid}`
}

function keyUp(hid: string): string {
  return `10${hid}`
}

/**
 * 构造组合键序列：
 * 修饰键按下 -> 普通键按下 -> 普通键抬起 -> 修饰键按相反顺序抬起。
 */
export function makeCombo(modifiers: string[], key: string): string[] {
  const codes: string[] = []
  for (const mod of modifiers) {
    codes.push(keyDown(mod))
  }
  codes.push(keyDown(key))
  codes.push(keyUp(key))
  for (let index = modifiers.length - 1; index >= 0; index -= 1) {
    codes.push(keyUp(modifiers[index]))
  }
  return codes
}

export function makeSingleKey(key: string): string[] {
  return [keyDown(key), keyUp(key)]
}

let idCounter = 0

function nextId(): string {
  return `ks_${++idCounter}`
}

function toRecordedModifierCode(hidName: 'CtrlLeft' | 'CmdLeft' | 'ShiftLeft' | 'AltLeft'): string {
  switch (hidName) {
    case 'CtrlLeft':
      return 'ControlLeft'
    case 'CmdLeft':
      return 'MetaLeft'
    case 'ShiftLeft':
      return 'ShiftLeft'
    case 'AltLeft':
      return 'AltLeft'
  }
}

function toRecordedKeyCode(hidName: keyof typeof HID): string {
  if (hidName === 'CtrlLeft' || hidName === 'CmdLeft' || hidName === 'ShiftLeft' || hidName === 'AltLeft') {
    return toRecordedModifierCode(hidName)
  }

  if (/^[A-Z]$/.test(hidName)) {
    return `Key${hidName}`
  }

  if (/^Num[0-9]$/.test(hidName)) {
    return `Digit${hidName.slice(3)}`
  }

  switch (hidName) {
    case 'Up':
      return 'ArrowUp'
    case 'Down':
      return 'ArrowDown'
    case 'Left':
      return 'ArrowLeft'
    case 'Right':
      return 'ArrowRight'
    case 'Grave':
      return 'Backquote'
    case 'Apostrophe':
      return 'Quote'
    default:
      return hidName
  }
}

function makeRecordedShortcut(
  triggerWords: string[],
  recordedKeys: string[],
  keyCodes: string[] = []
): KeyboardShortcut {
  return {
    id: nextId(),
    triggerWords,
    recordedKeys,
    keyCodes,
    enabled: true,
  }
}

export function getDefaultKeyboardShortcuts(platformType: string): KeyboardShortcut[] {
  idCounter = 0
  const isMac = platformType === 'darwin'
  const modName = isMac ? 'CmdLeft' : 'CtrlLeft'

  return [
    makeRecordedShortcut(['复制', '拷贝'], [toRecordedModifierCode(modName), toRecordedKeyCode('C')]),
    makeRecordedShortcut(['粘贴'], [toRecordedModifierCode(modName), toRecordedKeyCode('V')]),
    makeRecordedShortcut(['剪切'], [toRecordedModifierCode(modName), toRecordedKeyCode('X')]),
    makeRecordedShortcut(['撤销'], [toRecordedModifierCode(modName), toRecordedKeyCode('Z')]),
    isMac
      ? makeRecordedShortcut(
          ['重做'],
          [toRecordedModifierCode('CmdLeft'), toRecordedModifierCode('ShiftLeft'), toRecordedKeyCode('Z')]
        )
      : makeRecordedShortcut(['重做'], [toRecordedModifierCode(modName), toRecordedKeyCode('Y')]),
    makeRecordedShortcut(['全选'], [toRecordedModifierCode(modName), toRecordedKeyCode('A')]),
    makeRecordedShortcut(['保存'], [toRecordedModifierCode(modName), toRecordedKeyCode('S')]),
    makeRecordedShortcut(['回车', '换行'], [toRecordedKeyCode('Enter')]),
    makeRecordedShortcut(['删除', '退格'], [toRecordedKeyCode('Backspace')]),
    makeRecordedShortcut(['Tab', '制表符'], [toRecordedKeyCode('Tab')]),
    isMac
      ? makeRecordedShortcut(['切换窗口'], [toRecordedModifierCode('CmdLeft'), toRecordedKeyCode('Tab')])
      : makeRecordedShortcut(['切换窗口'], [toRecordedModifierCode('AltLeft'), toRecordedKeyCode('Tab')]),
    makeRecordedShortcut(['取消', '退出'], [toRecordedKeyCode('Escape')]),
  ]
}

const MODIFIER_KEY_NAMES = new Set(['CtrlLeft', 'CmdLeft', 'ShiftLeft', 'AltLeft'])

export const KEY_CATEGORIES = {
  modifiers: ['CtrlLeft', 'CmdLeft', 'ShiftLeft', 'AltLeft'],
  letters: [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
  ],
  numbers: ['Num1', 'Num2', 'Num3', 'Num4', 'Num5', 'Num6', 'Num7', 'Num8', 'Num9', 'Num0'],
  function: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
  arrows: ['Up', 'Down', 'Left', 'Right'],
  special: ['Enter', 'Escape', 'Backspace', 'Tab', 'Space', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown'],
  punctuation: [
    'Minus',
    'Equal',
    'BracketLeft',
    'BracketRight',
    'Backslash',
    'Semicolon',
    'Apostrophe',
    'Grave',
    'Comma',
    'Period',
    'Slash',
  ],
} as const

/**
 * 根据 UI 中选择的按键数组构造底层 keyCodes。
 * 修饰键先按下，普通键按下/抬起，最后修饰键逆序抬起。
 */
export function buildKeyCodes(keys: string[]): string[] {
  const modifiers = keys.filter((key) => MODIFIER_KEY_NAMES.has(key))
  const normalKeys = keys.filter((key) => !MODIFIER_KEY_NAMES.has(key))
  const codes: string[] = []

  for (const modifier of modifiers) {
    const hid = HID[modifier as keyof typeof HID]
    if (hid) {
      codes.push(keyDown(hid))
    }
  }

  for (const key of normalKeys) {
    const hid = HID[key as keyof typeof HID]
    if (!hid) {
      continue
    }
    codes.push(keyDown(hid))
    codes.push(keyUp(hid))
  }

  for (let index = modifiers.length - 1; index >= 0; index -= 1) {
    const hid = HID[modifiers[index] as keyof typeof HID]
    if (hid) {
      codes.push(keyUp(hid))
    }
  }

  return codes
}

export { HID }
