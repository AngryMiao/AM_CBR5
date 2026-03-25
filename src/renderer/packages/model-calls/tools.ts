import type { Message } from '@shared/types'
import { last } from 'lodash'
import * as promptFormat from '@/packages/prompts'
import { getMessageText, sequenceMessages } from '@/utils/message'
import type { ModelInterface } from '../../../shared/models/types'
import { generateText } from '.'

/**
 * Extracts and parses JSON from a model response result to find search actions
 * @param result The model response result containing content parts
 * @returns The parsed search action object or null if none found
 */
function extractSearchActionFromResult<T = any>(result: {
  contentParts: Array<{ type: string; text?: string }>
}): T | null {
  const regex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g
  const textPart = result.contentParts.find((part) => part.type === 'text')

  if (!textPart || !textPart.text) {
    return null
  }

  const match = textPart.text.match(regex)
  if (match) {
    for (const jsonString of match) {
      try {
        const jsonObject = JSON.parse(jsonString) as T
        return jsonObject
      } catch (error) {
        console.warn('Failed to parse JSON string:', jsonString, error)
      }
    }
  }

  return null
}
