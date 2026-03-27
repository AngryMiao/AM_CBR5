import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  audioLevelAtom,
  isRecordingAtom,
  streamingTextAtom,
  transcriptAtom,
  typelessStatusAtom,
  voiceModeAtom,
} from '@/stores/voiceStore'

/**
 * Typeless 模式的极简浮动面板
 * 显示录音状态和实时转录文本
 */
export function TypelessPanel() {
  const voiceMode = useAtomValue(voiceModeAtom)
  const isRecording = useAtomValue(isRecordingAtom)
  const transcript = useAtomValue(transcriptAtom)
  const audioLevel = useAtomValue(audioLevelAtom)
  const streamingText = useAtomValue(streamingTextAtom)
  const status = useAtomValue(typelessStatusAtom)

  const [visible, setVisible] = useState(false)

  // 自动显示/隐藏
  useEffect(() => {
    if (voiceMode === 'listening' || voiceMode === 'processing') {
      setVisible(true)
    } else if (voiceMode === 'inactive') {
      const timer = setTimeout(() => setVisible(false), 500)
      return () => clearTimeout(timer)
    }
  }, [voiceMode])

  const statusConfigMap = {
    executing: { icon: '⚙️', bgColor: 'bg-blue-600/95' },
    inserting: { icon: '✏️', bgColor: 'bg-yellow-600/95' },
    thinking: { icon: '💭', bgColor: 'bg-purple-600/95' },
    success: { icon: '✅', bgColor: 'bg-green-600/95' },
    error: { icon: '❌', bgColor: 'bg-red-600/95' },
  } as const

  const getBgColor = () => {
    if (status && status.type in statusConfigMap) {
      return statusConfigMap[status.type as keyof typeof statusConfigMap].bgColor
    }
    if (voiceMode === 'processing') {
      return 'bg-yellow-600/95'
    }
    return 'bg-gray-900/95'
  }

  const getStatusIcon = () => {
    if (status && status.type in statusConfigMap) {
      return statusConfigMap[status.type as keyof typeof statusConfigMap].icon
    }
    return null
  }

  if (!visible) return null

  return (
    <div
      className={cn(
        'fixed bottom-8 left-1/2 -translate-x-1/2 z-50',
        'px-6 py-3 rounded-full shadow-xl',
        'text-white',
        'flex items-center gap-3',
        'transition-all duration-200',
        getBgColor()
      )}
    >
      {/* 状态指示器 */}
      {getStatusIcon() ? (
        <span className="text-base">{getStatusIcon()}</span>
      ) : (
        <div className={cn('w-3 h-3 rounded-full', isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-500')} />
      )}

      {/* 音频波形 */}
      {isRecording && !status && (
        <div className="flex items-center gap-0.5 h-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-white/80 rounded-full transition-all"
              style={{
                height: `${Math.max(4, Math.min(16, audioLevel * 100 * (i % 2 === 0 ? 1 : 0.7) + 4))}px`,
              }}
            />
          ))}
        </div>
      )}

      {/* 内容 */}
      {status ? (
        <span className="text-sm max-w-xs truncate">{status.message}</span>
      ) : isRecording ? (
        streamingText && <span className="text-sm max-w-xs truncate">{streamingText}</span>
      ) : (
        transcript && <span className="text-sm max-w-xs truncate">{transcript}</span>
      )}

      {/* 处理中指示 */}
      {voiceMode === 'processing' && !status && <span className="text-sm">插入中...</span>}
    </div>
  )
}
