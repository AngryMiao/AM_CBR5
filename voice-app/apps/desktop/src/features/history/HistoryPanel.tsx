import { useEffect, useState } from 'react'
import {
  listenHistoryRecords,
  previewHistoryRecord,
  queryHistoryRecords,
  retryHistoryRecord,
  type HistoryRecord,
} from '../../lib/tauri'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { 
  History, 
  Search, 
  RefreshCw, 
  Eye, 
  CheckCircle2, 
  XCircle,
  Clock
} from 'lucide-react'

export function HistoryPanel() {
  const [history, setHistory] = useState<HistoryRecord[]>([])
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const orderedHistory = [...history].sort((left, right) => right.id - left.id)
  const completedCount = orderedHistory.filter((record) => record.status === 'done').length
  const failedCount = orderedHistory.filter((record) => record.status === 'error').length

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            历史记录
          </h2>
          <p className="text-muted-foreground mt-1">查看和管理您的语音识别历史</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="secondary" className="h-8">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            已完成 {completedCount}
          </Badge>
          <Badge variant="destructive" className="h-8">
            <XCircle className="w-3 h-3 mr-1" />
            失败 {failedCount}
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <Card className="glass-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px] max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索识别文本、结果或详情..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(value) => setStatusFilter(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="done">已完成</SelectItem>
                <SelectItem value="error">识别失败</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* History List */}
      {orderedHistory.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <History className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">暂无历史记录</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {orderedHistory.map((record) => (
            <Card key={`${record.id}-${record.status}`} className="glass-card card-hover">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base font-semibold">
                      任务 #{record.id}
                    </CardTitle>
                    <Badge 
                      variant={record.status === 'done' ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {record.status === 'done' ? (
                        <><CheckCircle2 className="w-3 h-3 mr-1" /> 已完成</>
                      ) : (
                        <><XCircle className="w-3 h-3 mr-1" /> 识别失败</>
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {record.created_at || '未知时间'}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="grid gap-3">
                  <div className="p-3 rounded-lg bg-secondary/20 border border-border/30">
                    <p className="text-xs text-muted-foreground mb-1">识别文本</p>
                    <p className="text-sm font-medium">{record.transcript || '暂无识别文本'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/20 border border-border/30">
                    <p className="text-xs text-muted-foreground mb-1">任务结果</p>
                    <p className="text-sm">{record.result || '暂无任务结果'}</p>
                  </div>
                  {record.detail && (
                    <div className="p-3 rounded-lg bg-secondary/20 border border-border/30">
                      <p className="text-xs text-muted-foreground mb-1">详情</p>
                      <p className="text-sm text-muted-foreground">{record.detail}</p>
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => void handlePreview(record.id)}
                    className="gap-1"
                  >
                    <Eye className="w-3 h-3" />
                    预览
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => void handleRetry(record.id)}
                    className="gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    重新生成
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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
