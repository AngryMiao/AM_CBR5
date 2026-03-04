import type { KeyboardShortcut } from '../types/voice'

// USB HID key codes (without 0x00 prefix)
const HID = {
  CtrlLeft: '0700E0',
  CmdLeft: '0700E3',
  ShiftLeft: '0700E1',
  AltLeft: '0700E2',
  A: '070004',
  C: '070006',
  S: '070016',
  V: '070019',
  X: '07001B',
  Y: '07001C',
  Z: '07001D',
  Enter: '070028',
  Escape: '070029',
  Backspace: '07002A',
  Tab: '07002B',
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

export { HID }
