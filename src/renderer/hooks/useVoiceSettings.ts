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
    setSettings((draft) => {
      draft.voice = {
        ...draft.voice,
        ...settings,
      } as any
    })

    // 通知主进程重新注册快捷键
    if (platform.type === 'desktop') {
      try {
        // 如果修改了 toggleVoice 快捷键，直接传递新值给主进程
        const newShortcut = settings.shortcuts?.toggleVoice
        await window.electronAPI?.invoke('ensureVoiceShortcut', newShortcut)
        await window.electronAPI?.invoke('ensureFunASRService')
        console.log('Voice shortcut updated:', newShortcut || 'default')
      } catch (error) {
        console.error('Failed to update voice shortcut:', error)
      }
    }
  }

  // Return default settings if voice is undefined
  const defaultSettings: VoiceSettings = defaultVoiceSettings()

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
