import { useEffect, useState } from 'react'
import {
  listenHistoryRecords,
  previewHistoryRecord,
  queryHistoryRecords,
  retryHistoryRecord,
  type HistoryRecord,
} from '../../lib/tauri'
import { Input } from '@/components/ui/input'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Search,
  RefreshCw,
  Eye,
  History,
} from 'lucide-react'

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
      await previewHistoryRecord(recordId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '预览历史记录失败。')
    }
  }

  async function handleRetry(recordId: number) {
    try {
      setError(null)
      setFeedback(null)
      await retryHistoryRecord(recordId)
      setFeedback(`已开始重试任务。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '重试历史记录失败。')
    }
  }

  function formatDate(dateStr: string | undefined) {
    if (!dateStr) return '未知时间'
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  function truncateText(text: string | undefined, maxLength: number = 50) {
    if (!text) return '暂无识别文本'
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  const filteredHistory = orderedHistory.filter((record) => {
    const matchesLevel = !statusFilter || record.status === statusFilter
    const matchesKeyword = !keyword.trim() ||
      (record.transcript?.toLowerCase().includes(keyword.toLowerCase())) ||
      (record.result?.toLowerCase().includes(keyword.toLowerCase()))
    return matchesLevel && matchesKeyword
  })

  return (
    <section className="history-page">
      {/* Sticky header with title and filters */}
      <header className="history-page-header">
        <div className="history-header-content">
          <div className="history-title-section">
            <div className="history-eyebrow">
              <History className="h-4 w-4" />
              <span>任务历史</span>
            </div>
            <h2 className="history-title">历史记录</h2>
            <p className="history-description">查看识别结果、重试任务并预览输出</p>
          </div>

          <div className="history-filter-bar">
            <div className="history-search-wrapper">
              <Search className="history-search-icon" />
              <Input
                aria-label="搜索历史记录"
                className="history-search-input"
                placeholder="搜索识别文本、结果..."
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </div>
            <div className="history-filter-buttons">
              <button
                aria-label="筛选全部状态"
                className={`history-filter-btn ${statusFilter === '' ? 'active' : ''}`}
                onClick={() => setStatusFilter('')}
                type="button"
              >
                全部
              </button>
              <button
                aria-label="筛选已完成"
                className={`history-filter-btn ${statusFilter === 'done' ? 'active' : ''}`}
                onClick={() => setStatusFilter('done')}
                type="button"
              >
                已完成
              </button>
              <button
                aria-label="筛选失败"
                className={`history-filter-btn ${statusFilter === 'error' ? 'active' : ''}`}
                onClick={() => setStatusFilter('error')}
                type="button"
              >
                失败
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Feedback messages */}
      {feedback ? (
        <div className="history-feedback history-feedback-success" role="status">
          {feedback}
        </div>
      ) : null}

      {error ? (
        <div className="history-feedback history-feedback-error" role="alert">
          {error}
        </div>
      ) : null}

      {/* Content area */}
      <div className="history-content animate-panel-fade-in" key={statusFilter}>
        {filteredHistory.length === 0 ? (
          <div className="history-empty-state">
            <History className="h-12 w-12" />
            <p>暂无历史记录</p>
            <span>开始语音任务后，记录将显示在这里</span>
          </div>
        ) : (
          <Accordion type="single" collapsible className="history-accordion">
            {filteredHistory.map((record) => (
              <AccordionItem
                value={`record-${record.id}`}
                key={record.id}
                className="history-accordion-item"
              >
                <AccordionTrigger className="history-accordion-trigger">
                  <div className="history-trigger-content">
                    <span className={`history-status-tag history-status-tag-${record.status}`}>
                      {record.status === 'done' ? '已完成' : '失败'}
                    </span>
                    <span className="history-transcript-preview">
                      {truncateText(record.transcript)}
                    </span>
                    <span className="history-record-time">
                      {formatDate(record.created_at)}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="history-accordion-content">
                  <div className="history-result-block">
                    <div className="history-result-header">
                      <span className="history-result-label">任务结果</span>
                    </div>
                    <p className="history-result-text">
                      {record.result || '暂无任务结果'}
                    </p>
                    <div className="history-result-actions">
                      <button
                        className="history-action-btn"
                        onClick={() => void handlePreview(record.id)}
                        type="button"
                      >
                        <Eye className="h-4 w-4" />
                        预览
                      </button>
                      <button
                        className="history-action-btn"
                        onClick={() => void handleRetry(record.id)}
                        type="button"
                      >
                        <RefreshCw className="h-4 w-4" />
                        重试
                      </button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    </section>
  )
}