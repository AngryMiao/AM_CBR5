import { describe, expect, it } from 'vitest'
import { getDefaultKeyboardShortcuts } from './defaults/keyboard-shortcuts'
import { SettingsSchema } from './types'
import { KeyboardShortcutSchema } from './types/voice'
import { getRecordedKeyDisplayLabel, hasStableHidMapping, orderRecordedKeys } from './voice-key-reference'

describe('KeyboardShortcutSchema', () => {
  it('accepts keyboard shortcuts without a name field', () => {
    const shortcut = KeyboardShortcutSchema.parse({
      id: 'ks_1',
      triggerWords: ['粘贴'],
      keyCodes: [],
      recordedKeys: ['ControlLeft', 'KeyV'],
      enabled: true,
    })

    expect(shortcut.recordedKeys).toEqual(['ControlLeft', 'KeyV'])
    expect('name' in shortcut).toBe(false)
  })

  it('preserves recordedKeys in stored voice keyboard shortcuts', () => {
    const settings = SettingsSchema.parse({
      theme: 0,
      language: 'zh-Hans',
      shortcuts: {
        quickToggle: '',
        inputBoxSendMessage: 'Enter',
      },
      extension: {},
      mcp: {
        servers: [],
        enabledBuiltinServers: [],
      },
      voice: {
        keyboardShortcuts: [
          {
            id: 'ks_custom_paste',
            triggerWords: ['粘贴'],
            recordedKeys: ['ControlLeft', 'KeyV'],
            keyCodes: [],
            enabled: true,
          },
        ],
      },
    })

    expect(settings.voice?.keyboardShortcuts[0].recordedKeys).toEqual(['ControlLeft', 'KeyV'])
  })

  it('builds default keyboard shortcuts directly in recordedKeys form', () => {
    expect(getDefaultKeyboardShortcuts('win32')[1]).toMatchObject({
      triggerWords: ['粘贴'],
      recordedKeys: ['ControlLeft', 'KeyV'],
      keyCodes: [],
    })
    expect(getDefaultKeyboardShortcuts('darwin')[1]).toMatchObject({
      triggerWords: ['粘贴'],
      recordedKeys: ['MetaLeft', 'KeyV'],
      keyCodes: [],
    })
  })
})

describe('voice-key-reference helpers', () => {
  it('maps keyboard event codes to compact display labels', () => {
    expect(getRecordedKeyDisplayLabel('ControlLeft')).toBe('CtrlLeft')
    expect(getRecordedKeyDisplayLabel('ControlRight')).toBe('CtrlRight')
    expect(getRecordedKeyDisplayLabel('KeyA')).toBe('A')
  })

  it('keeps modifiers before normal keys when ordering recorded keys', () => {
    expect(orderRecordedKeys(['KeyV', 'ControlLeft', 'ShiftLeft'])).toEqual(['ControlLeft', 'ShiftLeft', 'KeyV'])
  })

  it('reports stable HID coverage for known keys only', () => {
    expect(hasStableHidMapping(['ControlLeft', 'KeyV'])).toBe(true)
    expect(hasStableHidMapping(['ControlRight', 'KeyV'])).toBe(true)
    expect(hasStableHidMapping(['IntlRo'])).toBe(false)
  })
})
