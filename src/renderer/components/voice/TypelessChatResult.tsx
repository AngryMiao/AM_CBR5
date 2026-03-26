import { getMessageText } from '@shared/utils/message'
import { useAtom, useAtomValue } from 'jotai'
import { cn } from '@/lib/utils'
import { useSession } from '@/stores/chatStore'
import { closeTypelessChatResult, typelessChatResultAtom } from '@/stores/voiceStore'

/**
 * Typeless 模式下 Chat 意图的结果展示窗口
 */
export function TypelessChatResult() {
  const [result, setResult] = useAtom(typelessChatResultAtom)
  const { session } = useSession(result?.sessionId ?? null)

  if (!result) return null

  // 获取最后一条 AI 回复
  const messages = session?.messages ?? []
  const lastAssistantMessage = [...messages].reverse().find((m) => m.role === 'assistant')
  const responseText = lastAssistantMessage ? getMessageText(lastAssistantMessage) : null

  // 判断是否正在生成（有用户消息但没有 AI 回复）
  const hasUserMessage = messages.some((m) => m.role === 'user' && getMessageText(m).includes(result.userText))
  const isGenerating = hasUserMessage && !responseText

  return (
    <div className="fixed right-4 top-20 w-96 max-h-[80vh] overflow-auto z-50 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">⌫</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">Typeless</span>
        </div>
        <button
          onClick={() => setResult(null)}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* 内容 */}
      <div className="p-4 space-y-4">
        {/* 用户语音 */}
        <div className="flex items-start gap-2">
          <span className="text-lg">🎤</span>
          <p className="text-gray-700 dark:text-gray-300">{result.userText}</p>
        </div>

        {/* AI 回复 */}
        <div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
            <span>✨</span>
            <span>回答</span>
            {isGenerating && <span className="animate-pulse text-sm">生成中...</span>}
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {responseText ? (
              <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{responseText}</div>
            ) : (
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>等待回复...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
