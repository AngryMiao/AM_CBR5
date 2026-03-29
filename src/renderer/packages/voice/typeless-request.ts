import { createMessage, type Message } from '@shared/types'

export interface TypelessRequestContext {
  sessionId: string
  userMessageId: string
  asrText: string
  startedAt: number
}

export async function startTypelessRequest(args: {
  text: string
  ensureSession: (options: { purgeOthers: boolean }) => Promise<{ id: string }>
  submit: (sessionId: string, params: { newUserMsg: Message; needGenerating: boolean }) => Promise<unknown>
  now?: () => number
}): Promise<{ context: TypelessRequestContext; submitPromise: Promise<unknown> }> {
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
  })

  return { context, submitPromise }
}
