import type { Message } from '@shared/types'

export type PromptContextMode = 'full' | 'current-turn-only'

export function selectMessagesForPromptContext(
  messages: Message[],
  contextMode: PromptContextMode = 'full'
): Message[] {
  const completedMessages = messages.filter((message) => !message.generating)

  if (contextMode === 'full') {
    return completedMessages
  }

  const systemMessages = completedMessages.filter((message) => message.role === 'system')
  const latestUserMessage = [...completedMessages].reverse().find((message) => message.role === 'user')

  if (!latestUserMessage) {
    return systemMessages
  }

  return [...systemMessages, latestUserMessage]
}
