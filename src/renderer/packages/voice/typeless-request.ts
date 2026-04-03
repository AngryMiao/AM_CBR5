import { createMessage, type Message } from '@shared/types'
import type { PromptContextMode } from '@/stores/session/prompt-context'

export interface TypelessRequestContext {
  sessionId: string
  userMessageId: string
  assistantMessageId?: string
  asrText: string
  startedAt: number
  finalized?: boolean
  isLiveStreaming?: boolean
}

export function isTypelessRequestFinalized(context: TypelessRequestContext | null | undefined) {
  if (!context) {
    return false
  }
  return context.finalized !== false
}

export async function startTypelessRequest(args: {
  text: string
  ensureSession: (options: { purgeOthers: boolean }) => Promise<{ id: string }>
  submit: (
    sessionId: string,
    params: { newUserMsg: Message; needGenerating: boolean; contextMode?: PromptContextMode }
  ) => Promise<Message | undefined>
  now?: () => number
}): Promise<{ context: TypelessRequestContext; submitPromise: Promise<Message | undefined> }> {
  const session = await args.ensureSession({
    purgeOthers: false,
  })
  const newUserMsg = createMessage('user', args.text)

  // 先构造请求上下文，再把 submit promise 暴露给上层观察生命周期。
  const context: TypelessRequestContext = {
    sessionId: session.id,
    userMessageId: newUserMsg.id,
    asrText: args.text,
    startedAt: (args.now ?? Date.now)(),
  }
  const submitPromise = args.submit(session.id, {
    newUserMsg,
    needGenerating: true,
    contextMode: 'current-turn-only',
  })

  return { context, submitPromise }
}
