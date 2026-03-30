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
  it('creates a custom shortcut using recordedKeys instead of rebuilding keyCodes locally', () => {
    const onKeyboardShortcutsChange = vi.fn()

    render(
      <KeyboardControlSettings
        keyboardShortcuts={[]}
        onKeyboardDriverPathChange={vi.fn()}
        onKeyboardShortcutsChange={onKeyboardShortcutsChange}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '添加快捷键' }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '粘贴' } })
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
  })

  it('shows a warning when recorded keys do not have stable HID coverage', () => {
    render(
      <KeyboardControlSettings
        keyboardShortcuts={[
          {
            id: 'ks_unknown',
            name: '日文键',
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

  it('keeps legacy shortcuts with keyCodes readable until the user re-records them', () => {
    render(
      <KeyboardControlSettings
        keyboardShortcuts={[
          {
            id: 'ks_legacy',
            name: '粘贴',
            triggerWords: ['粘贴'],
            keyCodes: ['110700E0', '11070019', '10070019', '100700E0'],
            enabled: true,
          },
        ]}
        onKeyboardDriverPathChange={vi.fn()}
        onKeyboardShortcutsChange={vi.fn()}
      />
    )

    expect(screen.getByText('旧版配置：当前仅保存 keyCodes，重新录制后可升级为真实键名配置')).toBeTruthy()
  })
})
