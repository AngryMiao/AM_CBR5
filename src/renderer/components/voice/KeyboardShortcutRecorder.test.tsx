/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KeyboardShortcutRecorder } from './KeyboardShortcutRecorder'

describe('KeyboardShortcutRecorder', () => {
  it('records a single key using KeyboardEvent.code', () => {
    const onChange = vi.fn()

    render(<KeyboardShortcutRecorder value={[]} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '录制' }))
    fireEvent.keyDown(window, { code: 'KeyA', key: 'a' })
    fireEvent.keyUp(window, { code: 'KeyA', key: 'a' })

    expect(onChange).toHaveBeenCalledWith(['KeyA'])
    expect(screen.getByDisplayValue('A')).toBeTruthy()
  })

  it('records multiple keys and orders modifiers first', () => {
    const onChange = vi.fn()

    render(<KeyboardShortcutRecorder value={[]} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '录制' }))
    fireEvent.keyDown(window, { code: 'KeyV', key: 'v' })
    fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control' })
    fireEvent.keyUp(window, { code: 'KeyV', key: 'v' })

    expect(onChange).toHaveBeenCalledWith(['ControlLeft', 'KeyV'])
    expect(screen.getByDisplayValue('CtrlLeft + V')).toBeTruthy()
  })

  it('restores previous value when recording is cancelled by Escape', () => {
    const onChange = vi.fn()

    render(<KeyboardShortcutRecorder value={['ControlLeft', 'KeyV']} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '录制' }))
    fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('CtrlLeft + V')).toBeTruthy()
  })

  it('clears the value on Backspace', () => {
    const onChange = vi.fn()

    render(<KeyboardShortcutRecorder value={['ControlLeft', 'KeyV']} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '录制' }))
    fireEvent.keyDown(window, { code: 'Backspace', key: 'Backspace' })

    expect(onChange).toHaveBeenCalledWith([])
    expect(screen.getByDisplayValue('')).toBeTruthy()
  })

  it('does not accept more than six keys', () => {
    const onChange = vi.fn()

    render(<KeyboardShortcutRecorder value={[]} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '录制' }))
    ;['ControlLeft', 'ShiftLeft', 'AltLeft', 'MetaLeft', 'KeyA', 'KeyB', 'KeyC'].forEach((code) => {
      fireEvent.keyDown(window, { code, key: code })
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('最多录制 6 个键')).toBeTruthy()
  })
})
