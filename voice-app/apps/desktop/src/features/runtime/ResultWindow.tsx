import { useState } from 'react'
import { useRuntimeSnapshot } from './useRuntimeSnapshot'
import { dismissRuntimeResult } from '../../lib/tauri'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import {
  X,
  Copy,
  Check,
  FileText,
  Sparkles,
} from 'lucide-react'

export function ResultWindow() {
  const { transcript, result, error } = useRuntimeSnapshot()
  const [copiedTranscript, setCopiedTranscript] = useState(false)
  const [copiedResult, setCopiedResult] = useState(false)

  const answerText = error || result || '暂无结果。'
  const hasError = Boolean(error)

  async function handleCopyTranscript() {
    if (!transcript) return
    try {
      await navigator.clipboard.writeText(transcript)
      setCopiedTranscript(true)
      setTimeout(() => setCopiedTranscript(false), 2000)
    } catch {
      // Failed to copy
    }
  }

  async function handleCopyResult() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result)
      setCopiedResult(true)
      setTimeout(() => setCopiedResult(false), 2000)
    } catch {
      // Failed to copy
    }
  }

  return (
    <main className="result-shell">
      <Card className="result-card">
        {/* Toolbar with close button */}
        <div className="result-toolbar">
          <button
            aria-label="关闭结果窗口"
            className="result-close-btn"
            type="button"
            onClick={() => void dismissRuntimeResult()}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <CardContent className="result-content">
          {/* Transcription block */}
          <div className="result-block">
            <div className="result-block-header">
              <div className="result-block-title">
                <FileText className="h-4 w-4 result-block-icon" />
                <span>识别内容</span>
              </div>
              {transcript ? (
                <button
                  aria-label="复制识别内容"
                  className="result-copy-btn"
                  type="button"
                  onClick={handleCopyTranscript}
                >
                  {copiedTranscript ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              ) : null}
            </div>
            <p className="result-block-value">
              {transcript || '暂无识别文本'}
            </p>
          </div>

          {/* Result block */}
          <div className={`result-block ${hasError ? 'result-block-error' : ''}`}>
            <div className="result-block-header">
              <div className="result-block-title">
                <Sparkles className="h-4 w-4 result-block-icon" />
                <span>执行结果</span>
              </div>
              {result ? (
                <button
                  aria-label="复制执行结果"
                  className="result-copy-btn"
                  type="button"
                  onClick={handleCopyResult}
                >
                  {copiedResult ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              ) : null}
            </div>
            <p className={`result-block-value ${hasError ? 'result-value-error' : ''}`}>
              {answerText}
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}