import { useEffect, useState } from 'react'
import {
  clearRuntimeLogs,
  exportRuntimeLogs,
  getRuntimeLogs,
  listenRuntimeLogs,
  type RuntimeLogEntry,
} from '../../lib/tauri'

export function LogsPanel() {
  const [logs, setLogs] = useState<RuntimeLogEntry[]>([])
  const [levelFilter, setLevelFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    async function loadLogs() {
      try {
        const nextLogs = await getRuntimeLogs()
        if (!disposed) {
          setLogs(nextLogs)
        }
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : '加载运行日志失败。')
        }
      }
    }

    const unlistenPromise = listenRuntimeLogs((nextLogs) => {
      if (!disposed) {
        setLogs(nextLogs)
      }
    }).catch(() => () => {})

    void loadLogs()

    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  const normalizedKeyword = keyword.trim().toLowerCase()
  const filteredLogs = [...logs].reverse().filter((entry) => {
    const matchesLevel = !levelFilter || entry.level === levelFilter
    const matchesKeyword = !normalizedKeyword || entry.message.toLowerCase().includes(normalizedKeyword)

    return matchesLevel && matchesKeyword
  })
  const infoCount = logs.filter((entry) => entry.level === 'info').length
  const errorCount = logs.filter((entry) => entry.level === 'error').length

  async function handleExport() {
    try {
      setError(null)
      const path = await exportRuntimeLogs()
      setFeedback(`运行日志已导出到 ${path}。`)
    } catch (cause) {
      setFeedback(null)
      setError(cause instanceof Error ? cause.message : '导出运行日志失败。')
    }
  }

  async function handleClear() {
    try {
      setError(null)
      await clearRuntimeLogs()
      setFeedback('运行日志已清空。')
    } catch (cause) {
      setFeedback(null)
      setError(cause instanceof Error ? cause.message : '清空运行日志失败。')
    }
  }

  return (
    <section className="panel logs-panel">
      <h2 className="sr-only">日志</h2>

      <div className="history-toolbar">
        <div className="history-filters">
          <select aria-label="日志级别" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
            <option value="">全部级别</option>
            <option value="info">信息</option>
            <option value="error">错误</option>
          </select>
          <input
            aria-label="筛选日志"
            placeholder="按日志内容筛选"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <button type="button" onClick={() => void handleExport()}>
            导出日志
          </button>
          <button type="button" onClick={() => void handleClear()}>
            清空日志
          </button>
        </div>
        <div className="panel-toolbar-meta">
          <span>当前条目 {filteredLogs.length}</span>
          <span>信息 {infoCount}</span>
          <span>错误 {errorCount}</span>
          <span>{keyword ? `关键字 ${keyword}` : '未设置关键字'}</span>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <p>暂无匹配日志。</p>
      ) : (
        <ul className="logs-list">
          {filteredLogs.map((entry, index) => (
            <li
              key={`${entry.level}-${entry.message}-${index}`}
              className={`log-entry ${entry.level === 'error' ? 'log-entry-error' : ''}`.trim()}
            >
              <div className="log-entry-header">
                <span>{logLevelLabel(entry.level)}</span>
              </div>
              <strong>{entry.message}</strong>
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

function logLevelLabel(level: string) {
  switch (level) {
    case 'info':
      return '信息'
    case 'error':
      return '错误'
    default:
      return level || '未知'
  }
}
