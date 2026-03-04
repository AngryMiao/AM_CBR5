import type { Message, MessageContentParts, MessageToolCallPart } from '@shared/types'
import type { ModelDependencies } from '@shared/types/adapters'
import type { FilePart, ImagePart, ModelMessage, TextPart, ToolCallPart, ToolResultPart } from 'ai'
import dayjs from 'dayjs'
import { compact } from 'lodash'
import { createModelDependencies } from '@/adapters'
import { cloneMessage, getMessageText } from '@/utils/message'

async function convertContentParts<T extends TextPart | ImagePart | FilePart>(
  contentParts: MessageContentParts,
  imageType: 'image' | 'file',
  dependencies: ModelDependencies,
  options?: { modelSupportVision: boolean }
): Promise<T[]> {
  return compact(
    await Promise.all(
      contentParts.map(async (c) => {
        if (c.type === 'text') {
          return { type: 'text', text: c.text } as T
        } else if (c.type === 'image') {
          if (options?.modelSupportVision === false) {
            return { type: 'text', text: `This is an image, OCR Result: \n${c.ocrResult}` } as T
          }
          try {
            const imageData = await dependencies.storage.getImage(c.storageKey)
            if (!imageData) {
              console.warn(`Image not found for storage key: ${c.storageKey}`)
              return null
            }
            const base64Data = imageData.replace(/^data:image\/[^;]+;base64,/, '')
            const mediaType = imageData.match(/^data:([^;]+)/)?.[1] || 'image/png'

            if (imageType === 'image') {
              return {
                type: 'image',
                image: base64Data,
                mediaType,
              } as T
            } else {
              return {
                type: 'file',
                data: base64Data,
                mediaType,
              } as T
            }
          } catch (error) {
            console.error(`Failed to get image for storage key ${c.storageKey}:`, error)
            return null
          }
        }
        return null
      })
    )
  )
}

async function convertUserContentParts(
  contentParts: MessageContentParts,
  dependencies: ModelDependencies,
  options?: { modelSupportVision: boolean }
): Promise<Array<TextPart | ImagePart>> {
  return await convertContentParts<TextPart | ImagePart>(contentParts, 'image', dependencies, options)
}

async function convertAssistantContentParts(
  contentParts: MessageContentParts,
  dependencies: ModelDependencies
): Promise<Array<TextPart | FilePart | ToolCallPart>> {
  const textAndFileParts = await convertContentParts<TextPart | FilePart>(contentParts, 'file', dependencies)

  const toolCallParts: ToolCallPart[] = contentParts
    .filter((c) => c.type === 'tool-call')
    .map((c) => ({
      type: 'tool-call' as const,
      toolCallId: c.toolCallId,
      toolName: c.toolName,
      input: c.args,
    }))

  return [...textAndFileParts, ...toolCallParts]
}

export async function convertToModelMessages(
  messages: Message[],
  options?: { modelSupportVision: boolean }
): Promise<ModelMessage[]> {
  const dependencies = await createModelDependencies()
  const results = await Promise.all(
    messages.map(async (m): Promise<ModelMessage | ModelMessage[] | null> => {
      switch (m.role) {
        case 'system':
          return {
            role: 'system' as const,
            content: getMessageText(m),
          }
        case 'user': {
          const contentParts = await convertUserContentParts(m.contentParts || [], dependencies, options)
          return {
            role: 'user' as const,
            content: contentParts,
          }
        }
        case 'assistant': {
          const contentParts = m.contentParts || []
          const assistantMsg: ModelMessage = {
            role: 'assistant' as const,
            content: await convertAssistantContentParts(contentParts, dependencies),
          }

          // Generate tool result messages for completed tool calls
          const completedToolCalls = contentParts.filter(
            (c): c is MessageToolCallPart => c.type === 'tool-call' && (c.state === 'result' || c.state === 'error')
          )
          if (completedToolCalls.length > 0) {
            const toolMsg: ModelMessage = {
              role: 'tool' as const,
              content: completedToolCalls.map((c) => ({
                type: 'tool-result' as const,
                toolCallId: c.toolCallId,
                toolName: c.toolName,
                output: {
                  type: 'text' as const,
                  value: typeof c.result === 'string' ? c.result : JSON.stringify(c.result ?? ''),
                },
              })) as ToolResultPart[],
            }
            return [assistantMsg, toolMsg]
          }

          return assistantMsg
        }
        case 'tool':
          return null
        default: {
          const _exhaustiveCheck: never = m.role
          throw new Error(`Unknown role: ${_exhaustiveCheck}`)
        }
      }
    })
  )

  // Flatten arrays and filter out null values
  return results.flat().filter((result): result is ModelMessage => result !== null)
}

/**
 * 在 system prompt 中注入模型信息
 * @param model
 * @param messages
 * @returns
 */
export function injectModelSystemPrompt(
  model: string,
  messages: Message[],
  additionalInfo: string,
  role: 'system' | 'user' = 'system'
) {
  const metadataPrompt = `Current model: ${model}\nCurrent date: ${dayjs().format(
    'YYYY-MM-DD'
  )}\n Additional info for this conversation: ${additionalInfo}\n\n`
  let hasInjected = false
  return messages.map((m) => {
    if (m.role === role && !hasInjected) {
      m = cloneMessage(m) // 复制，防止原始数据在其他地方被直接渲染使用
      m.contentParts = [{ type: 'text', text: metadataPrompt + getMessageText(m) }]
      hasInjected = true
    }
    return m
  })
}
