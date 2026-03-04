import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  audioLevelAtom,
  isRecordingAtom,
  isSpeakingAtom,
  speakingTextAtom,
  transcriptAtom,
  voiceErrorAtom,
  voiceModeAtom,
  voicePanelPositionAtom,
  voicePanelVisibleAtom,
  voiceStatusTextAtom,
} from '@/stores/voiceStore'
import { cn } from '@/lib/utils'

/**
 * 浮动语音面板组件
 */
export function VoicePanel() {
  const { t } = useTranslation()
  const [visible, setVisible] = useAtom(voicePanelVisibleAtom)
  const [position, setPosition] = useAtom(voicePanelPositionAtom)
  const voiceMode = useAtomValue(voiceModeAtom)
  const isRecording = useAtomValue(isRecordingAtom)
  const isSpeaking = useAtomValue(isSpeakingAtom)
  const transcript = useAtomValue(transcriptAtom)
  const speakingText = useAtomValue(speakingTextAtom)
  const audioLevel = useAtomValue(audioLevelAtom)
  const statusText = useAtomValue(voiceStatusTextAtom)
  const error = useAtomValue(voiceErrorAtom)

  const panelRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

  // 拖动处理
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    setIsDragging(true)
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragOffset, setPosition])

  // 自动隐藏面板
  useEffect(() => {
    if (voiceMode === 'inactive') {
      const timer = setTimeout(() => {
        setVisible(false)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [voiceMode, setVisible])

  if (!visible) return null

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed z-50 w-96 rounded-lg shadow-2xl backdrop-blur-md',
        'bg-white/90 dark:bg-gray-900/90',
        'border border-gray-200 dark:border-gray-700',
        'transition-opacity duration-300',
        isDragging ? 'cursor-grabbing' : 'cursor-grab'
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-3 h-3 rounded-full',
              voiceMode === 'listening' && 'bg-green-500 animate-pulse',
              voiceMode === 'processing' && 'bg-yellow-500 animate-pulse',
              voiceMode === 'speaking' && 'bg-blue-500 animate-pulse',
              voiceMode === 'inactive' && 'bg-gray-400'
            )}
          />
          <span className="text-sm font-medium">{t('语音控制')}</span>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 内容区域 */}
      <div className="p-4 space-y-4">
        {/* 状态文本 */}
        {statusText && (
          <div className="text-center text-sm font-medium text-gray-700 dark:text-gray-300">{statusText}</div>
        )}

        {/* 音频波形可视化 */}
        {isRecording && (
          <div className="flex items-center justify-center h-20">
            <AudioWaveform level={audioLevel} />
          </div>
        )}

        {/* 转录文本 */}
        {transcript && voiceMode === 'listening' && (
          <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('识别中...')}</div>
            <div className="text-sm text-gray-900 dark:text-gray-100">{transcript}</div>
          </div>
        )}

        {/* 播放文本 */}
        {speakingText && isSpeaking && (
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">{t('正在播放...')}</div>
            <div className="text-sm text-gray-900 dark:text-gray-100">{speakingText}</div>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
            <div className="text-xs text-red-600 dark:text-red-400 mb-1">{t('错误')}</div>
            <div className="text-sm text-red-900 dark:text-red-100">{error}</div>
          </div>
        )}

        {/* 提示文本 */}
        {voiceMode === 'inactive' && !error && (
          <div className="text-center text-xs text-gray-500 dark:text-gray-400">
            {t('按快捷键开始语音输入')}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 音频波形可视化组件
 */
function AudioWaveform({ level }: { level: number }) {
  const bars = 20
  const heights = Array.from({ length: bars }, (_, i) => {
    // 创建波形效果
    const distance = Math.abs(i - bars / 2) / (bars / 2)
    const baseHeight = (1 - distance) * level
    const randomness = Math.random() * 0.3
    return Math.max(0.1, baseHeight + randomness)
  })

  return (
    <div className="flex items-end justify-center gap-1 h-full">
      {heights.map((height, i) => (
        <div
          key={i}
          className="w-2 bg-gradient-to-t from-blue-500 to-blue-300 rounded-full transition-all duration-100"
          style={{
            height: `${height * 100}%`,
          }}
        />
      ))}
    </div>
  )
}
