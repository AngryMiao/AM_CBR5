import { createMessage, type Message, type Session } from '@shared/types'
import { getLogger } from '@/lib/utils'
import type { ToolExecutionMode } from '@/packages/mcp/tool-execution-mode'
import type { PromptContextMode } from '@/stores/session/prompt-context'
import type { TypelessRequestContext } from './typeless-request'

type GenerateOptions = {
  operationType?: 'send_message' | 'regenerate'
  toolExecutionMode?: ToolExecutionMode
  contextMode?: PromptContextMode
}

type GenerateResult = Message | undefined
type SessionHandle = Pick<Session, 'id' | 'messages'>

const log = getLogger('typeless-debug')
const SLOW_PREPARE_MS = 1200
const SLOW_CANCEL_WAIT_MS = 1500
const SLOW_GENERATE_MS = 4000
const SLOW_RESTART_STEP_MS = 600

export interface LiveTypelessRequestController {
  enqueueTranscript(
    text: string,
    options?: {
      toolExecutionMode?: ToolExecutionMode
    }
  ): Promise<TypelessRequestContext | null>
  abort(): Promise<void>
}

export function createLiveTypelessRequestController(args: {
  ensureSession: (options: { purgeOthers: boolean }) => Promise<{ id: string }>
  prepareSession?: (sessionId: string) => Promise<void>
  getSession: (sessionId: string) => Promise<SessionHandle | null>
  insertMessage: (sessionId: string, message: Message) => Promise<void>
  updateMessage: (sessionId: string, message: Message) => Promise<void>
  removeMessage: (sessionId: string, messageId: string) => Promise<void>
  generate: (sessionId: string, assistantMessage: Message, options?: GenerateOptions) => Promise<GenerateResult>
  onContextChange?: (context: TypelessRequestContext | null) => void
  onGenerationSettled?: (payload: {
    context: TypelessRequestContext
    assistantMessage: Message | null
    toolExecutionMode: ToolExecutionMode
  }) => void
  now?: () => number
}): LiveTypelessRequestController {
  let disposed = false
  let context: TypelessRequestContext | null = null
  let desiredText = ''
  let appliedText = ''
  let desiredMode: ToolExecutionMode = 'preview'
  let appliedMode: ToolExecutionMode | null = null
  let processingPromise: Promise<TypelessRequestContext | null> | null = null
  let currentGeneratePromise: Promise<GenerateResult> | null = null

  const emitContext = (nextContext: TypelessRequestContext | null) => {
    context = nextContext
    args.onContextChange?.(nextContext ? { ...nextContext } : null)
  }

  const getMessageById = async (sessionId: string, messageId: string) => {
    const session = await args.getSession(sessionId)
    return session?.messages.find((message) => message.id === messageId) ?? null
  }

  const startGenerate = async (toolExecutionMode: ToolExecutionMode) => {
    if (!context?.assistantMessageId) {
      throw new Error('实时 Typeless 会话缺少 assistantMessageId')
    }
    const sessionId = context.sessionId
    let assistantMessageId = context.assistantMessageId

    let assistantMessage = await getMessageById(sessionId, assistantMessageId)
    if (!assistantMessage) {
      const replacementAssistantMessage = createMessage('assistant', '')
      replacementAssistantMessage.generating = true
      await args.insertMessage(sessionId, replacementAssistantMessage)
      assistantMessageId = replacementAssistantMessage.id
      assistantMessage = replacementAssistantMessage
      emitContext({
        ...context,
        assistantMessageId,
      })
      log.info(
        `assistant-draft-restored sessionId=${sessionId} previousAssistantMessageId=${context.assistantMessageId} assistantMessageId=${assistantMessageId} mode=${toolExecutionMode}`
      )
    }

    const nextAssistantMessage: Message = {
      ...assistantMessage,
      cancel: undefined,
      contentParts: [],
      error: undefined,
      errorCode: undefined,
      errorExtra: undefined,
      finishReason: undefined,
      firstTokenLatency: undefined,
      generating: true,
      status: [],
      tokensUsed: undefined,
      usage: undefined,
    }

    const generateStartAt = Date.now()
    let slowGenerationLogged = false
    const slowGenerationTimer = setTimeout(() => {
      slowGenerationLogged = true
      log.info(
        `generation-pending sessionId=${sessionId} assistantMessageId=${assistantMessageId} mode=${toolExecutionMode} elapsedMs=${Date.now() - generateStartAt}`
      )
    }, SLOW_GENERATE_MS)
    if (toolExecutionMode === 'execute') {
      log.info(
        `generation-started sessionId=${sessionId} assistantMessageId=${assistantMessageId} mode=${toolExecutionMode}`
      )
    }
    const settledContext: TypelessRequestContext = {
      ...context,
      assistantMessageId,
    }

    const generatePromise = args.generate(sessionId, nextAssistantMessage, {
      operationType: 'send_message',
      toolExecutionMode,
      contextMode: 'current-turn-only',
    })
    currentGeneratePromise = generatePromise
    void generatePromise
      .then((assistantMessage) => {
        if (disposed || toolExecutionMode !== 'execute') {
          return
        }

        args.onGenerationSettled?.({
          context: settledContext,
          assistantMessage: assistantMessage?.role === 'assistant' ? assistantMessage : null,
          toolExecutionMode,
        })
      })
      .finally(() => {
        clearTimeout(slowGenerationTimer)
        const durationMs = Date.now() - generateStartAt
        if (toolExecutionMode === 'execute' || slowGenerationLogged || durationMs >= SLOW_GENERATE_MS) {
          log.info(
            `generation-finished sessionId=${sessionId} assistantMessageId=${assistantMessageId} mode=${toolExecutionMode} durationMs=${durationMs}`
          )
        }
        if (currentGeneratePromise === generatePromise) {
          currentGeneratePromise = null
        }
      })
  }

  const stopCurrentGeneration = async () => {
    if (!context?.assistantMessageId) {
      return
    }
    const sessionId = context.sessionId
    const assistantMessageId = context.assistantMessageId

    const stopStartAt = Date.now()
    const assistantMessage = await getMessageById(sessionId, assistantMessageId)
    assistantMessage?.cancel?.()

    if (!currentGeneratePromise) {
      return
    }

    let slowCancelLogged = false
    const slowCancelTimer = setTimeout(() => {
      slowCancelLogged = true
      log.info(
        `cancel-waiting sessionId=${sessionId} assistantMessageId=${assistantMessageId} elapsedMs=${Date.now() - stopStartAt}`
      )
    }, SLOW_CANCEL_WAIT_MS)

    try {
      await currentGeneratePromise
    } catch {
      // ignore cancellation / generation errors here; the hook tracks visible errors separately
    } finally {
      clearTimeout(slowCancelTimer)
      currentGeneratePromise = null
      const durationMs = Date.now() - stopStartAt
      if (slowCancelLogged || durationMs >= SLOW_CANCEL_WAIT_MS) {
        log.info(
          `cancel-finished sessionId=${sessionId} assistantMessageId=${assistantMessageId} durationMs=${durationMs}`
        )
      }
    }
  }

  const startTurn = async (text: string, toolExecutionMode: ToolExecutionMode) => {
    const turnStartAt = Date.now()
    const session = await args.ensureSession({
      purgeOthers: false,
    })
    const ensureDurationMs = Date.now() - turnStartAt
    const prepareStartAt = Date.now()
    await args.prepareSession?.(session.id)
    const prepareDurationMs = Date.now() - prepareStartAt
    if (disposed) {
      return null
    }

    const userMessage = createMessage('user', text)
    const assistantMessage = createMessage('assistant', '')
    assistantMessage.generating = true

    await args.insertMessage(session.id, userMessage)
    await args.insertMessage(session.id, assistantMessage)

    const nextContext: TypelessRequestContext = {
      sessionId: session.id,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      asrText: text,
      startedAt: (args.now ?? Date.now)(),
      finalized: toolExecutionMode === 'execute',
      isLiveStreaming: true,
    }
    emitContext(nextContext)
    await startGenerate(toolExecutionMode)
    const totalDurationMs = Date.now() - turnStartAt
    if (
      toolExecutionMode === 'execute' ||
      ensureDurationMs >= SLOW_PREPARE_MS ||
      prepareDurationMs >= SLOW_PREPARE_MS ||
      totalDurationMs >= SLOW_PREPARE_MS
    ) {
      log.info(
        `turn-started sessionId=${session.id} userMessageId=${userMessage.id} assistantMessageId=${assistantMessage.id} mode=${toolExecutionMode} textLength=${text.length} ensureSessionMs=${ensureDurationMs} prepareSessionMs=${prepareDurationMs} totalMs=${totalDurationMs}`
      )
    }
    return nextContext
  }

  const restartTurn = async (text: string, toolExecutionMode: ToolExecutionMode) => {
    if (!context) {
      return null
    }

    const restartStartAt = Date.now()
    await stopCurrentGeneration()
    if (disposed) {
      return null
    }
    const afterCancelDurationMs = Date.now() - restartStartAt
    if (toolExecutionMode === 'execute' || afterCancelDurationMs >= SLOW_CANCEL_WAIT_MS) {
      log.info(
        `restart-after-cancel sessionId=${context.sessionId} userMessageId=${context.userMessageId} assistantMessageId=${context.assistantMessageId ?? 'none'} mode=${toolExecutionMode} durationMs=${afterCancelDurationMs}`
      )
    }

    const loadUserStartAt = Date.now()
    const userMessage = await getMessageById(context.sessionId, context.userMessageId)
    if (!userMessage) {
      throw new Error('实时 Typeless user 消息不存在')
    }
    const loadUserDurationMs = Date.now() - loadUserStartAt
    if (toolExecutionMode === 'execute' || loadUserDurationMs >= SLOW_RESTART_STEP_MS) {
      log.info(
        `restart-user-loaded sessionId=${context.sessionId} userMessageId=${context.userMessageId} mode=${toolExecutionMode} durationMs=${loadUserDurationMs}`
      )
    }

    const updateUserStartAt = Date.now()
    await args.updateMessage(context.sessionId, {
      ...userMessage,
      contentParts: text ? [{ type: 'text', text }] : [],
    })
    const updateUserDurationMs = Date.now() - updateUserStartAt
    if (toolExecutionMode === 'execute' || updateUserDurationMs >= SLOW_RESTART_STEP_MS) {
      log.info(
        `restart-user-updated sessionId=${context.sessionId} userMessageId=${context.userMessageId} mode=${toolExecutionMode} textLength=${text.length} durationMs=${updateUserDurationMs}`
      )
    }

    const nextContext: TypelessRequestContext = {
      ...context,
      asrText: text,
      finalized: toolExecutionMode === 'execute',
    }
    emitContext(nextContext)
    if (toolExecutionMode === 'execute') {
      log.info(
        `restart-context-updated sessionId=${nextContext.sessionId} userMessageId=${nextContext.userMessageId} assistantMessageId=${nextContext.assistantMessageId ?? 'none'} finalized=${nextContext.finalized === true ? 'true' : 'false'}`
      )
    }
    await startGenerate(toolExecutionMode)
    const durationMs = Date.now() - restartStartAt
    if (toolExecutionMode === 'execute' || durationMs >= SLOW_CANCEL_WAIT_MS) {
      log.info(
        `turn-restarted sessionId=${context.sessionId} userMessageId=${context.userMessageId} assistantMessageId=${context.assistantMessageId ?? 'none'} mode=${toolExecutionMode} textLength=${text.length} durationMs=${durationMs}`
      )
    }
    return nextContext
  }

  const processQueue = async () => {
    while (!disposed) {
      const nextText = desiredText.trim()
      const nextMode = desiredMode
      const hasPendingChange = nextText && (nextText !== appliedText || nextMode !== appliedMode)

      if (!hasPendingChange) {
        return context
      }

      const nextContext = context ? await restartTurn(nextText, nextMode) : await startTurn(nextText, nextMode)

      if (disposed) {
        return null
      }

      appliedText = nextText
      appliedMode = nextMode

      if (!nextContext) {
        return null
      }
    }

    return null
  }

  return {
    async enqueueTranscript(text, options) {
      if (disposed) {
        return null
      }

      const trimmedText = text.trim()
      if (!trimmedText) {
        return context
      }

      desiredText = trimmedText
      if ((options?.toolExecutionMode ?? 'preview') === 'execute') {
        desiredMode = 'execute'
      }

      if ((options?.toolExecutionMode ?? 'preview') === 'execute' && processingPromise) {
        log.info(
          `execute-queued-behind-pending sessionId=${context?.sessionId ?? 'pending'} textLength=${trimmedText.length} appliedMode=${appliedMode ?? 'none'} desiredMode=${desiredMode}`
        )
      }

      if (!processingPromise) {
        processingPromise = processQueue().finally(() => {
          processingPromise = null
        })
      }

      return await processingPromise
    },

    async abort() {
      disposed = true
      await stopCurrentGeneration()

      if (context && context.finalized !== true) {
        await args.removeMessage(context.sessionId, context.assistantMessageId ?? '')
        await args.removeMessage(context.sessionId, context.userMessageId)
      }

      emitContext(null)
      desiredText = ''
      appliedText = ''
      appliedMode = null
      desiredMode = 'preview'
    },
  }
}
