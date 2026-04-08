import { useRuntimeSnapshot } from './useRuntimeSnapshot'
import { getRuntimePhaseTone } from '../../lib/runtimePhase'

const WAVE_BARS = [0, 1, 2, 3, 4]
const MAX_TRANSCRIPTION_PREVIEW_CHARS = 24

export function OverlayWindow() {
  const { phase, transcript, error, input_mode } = useRuntimeSnapshot()
  const phaseTone = getRuntimePhaseTone(phase)
  const phaseMeta = getOverlayPhaseMeta(phaseTone)
  const isTranscription = input_mode === 'transcription'
  const previewText = formatTranscriptionPreview(transcript)
  const showTranscript = isTranscription && previewText.length > 0
  const announcement = [phaseMeta.phase, previewText || error].filter(Boolean).join('，')

  return (
    <main className="overlay-shell">
      <section
        aria-label={announcement}
        aria-live="polite"
        className={[
          `typeless-overlay-card typeless-overlay-card-${phaseTone}`,
          isTranscription ? 'typeless-overlay-card-transcription' : '',
          showTranscript ? 'typeless-overlay-card-with-text' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="status"
        title={announcement}
      >
        <div
          className={[
            'typeless-overlay-recorder',
            showTranscript ? 'typeless-overlay-recorder-with-text' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        >
          <span className="typeless-overlay-handle typeless-overlay-handle-left">
            {phaseMeta.icon}
          </span>

          {showTranscript ? (
            <span className="typeless-overlay-text-shell">
              <span className="typeless-overlay-text">{previewText}</span>
            </span>
          ) : (
            <div className="typeless-overlay-wave-shell">
              <span className="typeless-overlay-wave">
                {WAVE_BARS.map((bar) => (
                  <span key={bar} className="typeless-overlay-wave-bar" />
                ))}
              </span>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function getOverlayPhaseMeta(phaseTone: ReturnType<typeof getRuntimePhaseTone>) {
  switch (phaseTone) {
    case 'listening':
      return { icon: '●', phase: '正在聆听' }
    case 'processing':
      return { icon: '⋯', phase: '正在识别' }
    case 'thinking':
      return { icon: '✦', phase: '正在生成' }
    case 'executing':
      return { icon: '⌘', phase: '正在执行' }
    case 'inserting':
      return { icon: '⌨', phase: '正在输出' }
    case 'done':
      return { icon: '✓', phase: '已完成' }
    case 'error':
      return { icon: '!', phase: '识别失败' }
    case 'idle':
      return { icon: '●', phase: '待命中' }
    default:
      return { icon: '●', phase: '加载中' }
  }
}

function formatTranscriptionPreview(text: string) {
  const normalized = text.trim()
  if (!normalized) return ''
  if (normalized.length <= MAX_TRANSCRIPTION_PREVIEW_CHARS) return normalized
  return `…${normalized.slice(-MAX_TRANSCRIPTION_PREVIEW_CHARS)}`
}
