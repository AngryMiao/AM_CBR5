import type { FC } from 'react'
import { StatusIcon } from './StatusIcon'
import { Waveform } from './Waveform'

export type VoiceCapsulePhase =
  | 'listening'
  | 'transcription'
  | 'executing'
  | 'error'

const TRANSCRIPTION_PREVIEW_MAX_CHARS = 14

interface VoiceCapsuleProps {
  phase: VoiceCapsulePhase
  transcript?: string
  showTranscript?: boolean
  waveformActive?: boolean
  waveformBars?: number[]
  className?: string
}

const PHASE_CONFIG: Record<
  VoiceCapsulePhase,
  { text: string; showWaveform: boolean }
> = {
  listening: { text: '正在聆听', showWaveform: true },
  transcription: { text: '正在转写', showWaveform: true },
  executing: { text: '正在执行', showWaveform: false },
  error: { text: '识别失败', showWaveform: false },
}

export const VoiceCapsule: FC<VoiceCapsuleProps> = ({
  phase,
  transcript = '',
  showTranscript = false,
  waveformActive = false,
  waveformBars,
  className = '',
}) => {
  const config = PHASE_CONFIG[phase]
  const displayText = formatTranscriptionPreview(transcript)

  return (
    <div
      className={`
        inline-flex items-center gap-3
        px-5 py-3
        rounded-[980px]
        bg-[#272729]
        border border-white/10
        shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px]
        animate-capsule-enter
        ${className}
      `}
      role="status"
      aria-live="polite"
      aria-label={`${config.text}${displayText ? `，${displayText}` : ''}`}
    >
      {/* 状态图标 */}
      <StatusIcon phase={phase} />

      {/* 波形动画 - 仅在聆听和转写时显示 */}
      <Waveform active={config.showWaveform && waveformActive} bars={waveformBars} />

      {/* 状态文字 */}
      <span className="text-sm font-medium text-white/90 tracking-tight whitespace-nowrap">
        {config.text}
      </span>

      {/* 转录预览 */}
      {showTranscript && displayText && (
        <span
          className="
            inline-block align-bottom
            text-[13px] text-white/70 text-right
            max-w-[200px]
            overflow-hidden whitespace-nowrap
            pl-2 ml-1
            border-l border-white/20
          "
          title={transcript}
        >
          {displayText}
        </span>
      )}
    </div>
  )
}

function formatTranscriptionPreview(
  text: string,
  maxChars = TRANSCRIPTION_PREVIEW_MAX_CHARS,
): string {
  const normalized = text.trim()
  if (!normalized) return ''
  if (normalized.length <= maxChars) return normalized
  return `…${normalized.slice(-maxChars)}`
}
