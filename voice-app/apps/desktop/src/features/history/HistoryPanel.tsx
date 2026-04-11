import { useEffect, useState } from 'react'
import {
  listenHistoryRecords,
  previewHistoryRecord,
  queryHistoryRecords,
  retryHistoryRecord,
  type HistoryRecord,
} from '../../lib/tauri'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  RefreshCw,
  Eye
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
    <section className="runtime-panel">
      <header className="page-header-minimal">
        <h3>历史记录</h3>
      </header>

      <div className="filter-bar-inline">
        <div className="search-input-minimal">
          <Search className="h-4 w-4" />
          <Input
            aria-label="搜索历史记录"
            placeholder="搜索识别文本、结果..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <Select
          value={statusFilter || 'all'}
          onValueChange={(value) => setStatusFilter(value === 'all' ? '' : value)}
        >
          <SelectTrigger aria-label="历史状态筛选" className="w-[140px]">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="done">已完成</SelectItem>
            <SelectItem value="error">失败</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {orderedHistory.length === 0 ? (
        <div className="empty-state-minimal">
          <p>暂无历史记录</p>
        </div>
      ) : (
        <div className="flow-list">
          {orderedHistory.map((record) => (
            <article
              className={`history-item-flow ${record.status === 'error' ? 'history-item-flow-error' : ''}`}
              key={`${record.id}-${record.status}`}
            >
              <div className="item-head-flow">
                <span className={`status-dot ${record.status === 'done' ? 'success' : 'error'}`} />
                <span className="item-id-flow">#{record.id}</span>
                <span className="item-time-flow">{record.created_at || '未知时间'}</span>
              </div>

              <div className="item-section-flow">
                <span className="item-label-flow">识别文本</span>
                <p className="item-text-flow">{record.transcript || '暂无识别文本'}</p>
              </div>

              <div className="item-section-flow">
                <span className="item-label-flow">任务结果</span>
                <p className="item-text-flow">{record.result || '暂无任务结果'}</p>
              </div>

              {record.detail ? (
                <div className="item-section-flow">
                  <span className="item-label-flow">详情</span>
                  <p className="item-text-flow">{record.detail}</p>
                </div>
              ) : null}

              <div className="item-actions-flow">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handlePreview(record.id)}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  预览
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRetry(record.id)}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  重试
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {feedback ? (
        <div className="text-sm text-emerald-600 px-4 py-3" role="status">
          {feedback}
        </div>
      ) : null}

      {error ? (
        <div className="text-sm text-red-600 px-4 py-3" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  )
}
