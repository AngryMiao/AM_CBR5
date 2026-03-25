import type { Message } from '../../shared/types'
import { getMessageText } from '../../shared/utils/message'

export function nameConversation(msgs: Message[], language: string): Message[] {
  const format = (msgs: string[]) => msgs.map((msg) => msg).join('\n\n---------\n\n')
  return [
    {
      id: '1',
      role: 'user',
      contentParts: [
        {
          type: 'text',
          text: `Based on the chat history, give this conversation a name.
Keep it short - 10 words max, no quotes.
Use ${language}.
Just provide the name, nothing else.

Here's the conversation:

\`\`\`
${
  format(msgs.slice(0, 5).map((msg) => getMessageText(msg, true, false).slice(0, 100))) // 限制长度以节省 tokens
}
\`\`\`

Name this conversation in 10 characters or less.
Use ${language}.
Only give the name, nothing else.

The name is:`,
        },
      ],
    },
  ]
}

export function summarizeConversation(msgs: Message[], language: string): Message[] {
  const instructionText = `Provide a detailed summary for continuing this conversation.
Focus on information that would be helpful for continuing, including:
- What we discussed and why it matters
- Key decisions made
- What we're working on
- What we're going to do next

The new session will not have access to our conversation history.
Write in ${language}. Be concise but complete. Do NOT include prefaces or meta-commentary.`

  const instructionMessage: Message = {
    id: `summary-instruction-${Date.now()}`,
    role: 'user',
    contentParts: [{ type: 'text', text: instructionText }],
  }

  return [...msgs, instructionMessage]
}
