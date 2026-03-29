import { defaultVoiceSettings } from '@shared/defaults'
import { getDefaultKeyboardShortcuts } from '@shared/defaults/keyboard-shortcuts'
import type { VoiceSettings } from '@shared/types/voice'
import { normalizeStoredVoiceHotkey } from '@shared/voice-hotkey'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import platform from '@/platform'
import { useSettingsStore } from '@/stores/settingsStore'

function removeUndefinedFields<T extends Record<string, unknown>>(source: Partial<T>): Partial<T> {
  const result: Partial<T> = {}
  for (const key of Object.keys(source) as (keyof T)[]) {
    const value = source[key]
    if (value !== undefined) {
      result[key] = value
    }
  }
  return result
}

type VoiceSettingsUpdate = Partial<VoiceSettings> | ((prev: VoiceSettings) => Partial<VoiceSettings>)

function hasOwnKey<T extends object>(source: T, key: PropertyKey): boolean {
  return Object.hasOwn(source, key)
}

/**
 * Hook to access voice settings from the settings store
 */
export function useVoiceSettings() {
  const voiceSettings = useSettingsStore((state) => state.voice)
  const setSettings = useSettingsStore((state) => state.setSettings)

  const defaultSettings = useMemo<VoiceSettings>(() => defaultVoiceSettings(), [])
  const currentSettings = useMemo<VoiceSettings>(() => {
    const merged = voiceSettings ? { ...defaultSettings, ...voiceSettings } : defaultSettings
    return {
      ...merged,
      shortcuts: {
        ...merged.shortcuts,
        toggleVoice: normalizeStoredVoiceHotkey(merged.shortcuts?.toggleVoice),
      },
    }
  }, [defaultSettings, voiceSettings])

  const setVoiceSettings = useCallback(
    async (nextSettings: VoiceSettingsUpdate) => {
      const resolvedSettings = typeof nextSettings === 'function' ? nextSettings(currentSettings) : nextSettings
      const sanitizedSettings = removeUndefinedFields<VoiceSettings>(resolvedSettings)
      const merged: VoiceSettings = {
        ...currentSettings,
        ...sanitizedSettings,
        ...(hasOwnKey(resolvedSettings, 'microphoneDeviceId')
          ? { microphoneDeviceId: resolvedSettings.microphoneDeviceId }
          : {}),
        shortcuts: {
          ...currentSettings.shortcuts,
          ...sanitizedSettings.shortcuts,
          toggleVoice: normalizeStoredVoiceHotkey(
            sanitizedSettings.shortcuts?.toggleVoice ?? currentSettings.shortcuts.toggleVoice
          ),
        },
      }

      setSettings((draft) => {
        draft.voice = merged
      })

      if (platform.type === 'desktop') {
        try {
          await window.electronAPI?.invoke('ensureVoiceShortcut', {
            enabled: merged.enabled,
            shortcut: merged.shortcuts?.toggleVoice,
            workMode: merged.workMode,
          })
          await window.electronAPI?.invoke('ensureFunASRService')
          console.log('Voice shortcut updated:', merged.shortcuts?.toggleVoice || 'default', 'enabled:', merged.enabled)
        } catch (error) {
          console.error('Failed to update voice shortcut:', error)
        }
      }
    },
    [currentSettings, setSettings]
  )

  const initKeyboardShortcutsRef = useRef(false)

  useEffect(() => {
    if (initKeyboardShortcutsRef.current) {
      return
    }
    if ((currentSettings.keyboardShortcuts || []).length > 0) {
      initKeyboardShortcutsRef.current = true
      return
    }

    initKeyboardShortcutsRef.current = true
    void platform.getPlatform().then((platformType) => {
      const defaults = getDefaultKeyboardShortcuts(platformType)
      void setVoiceSettings({ keyboardShortcuts: defaults })
    })
  }, [currentSettings.keyboardShortcuts, setVoiceSettings])

  return {
    settings: currentSettings,
    setSettings: setVoiceSettings,
  }
}
