import { getMessageText } from '@shared/utils/message'
import { useAtomValue, useSetAtom } from 'jotai'
import { deriveTypelessExecutionState, findAssistantMessageForUser } from '@/packages/voice/typeless-execution-state'
import { useSession } from '@/stores/chatStore'
import { closeTypelessChatResult, typelessRequestAtom } from '@/stores/voiceStore'

/**
 * Typeless 模式下 Chat 意图的结果展示窗口
 */
export function TypelessChatResult() {
  const request = useAtomValue(typelessRequestAtom)
  const closeResult = useSetAtom(closeTypelessChatResult)
  const { session } = useSession(request?.sessionId ?? null)

  if (!request) return null

  const messages = session?.messages ?? []
  const assistantMessage = findAssistantMessageForUser(messages, request.userMessageId)
  const executionState = deriveTypelessExecutionState({ assistantMessage })

  if (executionState.phase !== 'chat_result' || !assistantMessage) {
    return null
  }

  const responseText = getMessageText(assistantMessage).trim()
  if (!responseText) {
    return null
  }

  return (
    <div className="fixed right-4 top-20 w-96 max-h-[80vh] overflow-auto z-50 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">⌫</span>
          <span className="font-medium text-gray-900 dark:text-gray-100">Typeless</span>
        </div>
        <button
          onClick={() => closeResult()}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* 内容 */}
      <div className="p-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
            <span>✨</span>
            <span>回答</span>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{responseText}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
