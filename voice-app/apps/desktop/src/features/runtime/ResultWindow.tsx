import { useRuntimeSnapshot } from './useRuntimeSnapshot'
import { getRuntimePhaseTone } from '../../lib/runtimePhase'
import { dismissRuntimeResult } from '../../lib/tauri'

export function ResultWindow() {
  const { phase, transcript, result, detail, error } = useRuntimeSnapshot()
  const phaseTone = getRuntimePhaseTone(phase)
  const phaseMeta = getResultPhaseMeta(phaseTone)
  const answerText = error || result || '暂无结果。'
  const summary = detail || phaseMeta.summary

  return (
    <main className="result-shell">
      <section className={`typeless-result-card typeless-result-card-${phaseTone}`}>
        <div className="typeless-result-toolbar">
          <span className={`phase-chip phase-${phaseTone}`}>{phaseMeta.badge}</span>
          <button
            aria-label="关闭结果窗口"
            className="result-close"
            type="button"
            onClick={() => {
              void dismissRuntimeResult()
            }}
          >
            ×
          </button>
        </div>
        {summary ? <p className="typeless-result-summary">{summary}</p> : null}
        <dl className="typeless-result-grid">
          <div className="typeless-result-block">
            <dt>识别内容</dt>
            <dd>{transcript || '暂无识别文本。'}</dd>
          </div>
          <div className="typeless-result-block">
            <dt>执行结果</dt>
            <dd>{answerText}</dd>
          </div>
        </dl>
        {error ? (
          <p className="typeless-result-hint typeless-result-hint-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="typeless-result-hint">{phaseMeta.hint}</p>
        )}
      </section>
    </main>
  )
}

function getResultPhaseMeta(phaseTone: ReturnType<typeof getRuntimePhaseTone>) {
  switch (phaseTone) {
    case 'done':
      return {
        badge: '已完成',
        summary: '语音对话已完成，下面是本轮识别与回复结果。',
        hint: '结果会自动写入历史记录，供后续预览和重试。',
      }
    case 'error':
      return {
        badge: '失败',
        summary: '本轮语音任务执行失败，下面保留了识别文本和错误结果。',
        hint: '结果已保留，关闭后可在历史记录中查看本轮详情。',
      }
    case 'processing':
      return {
        badge: '识别中',
        summary: '正在整理识别结果。',
        hint: '识别完成后会自动更新本窗口内容。',
      }
    case 'thinking':
      return {
        badge: '生成中',
        summary: '正在整理任务结果。',
        hint: '正在等待模型返回完整结果。',
      }
    case 'executing':
      return {
        badge: '执行中',
        summary: '正在整理任务结果。',
        hint: '本轮工具执行完成后会自动展示最终结果。',
      }
    case 'inserting':
      return {
        badge: '输出中',
        summary: '正在整理任务结果。',
        hint: '结果即将写入当前输入位置。',
      }
    case 'listening':
      return {
        badge: '聆听中',
        summary: '语音输入仍在进行中。',
        hint: '松开热键后会开始识别并展示本轮结果。',
      }
    default:
      return {
        badge: '待命中',
        summary: '等待下一次语音任务。',
        hint: '按住热键开始新一轮语音输入。',
      }
  }
}
