import { useRuntimeSnapshot } from './useRuntimeSnapshot'
import { dismissRuntimeResult } from '../../lib/tauri'

export function ResultWindow() {
  const { transcript, result, error } = useRuntimeSnapshot()
  const answerText = error || result || '暂无结果。'

  return (
    <main className="result-shell">
      <section className="typeless-result-card">
        <div className="typeless-result-toolbar">
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
      </section>
    </main>
  )
}
