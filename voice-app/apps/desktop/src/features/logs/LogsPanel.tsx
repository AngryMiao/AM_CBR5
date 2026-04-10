import { useEffect, useState } from 'react'
import {
  clearRuntimeLogs,
  exportRuntimeLogs,
  getRuntimeLogs,
  listenRuntimeLogs,
  type RuntimeLogEntry,
} from '../../lib/tauri'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  FileText, 
  Search, 
  Download, 
  Trash2, 
  Info, 
  AlertCircle,
  Terminal
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Terminal className="w-6 h-6 text-primary" />
            运行日志
          </h2>
          <p className="text-muted-foreground mt-1">查看系统运行日志和调试信息</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="h-8">
            <Info className="w-3 h-3 mr-1" />
            信息 {infoCount}
          </Badge>
          <Badge variant="destructive" className="h-8">
            <AlertCircle className="w-3 h-3 mr-1" />
            错误 {errorCount}
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px] max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="按日志内容筛选..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={levelFilter || "all"} onValueChange={(value) => setLevelFilter(value === "all" ? "" : value)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="全部级别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部级别</SelectItem>
                <SelectItem value="info">信息</SelectItem>
                <SelectItem value="error">错误</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => void handleExport()} className="gap-1">
                <Download className="w-4 h-4" />
                导出
              </Button>
              <Button variant="outline" onClick={() => void handleClear()} className="gap-1 text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
                清空
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>当前显示 {filteredLogs.length} 条</span>
        {keyword && <Badge variant="outline">关键字: {keyword}</Badge>}
      </div>

      {/* Logs List */}
      {filteredLogs.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">暂无匹配日志</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-card">
          <ScrollArea className="h-[500px]">
            <div className="divide-y divide-border/30">
              {filteredLogs.map((entry, index) => (
                <div
                  key={`${entry.level}-${entry.message}-${index}`}
                  className={`p-4 flex items-start gap-3 ${entry.level === 'error' ? 'bg-destructive/5 border-l-2 border-l-destructive' : ''}`}
                >
                  {entry.level === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge 
                        variant={entry.level === 'error' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {logLevelLabel(entry.level)}
                      </Badge>
                    </div>
                    <p className={`text-sm break-words ${entry.level === 'error' ? 'text-destructive' : ''}`}>
                      {entry.message}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}

      {/* Feedback */}
      {feedback && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm">
          {feedback}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          {error}
        </div>
      )}
    </div>
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
