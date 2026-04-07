import { useRuntimeSnapshot } from './useRuntimeSnapshot'
import { getRuntimePhaseTone } from '../../lib/runtimePhase'

export function OverlayWindow() {
  const { phase, transcript, detail, error } = useRuntimeSnapshot()
  const phaseTone = getRuntimePhaseTone(phase)
  const phaseMeta = getOverlayPhaseMeta(phaseTone)
  const primary = resolveOverlayPrimary(phaseTone, transcript, detail, error)
  const secondary = resolveOverlaySecondary(phaseTone, transcript, error)

  return (
    <main className="overlay-shell">
      <section className={`typeless-overlay-card typeless-overlay-card-${phaseTone}`}>
        <div className="typeless-overlay-status">
          <span aria-hidden="true" className="typeless-overlay-icon">
            {phaseMeta.icon}
          </span>
          <div className="typeless-overlay-status-copy">
            <p className="typeless-overlay-eyebrow">{phaseMeta.eyebrow}</p>
            <strong>{phaseMeta.phase}</strong>
          </div>
        </div>
        <div className="typeless-overlay-body">
          <p className={error ? 'typeless-overlay-primary typeless-overlay-primary-error' : 'typeless-overlay-primary'}>
            {primary}
          </p>
          {secondary ? (
            <p className={error ? 'typeless-overlay-secondary typeless-overlay-secondary-error' : 'typeless-overlay-secondary'}>
              {secondary}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function resolveOverlayPrimary(
  phaseTone: ReturnType<typeof getRuntimePhaseTone>,
  transcript: string,
  detail: string,
  error: string | null,
) {
  if (error) {
    return error
  }

  if (phaseTone === 'listening' && transcript.trim()) {
    return transcript
  }

  if (detail.trim()) {
    return detail
  }

  return phaseMetaFallbackText(phaseTone)
}

function resolveOverlaySecondary(
  phaseTone: ReturnType<typeof getRuntimePhaseTone>,
  transcript: string,
  error: string | null,
) {
  if (error) {
    return null
  }

  if (phaseTone === 'idle' || phaseTone === 'loading') {
    return '按住语音快捷键开始输入'
  }

  if (phaseTone === 'listening') {
    return transcript.trim() ? '松开热键开始识别' : '按住语音快捷键开始输入'
  }

  return null
}

function getOverlayPhaseMeta(phaseTone: ReturnType<typeof getRuntimePhaseTone>) {
  switch (phaseTone) {
    case 'listening':
      return { eyebrow: '实时识别', icon: '●', phase: '正在聆听' }
    case 'processing':
      return { eyebrow: '实时识别', icon: '⋯', phase: '正在识别' }
    case 'thinking':
      return { eyebrow: '实时识别', icon: '✦', phase: '正在生成' }
    case 'executing':
      return { eyebrow: '实时识别', icon: '⌘', phase: '正在执行' }
    case 'inserting':
      return { eyebrow: '实时识别', icon: '⌨', phase: '正在输出' }
    case 'done':
      return { eyebrow: '实时识别', icon: '✓', phase: '已完成' }
    case 'error':
      return { eyebrow: '实时识别', icon: '!', phase: '识别失败' }
    case 'idle':
      return { eyebrow: '实时识别', icon: '●', phase: '待命中' }
    default:
      return { eyebrow: '实时识别', icon: '●', phase: '加载中' }
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
