import { useSettingsStore } from '@/stores/settingsStore'
import type { VoiceSettings } from '@shared/types/voice'
import platform from '@/platform'
import { useEffect, useRef } from 'react'
import { getDefaultKeyboardShortcuts } from '@shared/defaults/keyboard-shortcuts'
import { defaultVoiceSettings } from '@shared/defaults'

/**
 * Hook to access voice settings from the settings store
 */
export function useVoiceSettings() {
  const voiceSettings = useSettingsStore((state) => state.voice)
  const setSettings = useSettingsStore((state) => state.setSettings)

  const setVoiceSettings = async (settings: Partial<VoiceSettings>) => {
    const merged = { ...currentSettings, ...settings }
    setSettings((draft) => {
      draft.voice = {
        ...draft.voice,
        ...settings,
      } as any
    })

    if (platform.type === 'desktop') {
      try {
        await window.electronAPI?.invoke('ensureVoiceShortcut', {
          enabled: merged.enabled,
          shortcut: merged.shortcuts?.toggleVoice,
        })
        await window.electronAPI?.invoke('ensureFunASRService')
        console.log('Voice shortcut updated:', merged.shortcuts?.toggleVoice || 'default', 'enabled:', merged.enabled)
      } catch (error) {
        console.error('Failed to update voice shortcut:', error)
      }
    }
  }

  const defaultSettings: VoiceSettings = defaultVoiceSettings()
  const currentSettings = voiceSettings
    ? { ...defaultSettings, ...voiceSettings }
    : defaultSettings

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
