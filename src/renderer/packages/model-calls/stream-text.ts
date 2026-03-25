import { getModel } from '@shared/models'
import { ChatboxAIAPIError, OCRError } from '@shared/models/errors'
import { sequenceMessages } from '@shared/utils/message'
import { getModelSettings } from '@shared/utils/model_settings'
import type { ModelMessage, ToolSet } from 'ai'
import { t } from 'i18next'
import { uniqueId } from 'lodash'
import { createModelDependencies } from '@/adapters'
import * as settingActions from '@/stores/settingActions'
import { settingsStore } from '@/stores/settingsStore'
import type {
  ModelInterface,
  OnResultChange,
  OnResultChangeWithCancel,
  OnStatusChange,
} from '../../../shared/models/types'
import {
  type Message,
  type MessageInfoPart,
  type MessageToolCallPart,
  ModelProviderEnum,
  type ProviderOptions,
  type StreamTextResult,
} from '../../../shared/types'
import { mcpController } from '../mcp/controller'
import { resolveAgentSkillPrompt } from '../agent-skills'
import * as chatStore from '@/stores/chatStore'
import { convertToModelMessages, injectModelSystemPrompt, injectPrompt } from './message-utils'
import { imageOCR } from './preprocess'
import fileToolSet from './toolsets/file'

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
  },
  signal?: AbortSignal
): Promise<{ result: StreamTextResult; coreMessages: ModelMessage[] }> {
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

  const needFileToolSet = hasFileOrLink && model.isSupportToolUse()

  let toolSetInstructions = ''
  if (needFileToolSet) {
    toolSetInstructions += fileToolSet.description
  }

  let skillPrompt = ''
  let skillBundleId = ''
  if (sessionId) {
    const session = await chatStore.getSession(sessionId)
    skillBundleId = session?.agentSkill?.bundleId || ''
    skillPrompt = await resolveAgentSkillPrompt(session?.agentSkill)
  }
  const injectionRole = model.isSupportSystemMessage() ? 'system' : 'user'
  if (skillPrompt) {
    params.messages = injectPrompt(params.messages, `${skillPrompt}\n\n`, injectionRole)
  }

  params.messages = injectModelSystemPrompt(
    model.modelId,
    params.messages,
    toolSetInstructions,
    injectionRole
  )

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

    coreMessages = await convertToModelMessages(messages, { modelSupportVision: model.isSupportVision() })

    let tools: ToolSet = {
      ...mcpController.getAvailableTools({ skillBundleId }),
    }

    if (needFileToolSet) {
      tools = {
        ...tools,
        ...fileToolSet.tools,
      }
    }

    console.debug('tools', tools)

    result = await model.chat(coreMessages, {
      sessionId,
      signal: controller.signal,
      onResultChange,
      onStatusChange: params.onStatusChange,
      providerOptions: params.providerOptions,
      tools,
    })

    return { result, coreMessages }
  } catch (err) {
    console.error(err)
    if (controller.signal.aborted) {
      return { result, coreMessages }
    }
    throw err
  }
}
