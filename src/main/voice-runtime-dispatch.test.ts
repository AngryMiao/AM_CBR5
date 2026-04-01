import { describe, expect, it, vi } from 'vitest'
import { syncVoiceRuntimeDispatch, shouldUseVoiceRuntimeDispatch } from './voice-runtime-dispatch'

function createWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
  }
}

describe('voice runtime dispatch', () => {
  it('uses the hidden voice runtime window in typeless mode', () => {
    const voiceRuntimeWindow = createWindow()
    const mainWindow = createWindow()
    const ensureVoiceRuntimeWindow = vi.fn(() => voiceRuntimeWindow)
    const destroyVoiceRuntimeWindow = vi.fn()
    const setHotkeyDispatchWindow = vi.fn()

    const dispatchWindow = syncVoiceRuntimeDispatch({
      voiceEnabled: true,
      workMode: 'typeless',
      mainWindow,
      ensureVoiceRuntimeWindow,
      destroyVoiceRuntimeWindow,
      setHotkeyDispatchWindow,
    })

    expect(dispatchWindow).toBe(voiceRuntimeWindow)
    expect(ensureVoiceRuntimeWindow).toHaveBeenCalledTimes(1)
    expect(destroyVoiceRuntimeWindow).not.toHaveBeenCalled()
    expect(setHotkeyDispatchWindow).toHaveBeenCalledWith(voiceRuntimeWindow)
  })

  it('falls back to the main window outside typeless mode', () => {
    const mainWindow = createWindow()
    const ensureVoiceRuntimeWindow = vi.fn()
    const destroyVoiceRuntimeWindow = vi.fn()
    const setHotkeyDispatchWindow = vi.fn()

    const dispatchWindow = syncVoiceRuntimeDispatch({
      voiceEnabled: true,
      workMode: 'chat',
      mainWindow,
      ensureVoiceRuntimeWindow,
      destroyVoiceRuntimeWindow,
      setHotkeyDispatchWindow,
    })

    expect(dispatchWindow).toBe(mainWindow)
    expect(ensureVoiceRuntimeWindow).not.toHaveBeenCalled()
    expect(destroyVoiceRuntimeWindow).toHaveBeenCalledTimes(1)
    expect(setHotkeyDispatchWindow).toHaveBeenCalledWith(mainWindow)
  })

  it('keeps typeless dispatch alive even when the chatbox window is gone', () => {
    const voiceRuntimeWindow = createWindow()
    const ensureVoiceRuntimeWindow = vi.fn(() => voiceRuntimeWindow)
    const destroyVoiceRuntimeWindow = vi.fn()
    const setHotkeyDispatchWindow = vi.fn()

    const dispatchWindow = syncVoiceRuntimeDispatch({
      voiceEnabled: true,
      workMode: 'typeless',
      mainWindow: null,
      ensureVoiceRuntimeWindow,
      destroyVoiceRuntimeWindow,
      setHotkeyDispatchWindow,
    })

    expect(dispatchWindow).toBe(voiceRuntimeWindow)
    expect(ensureVoiceRuntimeWindow).toHaveBeenCalledTimes(1)
    expect(setHotkeyDispatchWindow).toHaveBeenCalledWith(voiceRuntimeWindow)
  })

  it('returns null when voice runtime is not needed and there is no main window', () => {
    const ensureVoiceRuntimeWindow = vi.fn()
    const destroyVoiceRuntimeWindow = vi.fn()
    const setHotkeyDispatchWindow = vi.fn()

    const dispatchWindow = syncVoiceRuntimeDispatch({
      voiceEnabled: false,
      workMode: 'chat',
      mainWindow: null,
      ensureVoiceRuntimeWindow,
      destroyVoiceRuntimeWindow,
      setHotkeyDispatchWindow,
    })

    expect(dispatchWindow).toBeNull()
    expect(ensureVoiceRuntimeWindow).not.toHaveBeenCalled()
    expect(destroyVoiceRuntimeWindow).toHaveBeenCalledTimes(1)
    expect(setHotkeyDispatchWindow).toHaveBeenCalledWith(null)
  })

  it('does not recreate the background runtime while the app is quitting', () => {
    const ensureVoiceRuntimeWindow = vi.fn()
    const destroyVoiceRuntimeWindow = vi.fn()
    const setHotkeyDispatchWindow = vi.fn()

    const dispatchWindow = syncVoiceRuntimeDispatch({
      isQuitting: true,
      voiceEnabled: true,
      workMode: 'typeless',
      mainWindow: null,
      ensureVoiceRuntimeWindow,
      destroyVoiceRuntimeWindow,
      setHotkeyDispatchWindow,
    })

    expect(dispatchWindow).toBeNull()
    expect(ensureVoiceRuntimeWindow).not.toHaveBeenCalled()
    expect(destroyVoiceRuntimeWindow).toHaveBeenCalledTimes(1)
    expect(setHotkeyDispatchWindow).toHaveBeenCalledWith(null)
  })

  it('marks only enabled typeless voice as requiring the background runtime', () => {
    expect(shouldUseVoiceRuntimeDispatch({ voiceEnabled: true, workMode: 'typeless' })).toBe(true)
    expect(shouldUseVoiceRuntimeDispatch({ voiceEnabled: true, workMode: 'chat' })).toBe(false)
    expect(shouldUseVoiceRuntimeDispatch({ voiceEnabled: false, workMode: 'typeless' })).toBe(false)
  })
})
