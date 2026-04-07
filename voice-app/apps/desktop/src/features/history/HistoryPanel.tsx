import { useEffect, useState } from 'react'
import {
  listenHistoryRecords,
  previewHistoryRecord,
  queryHistoryRecords,
  retryHistoryRecord,
  type HistoryRecord,
} from '../../lib/tauri'

export function HistoryPanel() {
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const orderedHistory = [...history].sort((left, right) => right.id - left.id)

  useEffect(() => {
    let disposed = false

    async function loadHistory() {
      try {
        const nextHistory = await queryHistoryRecords(keyword || undefined, statusFilter || undefined)
        if (!disposed) {
          setHistory(nextHistory)
        }
      } catch (cause: unknown) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : '加载历史记录失败。')
        }
      }
    }

    const unlistenPromise = listenHistoryRecords(() => {
      void loadHistory()
    }).catch(() => () => {})

    void loadHistory()

    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [keyword, statusFilter])

  async function handlePreview(recordId: number) {
    try {
      setError(null)
      setFeedback(null)
      await previewHistoryRecord(recordId)
      setFeedback(`已预览任务 #${recordId}。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '预览历史记录失败。')
    }
  }

  async function handleRetry(recordId: number) {
    try {
      setError(null)
      setFeedback(null)
      await retryHistoryRecord(recordId)
      setFeedback(`已开始重试任务 #${recordId}。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重试历史记录失败。')
    }
  }

  return (
    <section className="panel">
      <div className="history-toolbar">
        <div>
          <h2>历史记录</h2>
          <p className="panel-copy">结果会持续沉淀到本地历史，可搜索、预览和重新生成。</p>
        </div>
        <div className="history-filters">
          <input
            aria-label="搜索历史记录"
            placeholder="搜索识别文本、结果或详情"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <select
            aria-label="历史记录状态"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">全部状态</option>
            <option value="done">已完成</option>
            <option value="error">识别失败</option>
          </select>
        </div>
      </div>
      {orderedHistory.length === 0 ? (
        <p>已完成的语音任务、识别文本和 LLM 结果会显示在这里。</p>
      ) : (
        <ul className="history-list">
          {orderedHistory.map((record) => (
            <li key={`${record.id}-${record.status}`} className="history-item">
              <div className="history-item-header">
                <strong>任务 #{record.id}</strong>
                <span className={`history-status history-status-${record.status}`}>
                  {historyStatusLabel(record.status)}
                </span>
              </div>
              <div className="history-meta">
                <span>完成时间</span>
                <strong>{record.created_at || '未知'}</strong>
              </div>
              <div className="history-block">
                <span>识别文本</span>
                <strong>{record.transcript || '暂无识别文本。'}</strong>
              </div>
              <div className="history-block">
                <span>任务结果</span>
                <strong>{record.result || '暂无任务结果。'}</strong>
              </div>
              <div className="history-block">
                <span>详情</span>
                <strong>{record.detail || '暂无详情。'}</strong>
              </div>
              <div className="history-actions">
                <button type="button" onClick={() => void handlePreview(record.id)}>
                  预览
                </button>
                <button type="button" onClick={() => void handleRetry(record.id)}>
                  重新生成
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {feedback ? (
        <p className="settings-feedback" role="status">
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p className="runtime-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function historyStatusLabel(status: string) {
  switch (status) {
    case 'done':
      return '已完成'
    case 'error':
      return '识别失败'
    default:
      return status
  }
}
