import { useEffect, useState } from 'react'
import {
  clearRuntimeLogs,
  exportRuntimeLogs,
  getRuntimeLogs,
  listenRuntimeLogs,
  type RuntimeLogEntry,
} from '../../lib/tauri'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  Download,
  Trash2
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
    <section className="runtime-panel">
      <header className="page-header-minimal">
        <h3>运行日志</h3>
      </header>

      <div className="filter-bar-inline">
        <div className="search-input-minimal">
          <Search className="h-4 w-4" />
          <Input
            aria-label="筛选日志"
            placeholder="按内容筛选..."
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <Select
          value={levelFilter || 'all'}
          onValueChange={(value: string) => setLevelFilter(value === 'all' ? '' : value)}
        >
          <SelectTrigger aria-label="日志级别" className="w-[120px]">
            <SelectValue placeholder="全部级别" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部级别</SelectItem>
            <SelectItem value="info">INFO</SelectItem>
            <SelectItem value="error">ERROR</SelectItem>
          </SelectContent>
        </Select>
        <div className="action-buttons-flow">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleExport()}
          >
            <Download className="h-4 w-4 mr-1" />
            导出
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => void handleClear()}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            清空
          </Button>
        </div>
      </div>

      {filteredLogs.length === 0 ? (
        <div className="empty-state-minimal">
          <p>暂无匹配日志</p>
        </div>
      ) : (
        <div className="flow-list">
          {filteredLogs.map((entry, index) => (
            <div
              className={`log-item-flow ${entry.level === 'error' ? 'log-item-flow-error' : ''}`}
              key={`${entry.level}-${entry.message}-${index}`}
            >
              <span className={`log-level-badge ${entry.level}`}>
                {entry.level === 'error' ? 'ERROR' : 'INFO'}
              </span>
              <p className="log-text-flow">{entry.message}</p>
            </div>
          ))}
        </div>
      )}

      {feedback ? (
        <div className="mt-4 p-3 rounded-md bg-green-50 text-green-800 text-sm dark:bg-green-950 dark:text-green-200" role="status">
          {feedback}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 p-3 rounded-md bg-red-50 text-red-800 text-sm dark:bg-red-950 dark:text-red-200" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  )
}