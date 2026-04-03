import { getModel } from '@shared/models'
import { ChatboxAIAPIError, OCRError } from '@shared/models/errors'
import { getMessageText, sequenceMessages } from '@shared/utils/message'
import { getModelSettings } from '@shared/utils/model_settings'
import type { ModelMessage, ToolSet } from 'ai'
import { t } from 'i18next'
import { createModelDependencies } from '@/adapters'
import { getLogger } from '@/lib/utils'
import * as chatStore from '@/stores/chatStore'
import { settingsStore } from '@/stores/settingsStore'
import type {
  ModelInterface,
  OnResultChange,
  OnResultChangeWithCancel,
  OnStatusChange,
} from '../../../shared/models/types'
import type { Message, MessageInfoPart, ProviderOptions, StreamTextResult } from '../../../shared/types'
import { resolveAgentSkillPrompt } from '../agent-skills'
import { mcpController } from '../mcp/controller'
import { convertToModelMessages, injectModelSystemPrompt, injectPrompt } from './message-utils'
import { imageOCR } from './preprocess'
import fileToolSet from './toolsets/file'

const log = getLogger('typeless-debug')
const ANGRYMIAO_SESSION_NAME = 'angrymiao'
const ANGRYMIAO_SINGLETON_KEY = 'angrymiao-voice'
const SLOW_PREPARE_MS = 1200
const SLOW_MODEL_WAIT_MS = 3000
const SLOW_MODEL_TOTAL_MS = 10000
const REQUEST_PREVIEW_MAX_CHARS = 320
const RESPONSE_PREVIEW_MAX_CHARS = 480
const STREAM_SNAPSHOT_INTERVAL_MS = 800
const STREAM_SNAPSHOT_MIN_DELTA_CHARS = 48

function isTypelessVoiceSession(session?: { name?: string; singletonKey?: string } | null) {
  if (!session) {
    return false
  }
  return session.singletonKey === ANGRYMIAO_SINGLETON_KEY || session.name === ANGRYMIAO_SESSION_NAME
}

function buildDebugMessage(contentParts: Message['contentParts']): Message {
  return {
    id: 'typeless-debug-message',
    role: 'assistant',
    contentParts,
  }
}

function truncateTextForLog(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) {
    return JSON.stringify(normalized)
  }
  return JSON.stringify(`${normalized.slice(0, maxChars)}...(truncated ${normalized.length - maxChars} chars)`)
}

function extractModelMessageText(message?: ModelMessage) {
  if (!message) {
    return ''
  }
  if (typeof message.content === 'string') {
    return message.content
  }
  if (!Array.isArray(message.content)) {
    return ''
  }
  return message.content
    .map((part) => {
      if (part.type === 'text') {
        return part.text
      }
      return `[${part.type}]`
    })
    .join('\n')
}

function logRequestSummary(args: { sessionId?: string; mode: 'preview' | 'execute'; messages: ModelMessage[] }) {
  const firstSystemMessage = args.messages.find((message) => message.role === 'system')
  const lastUserMessage = [...args.messages].reverse().find((message) => message.role === 'user')
  const firstSystemText = extractModelMessageText(firstSystemMessage)
  const lastUserText = extractModelMessageText(lastUserMessage)

  log.info(
    `llm-request-summary sessionId=${args.sessionId ?? 'none'} mode=${args.mode} firstSystemLength=${firstSystemText.length} firstSystemPreview=${truncateTextForLog(firstSystemText, REQUEST_PREVIEW_MAX_CHARS)} lastUserLength=${lastUserText.length} lastUserPreview=${truncateTextForLog(lastUserText, REQUEST_PREVIEW_MAX_CHARS)}`
  )
}

async function ocrMessages(messages: Message[]) {
  const settings = settingsStore.getState().getSettings()
  const hasUserOcrModel = settings.ocrModel?.provider && settings.ocrModel?.model

  if (!hasUserOcrModel) {
    throw ChatboxAIAPIError.fromCodeName('model_not_support_image_2', 'model_not_support_image_2')
  }

  const ocrProviderName = settings.ocrModel!.provider
  try {
    const dependencies = await createModelDependencies()
    const ocrModelSetting = settings.ocrModel!
    const modelSettings = getModelSettings(settings, ocrModelSetting.provider, ocrModelSetting.model)
    const ocrModel: ModelInterface = getModel(modelSettings, settings, { uuid: '123' }, dependencies)
    await imageOCR(ocrModel, messages)
  } catch (err) {
    throw new OCRError(ocrProviderName, err instanceof Error ? err : new Error(`${err}`))
  }
}

export async function streamText(
  model: ModelInterface,
  params: {
    sessionId?: string
    messages: Message[]
    onResultChangeWithCancel: OnResultChangeWithCancel
    onStatusChange?: OnStatusChange
    providerOptions?: ProviderOptions
    toolExecutionMode?: 'preview' | 'execute'
  },
  signal?: AbortSignal
): Promise<{ result: StreamTextResult; coreMessages: ModelMessage[] }> {
  const streamStartAt = Date.now()
  const { sessionId } = params
  const hasFileOrLink = params.messages.some((m) => m.files?.length || m.links?.length)

  const controller = new AbortController()
  const cancel = () => controller.abort()
  if (signal) {
    signal.addEventListener('abort', cancel, { once: true })
  }

  let result: StreamTextResult = {
    contentParts: [],
  }
  let coreMessages: ModelMessage[] = []
  let shouldDebugTypeless = false
  let slowModelWaitTimer: ReturnType<typeof setTimeout> | null = null

  const needFileToolSet = hasFileOrLink && model.isSupportToolUse()

  let toolSetInstructions = ''
  if (needFileToolSet) {
    toolSetInstructions += fileToolSet.description
  }

  let skillPrompt = ''
  let skillBundleId = ''
  if (sessionId) {
    const skillPromptStartAt = Date.now()
    const session = await chatStore.getSession(sessionId)
    shouldDebugTypeless = isTypelessVoiceSession(session)
    skillBundleId = session?.agentSkill?.bundleId || ''
    const lastUserMessage = [...params.messages].reverse().find((message) => message.role === 'user')
    const currentTurnUserText = lastUserMessage ? getMessageText(lastUserMessage).trim() : ''
    skillPrompt = await resolveAgentSkillPrompt(
      session?.agentSkill,
      settingsStore.getState().getSettings().voice || null,
      currentTurnUserText
    )
    const durationMs = Date.now() - skillPromptStartAt
    if (shouldDebugTypeless && durationMs >= SLOW_PREPARE_MS) {
      log.info(
        `skill-prompt-slow sessionId=${sessionId} durationMs=${durationMs} hasSkillPrompt=${skillPrompt ? 'true' : 'false'}`
      )
    }
  }
  const injectionRole = model.isSupportSystemMessage() ? 'system' : 'user'
  if (skillPrompt) {
    params.messages = injectPrompt(params.messages, `${skillPrompt}\n\n`, injectionRole)
  }

  params.messages = injectModelSystemPrompt(model.modelId, params.messages, toolSetInstructions, injectionRole)

  if (!model.isSupportSystemMessage()) {
    params.messages = params.messages.map((m) => ({ ...m, role: m.role === 'system' ? 'user' : m.role }))
  }

  const messages = sequenceMessages(params.messages)
  const infoParts: MessageInfoPart[] = []
  try {
    params.onResultChangeWithCancel({ cancel })
    const onResultChange: OnResultChange = (data) => {
      if (data.contentParts) {
        result = { ...result, ...data, contentParts: [...infoParts, ...data.contentParts] }
      } else {
        result = { ...result, ...data }
      }
      params.onResultChangeWithCancel({ ...result, cancel })
    }
    if (
      !model.isSupportVision() &&
      messages.some((m) => m.contentParts.some((c) => c.type === 'image' && !c.ocrResult))
    ) {
      await ocrMessages(messages)
      infoParts.push({
        type: 'info',
        text: t('Current model {{modelName}} does not support image input, using OCR to process images', {
          modelName: model.modelId,
        }),
      })
    }

    const convertStartAt = Date.now()
    coreMessages = await convertToModelMessages(messages, { modelSupportVision: model.isSupportVision() })
    const convertDurationMs = Date.now() - convertStartAt

    let tools: ToolSet = {
      ...mcpController.getAvailableTools({
        skillBundleId,
        executionMode: params.toolExecutionMode ?? 'execute',
      }),
    }
    const initialToolCount = Object.keys(tools).length

    if (needFileToolSet) {
      tools = {
        ...tools,
        ...fileToolSet.tools,
      }
    }

    const totalToolCount = Object.keys(tools).length
    if (
      shouldDebugTypeless &&
      (convertDurationMs >= SLOW_PREPARE_MS || Date.now() - streamStartAt >= SLOW_PREPARE_MS)
    ) {
      log.info(
        `model-prepare-slow sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} convertMessagesMs=${convertDurationMs} totalPrepareMs=${Date.now() - streamStartAt} coreMessageCount=${coreMessages.length} toolCount=${totalToolCount}`
      )
    }
    if (shouldDebugTypeless) {
      log.info(
        `llm-request-start sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} providerModel=${model.modelId} startedAt=${new Date(streamStartAt).toISOString()} coreMessageCount=${coreMessages.length} toolCount=${totalToolCount}`
      )
        logRequestSummary({
          sessionId,
          mode: params.toolExecutionMode ?? 'execute',
          messages: coreMessages,
      })
    }

    let firstResultLogged = false
    let firstActivityType: 'status' | 'result' | null = null
    let lastStreamText = ''
    let lastLoggedStreamLength = 0
    let lastStreamSnapshotLoggedAt = 0
    const maybeLogStreamSnapshot = (currentText: string, force = false) => {
      if (!shouldDebugTypeless || !currentText) {
        return
      }

      const now = Date.now()
      const lengthDelta = currentText.length - lastLoggedStreamLength
      if (
        !force &&
        lengthDelta < STREAM_SNAPSHOT_MIN_DELTA_CHARS &&
        now - lastStreamSnapshotLoggedAt < STREAM_SNAPSHOT_INTERVAL_MS
      ) {
        return
      }

      log.info(
        `llm-stream-text sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} textLength=${currentText.length} preview=${truncateTextForLog(currentText, RESPONSE_PREVIEW_MAX_CHARS)}`
      )
      lastLoggedStreamLength = currentText.length
      lastStreamSnapshotLoggedAt = now
    }
    const originalOnResultChange = onResultChange
    const timedOnResultChange: OnResultChange = (data) => {
      const contentPartsForLog = data.contentParts ? [...infoParts, ...data.contentParts] : result.contentParts
      if (!firstResultLogged && contentPartsForLog?.length) {
        firstResultLogged = true
        if (!firstActivityType) {
          firstActivityType = 'result'
        }
        if (slowModelWaitTimer) {
          clearTimeout(slowModelWaitTimer)
          slowModelWaitTimer = null
        }
        if (shouldDebugTypeless) {
          log.info(
            `model-first-result sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} elapsedMs=${Date.now() - streamStartAt} contentPartCount=${contentPartsForLog.length}`
          )
        }
      }
      if (shouldDebugTypeless && contentPartsForLog?.length) {
        const currentText = getMessageText(buildDebugMessage(contentPartsForLog))
        if (currentText && currentText !== lastStreamText && !currentText.startsWith(lastStreamText)) {
          log.info(
            `llm-stream-reset sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} textLength=${currentText.length} preview=${truncateTextForLog(currentText, RESPONSE_PREVIEW_MAX_CHARS)}`
          )
        }
        lastStreamText = currentText
        maybeLogStreamSnapshot(currentText)
      }
      originalOnResultChange(data)
    }

    let firstStatusLogged = false
    const timedOnStatusChange: OnStatusChange | undefined = params.onStatusChange
      ? (status) => {
          if (!firstStatusLogged && status) {
            firstStatusLogged = true
            if (!firstActivityType) {
              firstActivityType = 'status'
            }
            if (slowModelWaitTimer) {
              clearTimeout(slowModelWaitTimer)
              slowModelWaitTimer = null
            }
            if (shouldDebugTypeless) {
              log.info(
                `model-first-status sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} elapsedMs=${Date.now() - streamStartAt} statusType=${status.type}`
              )
            }
          }
          if (shouldDebugTypeless && status) {
            // assistant-status / model-first-status 已足够定位进度，这里不再重复打印完整状态对象。
          }
          params.onStatusChange?.(status)
        }
      : undefined

    if (shouldDebugTypeless) {
      slowModelWaitTimer = setTimeout(() => {
        log.info(
          `model-waiting sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} elapsedMs=${Date.now() - streamStartAt} providerModel=${model.modelId} coreMessageCount=${coreMessages.length} toolCount=${totalToolCount} initialToolCount=${initialToolCount}`
        )
      }, SLOW_MODEL_WAIT_MS)
    }

    result = await model.chat(coreMessages, {
      sessionId,
      signal: controller.signal,
      onResultChange: timedOnResultChange,
      onStatusChange: timedOnStatusChange,
      providerOptions: params.providerOptions,
      toolExecutionMode: params.toolExecutionMode,
      tools,
    })
    if (slowModelWaitTimer) {
      clearTimeout(slowModelWaitTimer)
      slowModelWaitTimer = null
    }
    const totalDurationMs = Date.now() - streamStartAt
    const finishedAt = new Date().toISOString()
    if (shouldDebugTypeless) {
      maybeLogStreamSnapshot(getMessageText(buildDebugMessage(result.contentParts ?? [])), true)
      log.info(
        `llm-request-finished sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} providerModel=${model.modelId} startedAt=${new Date(streamStartAt).toISOString()} endedAt=${finishedAt} durationMs=${totalDurationMs} finishReason=${result.finishReason ?? 'unknown'}`
      )
      log.info(
        `llm-response-final sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} textLength=${getMessageText(buildDebugMessage(result.contentParts ?? [])).length} preview=${truncateTextForLog(getMessageText(buildDebugMessage(result.contentParts ?? [])), RESPONSE_PREVIEW_MAX_CHARS)}`
      )
    }
    if (
      shouldDebugTypeless &&
      (params.toolExecutionMode === 'execute' || totalDurationMs >= SLOW_MODEL_TOTAL_MS || firstActivityType === null)
    ) {
      log.info(
        `model-complete sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} totalDurationMs=${totalDurationMs} firstActivity=${firstActivityType ?? 'none'} finishReason=${result.finishReason ?? 'unknown'}`
      )
    }

    return { result, coreMessages }
  } catch (err) {
    if (slowModelWaitTimer) {
      clearTimeout(slowModelWaitTimer)
      slowModelWaitTimer = null
    }
    console.error(err)
    if (shouldDebugTypeless) {
      log.info(
        `model-error sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} elapsedMs=${Date.now() - streamStartAt} aborted=${controller.signal.aborted ? 'true' : 'false'} error=${err instanceof Error ? err.message : String(err)}`
      )
      log.info(
        `llm-request-failed sessionId=${sessionId ?? 'none'} mode=${params.toolExecutionMode ?? 'execute'} providerModel=${model.modelId} startedAt=${new Date(streamStartAt).toISOString()} endedAt=${new Date().toISOString()} error=${JSON.stringify(err instanceof Error ? err.message : String(err))}`
      )
    }
    if (controller.signal.aborted) {
      return { result, coreMessages }
    }
    throw err
  }
}
