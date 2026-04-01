/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KeyboardControlSettings } from './KeyboardControlSettings'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (value: string) => value,
  }),
}))

describe('KeyboardControlSettings', () => {
  it('creates a custom shortcut with triggerWords and recordedKeys only', () => {
    const onKeyboardShortcutsChange = vi.fn()

    render(
      <KeyboardControlSettings
        keyboardShortcuts={[]}
        onKeyboardDriverPathChange={vi.fn()}
        onKeyboardShortcutsChange={onKeyboardShortcutsChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '添加快捷键' }))
    expect(screen.queryByLabelText('名称')).toBeNull()
    fireEvent.change(screen.getByLabelText('触发词（逗号分隔）'), { target: { value: '粘贴' } })

    fireEvent.click(screen.getByRole('button', { name: '录制' }))
    fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control' })
    fireEvent.keyDown(window, { code: 'KeyV', key: 'v' })
    fireEvent.keyUp(window, { code: 'KeyV', key: 'v' })

    fireEvent.click(screen.getByRole('button', { name: '确认添加' }))

    expect(onKeyboardShortcutsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        triggerWords: ['粘贴'],
        recordedKeys: ['ControlLeft', 'KeyV'],
        keyCodes: [],
      }),
    ])
    expect(onKeyboardShortcutsChange.mock.calls[0]?.[0]?.[0]).not.toHaveProperty('name')
  })

  it('shows a warning when recorded keys do not have stable HID coverage', () => {
    render(
      <KeyboardControlSettings
        keyboardShortcuts={[
          {
            id: 'ks_unknown',
            triggerWords: ['日文键'],
            recordedKeys: ['IntlRo'],
            keyCodes: [],
            enabled: true,
          },
        ]}
        onKeyboardDriverPathChange={vi.fn()}
        onKeyboardShortcutsChange={vi.fn()}
      />
    )

    expect(screen.getByText('该键当前没有稳定 HID 映射，执行可能失败')).toBeTruthy()
  })

  it('shows recorded shortcuts with the recorder UI only and hides the old keyCodes editor', () => {
    render(
      <KeyboardControlSettings
        keyboardShortcuts={[
          {
            id: 'ks_recorded',
            triggerWords: ['粘贴'],
            recordedKeys: ['ControlLeft', 'KeyV'],
            keyCodes: [],
            enabled: true,
          },
        ]}
        onKeyboardDriverPathChange={vi.fn()}
        onKeyboardShortcutsChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByText('粘贴')[0])

    expect(screen.getByDisplayValue('CtrlLeft + V')).toBeTruthy()
    expect(screen.queryByLabelText('名称')).toBeNull()
    expect(screen.queryByLabelText('Key Codes')).toBeNull()
  })

  it('does not show legacy compatibility guidance in the keyboard shortcut editor', () => {
    render(
      <KeyboardControlSettings
        keyboardShortcuts={[
          {
            id: 'ks_legacy',
            triggerWords: ['粘贴'],
            keyCodes: ['110700E0', '11070019', '10070019', '100700E0'],
            enabled: true,
          },
        ]}
        onKeyboardDriverPathChange={vi.fn()}
        onKeyboardShortcutsChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByText('粘贴')[0])

    expect(screen.queryByText('旧版配置：当前仅保存 keyCodes，重新录制后可升级为真实键名配置')).toBeNull()
    expect(screen.queryByRole('button', { name: '重新录制按键组合' })).toBeNull()
    expect(screen.queryByLabelText('Key Codes')).toBeNull()
  })
})
