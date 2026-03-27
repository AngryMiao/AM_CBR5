import { defaultVoiceSettings } from '@shared/defaults'
import { getDefaultKeyboardShortcuts } from '@shared/defaults/keyboard-shortcuts'
import type { VoiceSettings } from '@shared/types/voice'
import { useEffect, useMemo, useRef } from 'react'
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

/**
 * Hook to access voice settings from the settings store
 */
export function useVoiceSettings() {
  const voiceSettings = useSettingsStore((state) => state.voice)
  const setSettings = useSettingsStore((state) => state.setSettings)

  const defaultSettings = useMemo<VoiceSettings>(() => defaultVoiceSettings(), [])
  const currentSettings = useMemo<VoiceSettings>(
    () => (voiceSettings ? { ...defaultSettings, ...voiceSettings } : defaultSettings),
    [defaultSettings, voiceSettings]
  )

  const setVoiceSettings = async (nextSettings: VoiceSettingsUpdate) => {
    const resolvedSettings = typeof nextSettings === 'function' ? nextSettings(currentSettings) : nextSettings
    const sanitizedSettings = removeUndefinedFields<VoiceSettings>(resolvedSettings)
    const merged: VoiceSettings = { ...currentSettings, ...sanitizedSettings }

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
  }

  // Auto-fill keyboard shortcuts when empty
  const initRef = useRef(false)
  useEffect(() => {
    if (initRef.current) return
    if (!currentSettings.keyboardShortcuts || currentSettings.keyboardShortcuts.length === 0) {
      initRef.current = true
      platform.getPlatform().then((platformType) => {
        const defaults = getDefaultKeyboardShortcuts(platformType)
        setVoiceSettings({ keyboardShortcuts: defaults })
      })
    }
  }, [currentSettings.keyboardShortcuts])

  return {
    settings: currentSettings,
    setSettings: setVoiceSettings,
  }
}
