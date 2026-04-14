const MODIFIER_ORDER = [
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]

const MODIFIER_HID = {
  ControlLeft: '0700E0',
  ControlRight: '0700E4',
  ShiftLeft: '0700E1',
  ShiftRight: '0700E5',
  AltLeft: '0700E2',
  AltRight: '0700E6',
  MetaLeft: '0700E3',
  MetaRight: '0700E7',
}

const KEY_HID = {
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
  Delete: '07004C',
}

const MODIFIER_ALIASES = {
  ctrl: 'ControlLeft',
  control: 'ControlLeft',
  shift: 'ShiftLeft',
  alt: 'AltLeft',
  option: 'AltLeft',
  cmd: 'MetaLeft',
  command: 'MetaLeft',
  meta: 'MetaLeft',
  win: 'MetaLeft',
  windows: 'MetaLeft',
  super: 'MetaLeft',
}

const SPECIAL_KEY_ALIASES = {
  enter: 'Enter',
  return: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  backspace: 'Backspace',
  space: 'Space',
  spacebar: 'Space',
  delete: 'Delete',
}

const modifierRank = new Map(MODIFIER_ORDER.map((code, index) => [code, index]))
const KEYBOARD_ACTIONS = new Set(['tap', 'down', 'up', 'hold', 'reset'])

function keyDown(hid) {
  return `11${hid}`
}

function keyUp(hid) {
  return `10${hid}`
}

function ensureShortcutError(shortcut) {
  throw new Error(
    `无法解析快捷键表达 "${shortcut}"。请使用 F5 / Ctrl+S / Alt+Tab 这类规范形式。`
  )
}

function uniqueKeys(keys) {
  return keys.filter((key, index) => key && keys.indexOf(key) === index)
}

function orderRecordedKeys(keys) {
  const ordered = uniqueKeys(keys)
  const originalOrder = new Map(ordered.map((key, index) => [key, index]))

  return [...ordered].sort((left, right) => {
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

function hidForRecordedKey(code) {
  if (MODIFIER_HID[code]) {
    return MODIFIER_HID[code]
  }

  const letterMatch = /^Key([A-Z])$/.exec(code)
  if (letterMatch) {
    return `0700${(letterMatch[1].charCodeAt(0) - 61)
      .toString(16)
      .toUpperCase()
      .padStart(2, '0')}`
  }

  const digitMatch = /^Digit([0-9])$/.exec(code)
  if (digitMatch) {
    const mapping = {
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
    return mapping[digitMatch[1]]
  }

  if (/^F([1-9]|1[0-2])$/.test(code)) {
    const index = Number(code.slice(1))
    return `0700${(57 + index).toString(16).toUpperCase().padStart(2, '0')}`
  }

  return KEY_HID[code]
}

function normalizeShortcutToken(token, originalShortcut) {
  const trimmed = String(token || '').trim()
  if (!trimmed) {
    ensureShortcutError(originalShortcut)
  }

  if (MODIFIER_HID[trimmed] || KEY_HID[trimmed] || /^Key[A-Z]$/.test(trimmed) || /^Digit[0-9]$/.test(trimmed) || /^F([1-9]|1[0-2])$/.test(trimmed)) {
    return trimmed
  }

  const lower = trimmed.toLowerCase()
  if (MODIFIER_ALIASES[lower]) {
    return MODIFIER_ALIASES[lower]
  }

  if (SPECIAL_KEY_ALIASES[lower]) {
    return SPECIAL_KEY_ALIASES[lower]
  }

  if (/^[a-z]$/i.test(trimmed)) {
    return `Key${trimmed.toUpperCase()}`
  }

  if (/^[0-9]$/.test(trimmed)) {
    return `Digit${trimmed}`
  }

  const functionKey = /^f([1-9]|1[0-2])$/i.exec(trimmed)
  if (functionKey) {
    return `F${functionKey[1]}`
  }

  ensureShortcutError(originalShortcut)
}

function normalizeShortcut(shortcut) {
  const normalizedShortcut = String(shortcut || '').trim()
  if (!normalizedShortcut) {
    throw new Error('keyboard_control 至少需要 shortcut、recordedKeys 或 keyCodes 之一。')
  }

  const recordedKeys = normalizedShortcut
    .split('+')
    .map((token) => normalizeShortcutToken(token, normalizedShortcut))

  return orderRecordedKeys(recordedKeys)
}

function buildKeyCodesFromRecordedKeys(recordedKeys, action = 'tap') {
  const orderedKeys = orderRecordedKeys(
    recordedKeys
      .map((key) => String(key || '').trim())
      .filter(Boolean)
  )
  const normalizedAction = normalizeKeyboardAction(action)
  const modifierKeys = orderedKeys.filter((key) => modifierRank.has(key))
  const normalKeys = orderedKeys.filter((key) => !modifierRank.has(key))

  if (normalizedAction === 'reset') {
    return []
  }

  if (!orderedKeys.length) {
    throw new Error('无法根据 recordedKeys 构造 keyCodes：至少需要一个按键。')
  }

  const keyCodes = []

  if (normalizedAction === 'down' || normalizedAction === 'hold') {
    for (const key of orderedKeys) {
      const hid = hidForRecordedKey(key)
      if (!hid) {
        throw new Error(`无法根据 recordedKeys 构造 keyCodes：未识别按键 ${key}。`)
      }
      keyCodes.push(keyDown(hid))
    }
    return keyCodes
  }

  if (normalizedAction === 'up') {
    for (let index = orderedKeys.length - 1; index >= 0; index -= 1) {
      const hid = hidForRecordedKey(orderedKeys[index])
      if (!hid) {
        throw new Error(
          `无法根据 recordedKeys 构造 keyCodes：未识别按键 ${orderedKeys[index]}。`
        )
      }
      keyCodes.push(keyUp(hid))
    }
    return keyCodes
  }

  for (const modifier of modifierKeys) {
    const hid = hidForRecordedKey(modifier)
    if (!hid) {
      throw new Error(`无法根据 recordedKeys 构造 keyCodes：未识别按键 ${modifier}。`)
    }
    keyCodes.push(keyDown(hid))
  }

  if (!normalKeys.length) {
    for (let index = orderedKeys.length - 1; index >= 0; index -= 1) {
      const hid = hidForRecordedKey(orderedKeys[index])
      if (!hid) {
        throw new Error(
          `无法根据 recordedKeys 构造 keyCodes：未识别按键 ${orderedKeys[index]}。`
        )
      }
      keyCodes.push(keyUp(hid))
    }
    return keyCodes
  }

  for (const key of normalKeys) {
    const hid = hidForRecordedKey(key)
    if (!hid) {
      throw new Error(`无法根据 recordedKeys 构造 keyCodes：未识别按键 ${key}。`)
    }
    keyCodes.push(keyDown(hid))
    keyCodes.push(keyUp(hid))
  }

  for (let index = modifierKeys.length - 1; index >= 0; index -= 1) {
    const hid = hidForRecordedKey(modifierKeys[index])
    if (!hid) {
      throw new Error(`无法根据 recordedKeys 构造 keyCodes：未识别按键 ${modifierKeys[index]}。`)
    }
    keyCodes.push(keyUp(hid))
  }

  return keyCodes
}

function normalizeKeyboardAction(action) {
  const normalizedAction = String(action || 'tap').trim().toLowerCase() || 'tap'
  if (!KEYBOARD_ACTIONS.has(normalizedAction)) {
    throw new Error(
      `不支持的 keyboard_control 动作 "${action}"。请使用 tap / down / up / hold / reset。`
    )
  }
  return normalizedAction
}

function resolveKeyboardRequest({ action, shortcut, recordedKeys, keyCodes }) {
  const normalizedAction = normalizeKeyboardAction(action)
  if (normalizedAction === 'reset') {
    return {
      action: normalizedAction,
      recordedKeys: [],
      keyCodes: [],
    }
  }

  const normalizedKeyCodes = Array.isArray(keyCodes)
    ? keyCodes.map((code) => String(code || '').trim()).filter(Boolean)
    : []
  const normalizedRecordedKeys = Array.isArray(recordedKeys)
    ? recordedKeys.map((key) => String(key || '').trim()).filter(Boolean)
    : []

  if (normalizedKeyCodes.length > 0) {
    if (normalizedAction === 'hold' && normalizedRecordedKeys.length === 0) {
      throw new Error('hold 操作需要 shortcut 或 recordedKeys，以便跟踪按键状态。')
    }
    return {
      action: normalizedAction,
      recordedKeys: orderRecordedKeys(normalizedRecordedKeys),
      keyCodes: normalizedKeyCodes,
    }
  }

  if (normalizedRecordedKeys.length > 0) {
    const orderedKeys = orderRecordedKeys(normalizedRecordedKeys)
    return {
      action: normalizedAction,
      recordedKeys: orderedKeys,
      keyCodes: buildKeyCodesFromRecordedKeys(orderedKeys, normalizedAction),
    }
  }

  if (typeof shortcut === 'string' && shortcut.trim()) {
    const orderedKeys = normalizeShortcut(shortcut)
    return {
      action: normalizedAction,
      recordedKeys: orderedKeys,
      keyCodes: buildKeyCodesFromRecordedKeys(orderedKeys, normalizedAction),
    }
  }

  throw new Error('keyboard_control 至少需要 shortcut、recordedKeys 或 keyCodes 之一。')
}

module.exports = {
  normalizeKeyboardAction,
  normalizeShortcut,
  buildKeyCodesFromRecordedKeys,
  resolveKeyboardRequest,
}
