import { useSettingsStore } from '@/stores/settingsStore'
import type { VoiceSettings } from '@shared/types/voice'
import platform from '@/platform'
import { useEffect, useRef } from 'react'
import { getDefaultKeyboardShortcuts } from '@shared/defaults/keyboard-shortcuts'

/**
 * Hook to access voice settings from the settings store
 */
export function useVoiceSettings() {
  const voiceSettings = useSettingsStore((state) => state.voice)
  const setSettings = useSettingsStore((state) => state.setSettings)

  const setVoiceSettings = async (settings: Partial<VoiceSettings>) => {
    setSettings((draft) => {
      draft.voice = {
        ...draft.voice,
        ...settings,
      } as any
    })

    // 通知主进程重新注册快捷键
    if (platform.type === 'desktop') {
      try {
        await window.electronAPI?.invoke('ensureVoiceShortcut')
        console.log('Voice shortcut updated')
      } catch (error) {
        console.error('Failed to update voice shortcut:', error)
      }
    }
  }

  // Return default settings if voice is undefined
  const defaultSettings: VoiceSettings = {
    enabled: false,
    asrProvider: 'whisper-local',
    ttsProvider: 'browser',
    asrConfig: {},
    ttsConfig: {},
    shortcuts: { toggleVoice: 'Ctrl+Shift+V' },
    keyboardShortcuts: [],
    autoStopRecording: true,
    silenceThreshold: 0.01,
    silenceDuration: 1500,
    maxRecordingDuration: 60000,
    autoPlayResponse: true,
    showTranscript: true,
  }

  const currentSettings = voiceSettings || defaultSettings

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
