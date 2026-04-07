import { useRuntimeSnapshot } from './useRuntimeSnapshot'
import { getRuntimePhaseTone } from '../../lib/runtimePhase'

const WAVE_BARS = [0, 1, 2, 3, 4]

export function OverlayWindow() {
  const { phase, transcript, error } = useRuntimeSnapshot()
  const phaseTone = getRuntimePhaseTone(phase)
  const phaseMeta = getOverlayPhaseMeta(phaseTone)
  const primary = resolveOverlayPrimary(phaseTone, transcript, error)
  const secondary = resolveOverlaySecondary(phaseTone, error)
  const announcement = [phaseMeta.phase, primary, secondary].filter(Boolean).join('，')

  return (
    <main className="overlay-shell">
      <section
        aria-label={announcement}
        aria-live="polite"
        className={`typeless-overlay-card typeless-overlay-card-${phaseTone}`}
        role="status"
        title={announcement}
      >
        <div className="typeless-overlay-recorder" aria-hidden="true">
          <span className="typeless-overlay-handle typeless-overlay-handle-left">
            {phaseMeta.icon}
          </span>
          <div className="typeless-overlay-wave-shell">
            <span className="typeless-overlay-wave">
              {WAVE_BARS.map((bar) => (
                <span key={bar} className="typeless-overlay-wave-bar" />
              ))}
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}

function resolveOverlayPrimary(
  phaseTone: ReturnType<typeof getRuntimePhaseTone>,
  transcript: string,
  error: string | null,
) {
  if (error) {
    return error
  }

  if (phaseTone === 'listening' && transcript.trim()) {
    return transcript
  }

  if (phaseTone === 'idle' || phaseTone === 'loading') {
    return '等待语音输入'
  }

  return phaseMetaFallbackText(phaseTone)
}

function resolveOverlaySecondary(
  phaseTone: ReturnType<typeof getRuntimePhaseTone>,
  error: string | null,
) {
  if (error) {
    return null
  }

  if (phaseTone === 'listening') {
    return '按住语音快捷键开始输入'
  }

  if (phaseTone === 'idle' || phaseTone === 'loading') {
    return '按住语音快捷键开始输入'
  }

  return null
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

function phaseMetaFallbackText(phaseTone: ReturnType<typeof getRuntimePhaseTone>) {
  switch (phaseTone) {
    case 'processing':
      return '正在识别...'
    case 'thinking':
      return '正在思考...'
    case 'executing':
      return '正在执行...'
    case 'inserting':
      return '正在输出...'
    case 'done':
      return '任务已完成'
    case 'error':
      return '任务执行失败'
    default:
      return '等待语音输入'
  }
}
