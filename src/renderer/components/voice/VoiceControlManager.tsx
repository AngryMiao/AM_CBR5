import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { voiceSettingsAtom } from '@/stores/voiceStore'
import { useVoiceController } from '@/hooks/useVoiceController'
import platform from '@/platform'

/**
 * 全局语音控制管理器
 * 负责监听快捷键并触发语音录制
 */
export function VoiceControlManager() {
  const settings = useAtomValue(voiceSettingsAtom)
  const { startRecording, stopRecording, toggleRecording } = useVoiceController()

  useEffect(() => {
    // 只在桌面端注册快捷键监听
    if (platform.type !== 'desktop' || !settings.enabled) {
      return
    }

    // 监听来自主进程的语音切换事件
    const cleanup = window.electronAPI?.onVoiceToggle(() => {
      console.log('Voice toggle triggered by shortcut')
      toggleRecording()
    })

    return cleanup
  }, [settings.enabled, toggleRecording])

  // 这个组件不渲染任何内容
  return null
}
