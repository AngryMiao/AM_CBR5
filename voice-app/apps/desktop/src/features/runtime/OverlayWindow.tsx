import { VoiceCapsule, type VoiceCapsulePhase } from './VoiceCapsule'
import { useRuntimeSnapshot } from './useRuntimeSnapshot'
import { getRuntimePhaseTone } from '../../lib/runtimePhase'

export function OverlayWindow() {
  const { phase, transcript, error, input_mode } = useRuntimeSnapshot()
  const phaseTone = getRuntimePhaseTone(phase)
  const capsulePhase = mapPhaseToCapsulePhase(phaseTone, input_mode)

  // 转录模式才显示预览文字
  const isTranscription = input_mode === 'transcription'
  const showTranscript = isTranscription && transcript.length > 0

  // 如果有错误，使用错误状态
  const effectivePhase = error ? 'error' : capsulePhase
  const effectiveTranscript = error ? error : transcript

  return (
    <main className="flex items-end justify-center min-h-screen p-6">
      <VoiceCapsule
        phase={effectivePhase}
        transcript={effectiveTranscript}
        showTranscript={showTranscript}
      />
    </main>
  )
}

/**
 * 将运行时 phase 映射到简化的 VoiceCapsule phase
 *
 * 简化逻辑：
 * - listening -> listening (AI对话)
 * - transcription -> transcription (纯转写)
 * - processing/thinking/executing/inserting/done -> executing (统一为"执行中")
 * - error -> error
 * - idle -> 默认隐藏或显示为 listening
 */
function mapPhaseToCapsulePhase(
  phaseTone: ReturnType<typeof getRuntimePhaseTone>,
  inputMode: string
): VoiceCapsulePhase {
  // 转录模式
  if (inputMode === 'transcription') {
    if (phaseTone === 'listening') return 'transcription'
  }

  // 正常映射
  switch (phaseTone) {
    case 'listening':
      return 'listening'

    // 所有"进行中"状态合并为 executing
    case 'processing':
    case 'thinking':
    case 'executing':
    case 'inserting':
    case 'done':
      return 'executing'

    case 'error':
      return 'error'

    case 'idle':
    default:
      return 'listening'
  }
}
