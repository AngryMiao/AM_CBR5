import { describe, expect, it } from 'vitest'
import { SettingsSchema } from './types'
import { KeyboardShortcutSchema } from './types/voice'
import { getRecordedKeyDisplayLabel, hasStableHidMapping, orderRecordedKeys } from './voice-key-reference'

describe('KeyboardShortcutSchema', () => {
  it('accepts recordedKeys as optional keyboard event codes', () => {
    expect(
      KeyboardShortcutSchema.parse({
        id: 'ks_1',
        name: '粘贴',
        triggerWords: ['粘贴'],
        keyCodes: ['110700E0', '11070019', '10070019', '100700E0'],
        recordedKeys: ['ControlLeft', 'KeyV'],
        enabled: true,
      }).recordedKeys
    ).toEqual(['ControlLeft', 'KeyV'])
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
            name: '粘贴',
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
})

describe('voice-key-reference helpers', () => {
  it('maps keyboard event codes to compact display labels', () => {
    expect(getRecordedKeyDisplayLabel('ControlLeft')).toBe('CtrlLeft')
    expect(getRecordedKeyDisplayLabel('KeyA')).toBe('A')
  })

  it('keeps modifiers before normal keys when ordering recorded keys', () => {
    expect(orderRecordedKeys(['KeyV', 'ControlLeft', 'ShiftLeft'])).toEqual(['ControlLeft', 'ShiftLeft', 'KeyV'])
  })

  it('reports stable HID coverage for known keys only', () => {
    expect(hasStableHidMapping(['ControlLeft', 'KeyV'])).toBe(true)
    expect(hasStableHidMapping(['IntlRo'])).toBe(false)
  })
})
