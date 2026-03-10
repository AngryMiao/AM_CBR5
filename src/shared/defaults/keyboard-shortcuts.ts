import type { KeyboardShortcut } from '../types/voice'

// USB HID key codes (without 0x00 prefix)
const HID = {
  // Modifier keys
  CtrlLeft: '0700E0',
  CmdLeft: '0700E3',
  ShiftLeft: '0700E1',
  AltLeft: '0700E2',
  // Letters A-Z
  A: '070004', B: '070005', C: '070006', D: '070007', E: '070008',
  F: '070009', G: '07000A', H: '07000B', I: '07000C', J: '07000D',
  K: '07000E', L: '07000F', M: '070010', N: '070011', O: '070012',
  P: '070013', Q: '070014', R: '070015', S: '070016', T: '070017',
  U: '070018', V: '070019', W: '07001A', X: '07001B', Y: '07001C',
  Z: '07001D',
  // Number keys 1-9, 0
  Num1: '07001E', Num2: '07001F', Num3: '070020', Num4: '070021', Num5: '070022',
  Num6: '070023', Num7: '070024', Num8: '070025', Num9: '070026', Num0: '070027',
  // Common editing keys
  Enter: '070028', Escape: '070029', Backspace: '07002A', Tab: '07002B', Space: '07002C',
  // Punctuation
  Minus: '07002D', Equal: '07002E', BracketLeft: '07002F', BracketRight: '070030',
  Backslash: '070031', Semicolon: '070033', Apostrophe: '070034',
  Grave: '070035', Comma: '070036', Period: '070037', Slash: '070038',
  // Function keys F1-F12
  F1: '07003A', F2: '07003B', F3: '07003C', F4: '07003D', F5: '07003E', F6: '07003F',
  F7: '070040', F8: '070041', F9: '070042', F10: '070043', F11: '070044', F12: '070045',
  // Navigation keys
  PrintScreen: '070046',
  Insert: '070049', Home: '07004A', PageUp: '07004B',
  Delete: '07004C', End: '07004D', PageDown: '07004E',
  // Arrow keys
  Right: '07004F', Left: '070050', Down: '070051', Up: '070052',
} as const

/**
 * Generate hex key codes for a key press+release pair.
 * Format: XXYYYYYY where X1=1(lowercase)/2(shift), X2=1(down)/0(up), YYYYYY=HID code
 */
function keyDown(hid: string): string {
  return `11${hid}`
}

function keyUp(hid: string): string {
  return `10${hid}`
}

/**
 * Build a combo sequence: modifier(s) down → key down → key up → modifier(s) up (reverse order)
 */
export function makeCombo(modifiers: string[], key: string): string[] {
  const codes: string[] = []
  for (const mod of modifiers) {
    codes.push(keyDown(mod))
  }
  codes.push(keyDown(key))
  codes.push(keyUp(key))
  for (let i = modifiers.length - 1; i >= 0; i--) {
    codes.push(keyUp(modifiers[i]))
  }
  return codes
}

/**
 * Build a single key press+release sequence
 */
export function makeSingleKey(key: string): string[] {
  return [keyDown(key), keyUp(key)]
}

let idCounter = 0
function nextId(): string {
  return `ks_${++idCounter}`
}

export function getDefaultKeyboardShortcuts(platformType: string): KeyboardShortcut[] {
  idCounter = 0
  const isMac = platformType === 'darwin'
  const mod = isMac ? HID.CmdLeft : HID.CtrlLeft

  return [
    {
      id: nextId(),
      name: '复制',
      triggerWords: ['复制', '拷贝'],
      keyCodes: makeCombo([mod], HID.C),
      enabled: true,
    },
    {
      id: nextId(),
      name: '粘贴',
      triggerWords: ['粘贴'],
      keyCodes: makeCombo([mod], HID.V),
      enabled: true,
    },
    {
      id: nextId(),
      name: '剪切',
      triggerWords: ['剪切'],
      keyCodes: makeCombo([mod], HID.X),
      enabled: true,
    },
    {
      id: nextId(),
      name: '撤销',
      triggerWords: ['撤销'],
      keyCodes: makeCombo([mod], HID.Z),
      enabled: true,
    },
    {
      id: nextId(),
      name: '重做',
      triggerWords: ['重做'],
      keyCodes: isMac
        ? makeCombo([HID.CmdLeft, HID.ShiftLeft], HID.Z)
        : makeCombo([mod], HID.Y),
      enabled: true,
    },
    {
      id: nextId(),
      name: '全选',
      triggerWords: ['全选'],
      keyCodes: makeCombo([mod], HID.A),
      enabled: true,
    },
    {
      id: nextId(),
      name: '保存',
      triggerWords: ['保存'],
      keyCodes: makeCombo([mod], HID.S),
      enabled: true,
    },
    {
      id: nextId(),
      name: '回车',
      triggerWords: ['回车', '换行'],
      keyCodes: makeSingleKey(HID.Enter),
      enabled: true,
    },
    {
      id: nextId(),
      name: '删除',
      triggerWords: ['删除', '退格'],
      keyCodes: makeSingleKey(HID.Backspace),
      enabled: true,
    },
    {
      id: nextId(),
      name: 'Tab',
      triggerWords: ['Tab', '制表符'],
      keyCodes: makeSingleKey(HID.Tab),
      enabled: true,
    },
    {
      id: nextId(),
      name: '切换窗口',
      triggerWords: ['切换窗口'],
      keyCodes: isMac
        ? makeCombo([HID.CmdLeft], HID.Tab)
        : makeCombo([HID.AltLeft], HID.Tab),
      enabled: true,
    },
    {
      id: nextId(),
      name: 'Esc',
      triggerWords: ['取消', '退出'],
      keyCodes: makeSingleKey(HID.Escape),
      enabled: true,
    },
  ]
}

// Key categories for UI pickers
const MODIFIER_KEY_NAMES = new Set(['CtrlLeft', 'CmdLeft', 'ShiftLeft', 'AltLeft'])

export const KEY_CATEGORIES = {
  modifiers: ['CtrlLeft', 'CmdLeft', 'ShiftLeft', 'AltLeft'],
  letters: ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'],
  numbers: ['Num1','Num2','Num3','Num4','Num5','Num6','Num7','Num8','Num9','Num0'],
  function: ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'],
  arrows: ['Up','Down','Left','Right'],
  special: ['Enter','Escape','Backspace','Tab','Space','Delete','Insert','Home','End','PageUp','PageDown'],
  punctuation: ['Minus','Equal','BracketLeft','BracketRight','Backslash','Semicolon','Apostrophe','Grave','Comma','Period','Slash'],
} as const

/**
 * Build key codes from an array of key names (e.g. ['CtrlLeft', 'C']).
 * Modifier keys are pressed first (in order), normal keys are pressed/released,
 * then modifier keys are released in reverse order.
 */
export function buildKeyCodes(keys: string[]): string[] {
  const modifiers = keys.filter((k) => MODIFIER_KEY_NAMES.has(k))
  const normalKeys = keys.filter((k) => !MODIFIER_KEY_NAMES.has(k))
  const codes: string[] = []
  for (const mod of modifiers) {
    const hid = HID[mod as keyof typeof HID]
    if (hid) codes.push(keyDown(hid))
  }
  for (const k of normalKeys) {
    const hid = HID[k as keyof typeof HID]
    if (hid) {
      codes.push(keyDown(hid))
      codes.push(keyUp(hid))
    }
  }
  for (let i = modifiers.length - 1; i >= 0; i--) {
    const hid = HID[modifiers[i] as keyof typeof HID]
    if (hid) codes.push(keyUp(hid))
  }
  return codes
}

export { HID }
