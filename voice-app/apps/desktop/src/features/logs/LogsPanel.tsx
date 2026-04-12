import { useEffect, useState } from 'react'
import {
  clearRuntimeLogs,
  exportRuntimeLogs,
  getRuntimeLogs,
  listenRuntimeLogs,
  type RuntimeLogEntry,
} from '../../lib/tauri'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Search,
  Download,
  Trash2,
  FileText,
  Info,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'

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
    <section className="logs-page">
      {/* Sticky header with title and filters */}
      <header className="logs-page-header">
        <div className="logs-header-content">
          <div className="logs-title-section">
            <div className="logs-eyebrow">
              <FileText className="h-4 w-4" />
              <span>Runtime Logs</span>
            </div>
            <h2 className="logs-title">运行日志</h2>
            <p className="logs-description">查看运行日志、筛选错误并导出记录</p>
          </div>

          <div className="logs-toolbar">
            <div className="logs-filter-row">
              <div className="logs-search-wrapper">
                <Search className="logs-search-icon" />
                <input
                  aria-label="筛选日志"
                  className="logs-search-input"
                  placeholder="按内容筛选..."
                  type="text"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>

              <div className="logs-filter-buttons">
                <button
                  aria-label="筛选全部级别"
                  className={`logs-filter-btn ${levelFilter === '' ? 'active' : ''}`}
                  onClick={() => setLevelFilter('')}
                  type="button"
                >
                  全部
                </button>
                <button
                  aria-label="筛选 INFO"
                  className={`logs-filter-btn ${levelFilter === 'info' ? 'active' : ''}`}
                  onClick={() => setLevelFilter('info')}
                  type="button"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  INFO
                </button>
                <button
                  aria-label="筛选 ERROR"
                  className={`logs-filter-btn ${levelFilter === 'error' ? 'active' : ''}`}
                  onClick={() => setLevelFilter('error')}
                  type="button"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  ERROR
                </button>
              </div>
            </div>

            <div className="logs-action-buttons">
              <button
                aria-label="导出日志"
                className="logs-action-btn"
                onClick={() => void handleExport()}
                type="button"
              >
                <Download className="h-3.5 w-3.5" />
                导出
              </button>
              <button
                aria-label="清空日志"
                className="logs-action-btn logs-action-btn-danger"
                onClick={() => void handleClear()}
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Feedback messages */}
      {feedback ? (
        <div className="logs-feedback logs-feedback-success" role="status">
          <CheckCircle className="h-4 w-4" />
          <span>{feedback}</span>
        </div>
      ) : null}

      {error ? (
        <div className="logs-feedback logs-feedback-error" role="alert">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Content area */}
      <div className="logs-content animate-panel-fade-in" key={levelFilter}>
        {filteredLogs.length === 0 ? (
          <div className="logs-empty-state">
            <FileText className="h-12 w-12" />
            <p>暂无匹配日志</p>
            <span>调整筛选条件或等待新的运行日志</span>
          </div>
        ) : (
          <div className="logs-list">
            {filteredLogs.map((entry, index) => (
              <div
                className="logs-card"
                key={`${entry.level}-${entry.message}-${index}`}
              >
                <Badge
                  variant={entry.level === 'error' ? 'destructive' : 'secondary'}
                  className="logs-badge"
                >
                  {entry.level === 'error' ? (
                    <AlertCircle className="h-3 w-3 mr-1" />
                  ) : (
                    <Info className="h-3 w-3 mr-1" />
                  )}
                  {entry.level.toUpperCase()}
                </Badge>
                <span className="logs-message">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}