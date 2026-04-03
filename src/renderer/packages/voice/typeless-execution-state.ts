import type { Message, MessageToolCallPart } from '@shared/types'

export type TypelessExecutionPhase =
  | 'idle'
  | 'thinking'
  | 'inserting'
  | 'executing'
  | 'success'
  | 'error'
  | 'chat_result'

export type TypelessExecutionState =
  | {
      phase: Exclude<TypelessExecutionPhase, 'error'>
    }
  | {
      phase: 'error'
      message: string
    }

export type TypelessOverlayMode = 'thinking' | 'inserting' | 'executing' | 'success' | 'error'

export type TypelessOverlayState =
  | {
      visibility: 'hidden'
    }
  | {
      visibility: 'visible'
      type: TypelessOverlayMode
      message: string
    }

const TYPE_TEXT_TOOL_NAME = 'mcp__system-control__type_text'
const EMPTY_RESULT_MESSAGE = '未生成可用结果'

export function findAssistantMessageForUser(messages: Message[], userMessageId: string): Message | null {
  const pendingUserIds: string[] = []

  // assistant 占位消息可能因为并发提交被插到后一个 user 后面，这里按未配对 user 队列做 FIFO 配对。
  for (const message of messages) {
    if (message.role === 'user') {
      pendingUserIds.push(message.id)
      continue
    }

    if (message.role !== 'assistant' || pendingUserIds.length === 0) {
      continue
    }

    const pairedUserId = pendingUserIds.shift()
    if (pairedUserId === userMessageId) {
      return message
    }
  }

  return null
}

export function deriveTypelessExecutionState(args: {
  assistantMessage: Message | null
}): TypelessExecutionState {
  const assistantMessage = args.assistantMessage

  // 请求上下文已建立但 assistant 占位消息尚未出现时，按 thinking 处理。
  if (!assistantMessage) {
    return { phase: 'thinking' }
  }

  if (assistantMessage.error) {
    return {
      phase: 'error',
      message: assistantMessage.error,
    }
  }

  const toolCallParts = assistantMessage.contentParts.filter(
    (part): part is MessageToolCallPart => part.type === 'tool-call'
  )
  const hasTypeTextToolCall = toolCallParts.some((part) => part.toolName === TYPE_TEXT_TOOL_NAME)
  const toolErrorPart = toolCallParts.find((part) => part.state === 'error')
  const hasPlainText = assistantMessage.contentParts.some((part) => part.type === 'text' && part.text.trim().length > 0)

  // 只要本轮 assistant 仍在 generating，并且已经出现过工具调用，就持续保持工具态。
  if (assistantMessage.generating && toolCallParts.length > 0) {
    return { phase: hasTypeTextToolCall ? 'inserting' : 'executing' }
  }

  if (assistantMessage.generating) {
    return { phase: 'thinking' }
  }

  if (toolErrorPart) {
    return {
      phase: 'error',
      message: getToolErrorMessage(toolErrorPart),
    }
  }

  if (toolCallParts.length > 0) {
    return { phase: 'success' }
  }

  if (hasPlainText) {
    return { phase: 'chat_result' }
  }

  return {
    phase: 'error',
    message: EMPTY_RESULT_MESSAGE,
  }
}

export function mapTypelessExecutionStateToOverlay(state: TypelessExecutionState): TypelessOverlayState {
  switch (state.phase) {
    case 'idle':
    case 'chat_result':
      return { visibility: 'hidden' }
    case 'thinking':
      return { visibility: 'visible', type: 'thinking', message: '正在思考...' }
    case 'inserting':
      return { visibility: 'visible', type: 'inserting', message: '正在输出...' }
    case 'executing':
      return { visibility: 'visible', type: 'executing', message: '正在执行...' }
    case 'success':
      return { visibility: 'visible', type: 'success', message: '已完成' }
    case 'error':
      return { visibility: 'visible', type: 'error', message: state.message }
  }
}

function getToolErrorMessage(toolCallPart: MessageToolCallPart): string {
  if (typeof toolCallPart.result === 'string' && toolCallPart.result.trim()) {
    return toolCallPart.result
  }

  if (
    toolCallPart.result &&
    typeof toolCallPart.result === 'object' &&
    'error' in toolCallPart.result &&
    typeof toolCallPart.result.error === 'string' &&
    toolCallPart.result.error.trim()
  ) {
    return toolCallPart.result.error
  }

  return '工具执行失败'
}
