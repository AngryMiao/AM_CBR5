import type {
  ExportChatFormat,
  ExportChatScope,
  Session,
  SessionMeta,
  SessionSettings,
  SessionThread,
  SessionThreadBrief,
  Settings,
} from '@shared/types'
import { getMessageText, migrateMessage } from '@shared/utils/message'
import { pick } from 'lodash'
import i18n from '@/i18n'
import { formatChatAsHtml, formatChatAsMarkdown, formatChatAsTxt } from '@/lib/format-chat'
import { getLogger } from '@/lib/utils'
import { PREVIEW_LINES } from '@/packages/context-management/attachment-payload'
import * as remote from '@/packages/remote'
import { estimateTokens, getTokenizerType } from '@/packages/token'
import platform from '@/platform'
import storage from '@/storage'
import { StorageKey, StorageKeyGenerator } from '@/storage/StoreStorage'
import { migrateSession, sortSessions } from '@/utils/session-utils'
import * as defaults from '../../shared/defaults'
import { createMessage, type Message, SessionSettingsSchema, TOKEN_CACHE_KEYS } from '../../shared/types'
import { lastUsedModelStore } from './lastUsedModelStore'
import * as settingActions from './settingActions'
import { settingsStore } from './settingsStore'

const log = getLogger('session-helpers')

function getCurrentTokenizerType(): 'default' | 'deepseek' {
  const currentModel = lastUsedModelStore.getState().chat
  return getTokenizerType(currentModel)
}

export function computePreviewMetadata(
  content: string,
  tokenizerType: 'default' | 'deepseek',
  existingTokenMap: Record<string, number> = {}
): {
  lineCount: number
  byteLength: number
  tokenCountMap: Record<string, number>
  tokenCalculatedAt: Record<string, number>
} {
  const lineCount = content.split('\n').length
  const byteLength = new TextEncoder().encode(content).length
  const now = Date.now()

  const previewContent = content.split('\n').slice(0, PREVIEW_LINES).join('\n')

  const tokenCountMap: Record<string, number> = { ...existingTokenMap }
  const tokenCalculatedAt: Record<string, number> = {}

  // Only calculate for the specified tokenizer
  const fullKey = tokenizerType // 'default' or 'deepseek'
  const previewKey = `${tokenizerType}_preview`

  if (tokenCountMap[fullKey] === undefined) {
    tokenCountMap[fullKey] = estimateTokens(
      content,
      tokenizerType === 'deepseek' ? { provider: '', modelId: 'deepseek' } : undefined
    )
    tokenCalculatedAt[fullKey] = now
  }

  tokenCountMap[previewKey] = estimateTokens(
    previewContent,
    tokenizerType === 'deepseek' ? { provider: '', modelId: 'deepseek' } : undefined
  )
  tokenCalculatedAt[previewKey] = now

  return { lineCount, byteLength, tokenCountMap, tokenCalculatedAt }
}

export async function preprocessFile(
  _file: File,
  _settings: SessionSettings
): Promise<{
  file: File
  content: string
  storageKey: string
  tokenCountMap?: Record<string, number>
  lineCount?: number
  byteLength?: number
  error?: string
}> {
  return {
    file: _file,
    content: '',
    storageKey: '',
    error: 'File attachments are not supported',
  }
}

/**
 * 预处理链接以获取内容
 * @param url 链接地址
 * @param settings 会话设置
 * @returns 预处理后的链接信息
 */
export async function preprocessLink(
  url: string,
  settings: SessionSettings
): Promise<{
  url: string
  title: string
  content: string
  storageKey: string
  tokenCountMap?: Record<string, number>
  lineCount?: number
  byteLength?: number
  error?: string
}> {
  try {
    const uniqKey = StorageKeyGenerator.linkUniqKey(url)

    // 检查是否已经处理过这个链接
    const existingContent = await storage.getBlob(uniqKey).catch(() => null)
    if (existingContent) {
      // 如果已经有内容，尝试从内容中提取标题
      const titleMatch = existingContent.match(/<title[^>]*>([^<]+)<\/title>/i)
      const title = titleMatch ? titleMatch[1] : url.replace(/^https?:\/\//, '')

      // Get existing token map or create new one
      const existingTokenMap: Record<string, number> = (await storage.getItem(`${uniqKey}_tokenMap`, {})) as Record<
        string,
        number
      >

      const tokenizerType = getCurrentTokenizerType()
      const { lineCount, byteLength, tokenCountMap } = computePreviewMetadata(
        existingContent,
        tokenizerType,
        existingTokenMap
      )

      await storage.setItem(`${uniqKey}_tokenMap`, tokenCountMap)

      return {
        url,
        title,
        content: existingContent,
        storageKey: uniqKey,
        tokenCountMap,
        lineCount,
        byteLength,
      }
    }

    const fetchResult = await remote.parseUserLinkFree({ url })
    const tempKey = `parseUrl-${Date.now()}`
    await platform.setStoreBlob(tempKey, fetchResult.text)
    const title = fetchResult.title
    const content = fetchResult.text || ''

    if (content) {
      await storage.setBlob(uniqKey, content)
    }

    const tokenizerType = getCurrentTokenizerType()
    const { lineCount, byteLength, tokenCountMap } = content
      ? computePreviewMetadata(content, tokenizerType)
      : { lineCount: undefined, byteLength: undefined, tokenCountMap: {} }

    if (content) {
      await storage.setItem(`${uniqKey}_tokenMap`, tokenCountMap)
    }

    return {
      url,
      title,
      content,
      storageKey: uniqKey,
      tokenCountMap,
      lineCount,
      byteLength,
    }
  } catch (error) {
    return {
      url,
      title: url.replace(/^https?:\/\//, ''),
      content: '',
      storageKey: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * 构建用户消息，只包含元数据不包含内容
 * @param text 消息文本
 * @param pictureKeys 图片存储键列表
 * @param preprocessedFiles 预处理后的文件信息
 * @param preprocessedLinks 预处理后的链接信息
 * @returns 构建好的消息对象
 */
export function constructUserMessage(
  text: string,
  pictureKeys: string[] = [],
  preprocessedFiles: Array<{
    file: File
    content: string
    storageKey: string
    tokenCountMap?: Record<string, number>
    lineCount?: number
    byteLength?: number
  }> = [],
  preprocessedLinks: Array<{
    url: string
    title: string
    content: string
    storageKey: string
    tokenCountMap?: Record<string, number>
    lineCount?: number
    byteLength?: number
  }> = []
): Message {
  // 只使用原始文本，不添加文件和链接内容
  const msg = createMessage('user', text)

  // 添加图片
  if (pictureKeys.length > 0) {
    msg.contentParts = msg.contentParts ?? []
    msg.contentParts.push(...pictureKeys.map((k) => ({ type: 'image' as const, storageKey: k })))
  }

  if (preprocessedFiles.length > 0) {
    msg.files = preprocessedFiles.map((f) => ({
      id: f.storageKey || f.file.name,
      name: f.file.name,
      fileType: f.file.type,
      storageKey: f.storageKey,
      tokenCountMap: f.tokenCountMap,
      lineCount: f.lineCount,
      byteLength: f.byteLength,
    }))
  }

  if (preprocessedLinks.length > 0) {
    msg.links = preprocessedLinks.map((l) => ({
      id: l.storageKey || l.url,
      url: l.url,
      title: l.title,
      storageKey: l.storageKey,
      tokenCountMap: l.tokenCountMap,
      lineCount: l.lineCount,
      byteLength: l.byteLength,
    }))
  }

  return msg
}

export async function exportChat(session: Session, scope: ExportChatScope, format: ExportChatFormat) {
  const threads: SessionThread[] = scope === 'all_threads' ? [...(session.threads || [])] : []
  threads.push({
    id: session.id,
    name: session.threadName || session.name,
    messages: session.messages,
    createdAt: Date.now(),
  })

  if (format === 'Markdown') {
    const content = formatChatAsMarkdown(session.name, threads)
    platform.exporter.exportTextFile(`${session.name}.md`, content)
  } else if (format === 'TXT') {
    const content = formatChatAsTxt(session.name, threads)
    platform.exporter.exportTextFile(`${session.name}.txt`, content)
  } else if (format === 'HTML') {
    const content = await formatChatAsHtml(session.name, threads)
    platform.exporter.exportTextFile(`${session.name}.html`, content)
  }
}

export function mergeSettings(
  globalSettings: Settings,
  sessionSetting?: SessionSettings,
  sessionType?: 'picture' | 'chat'
): SessionSettings {
  if (!sessionSetting) {
    return SessionSettingsSchema.parse(globalSettings)
  }
  return SessionSettingsSchema.parse({
    ...globalSettings,
    ...(sessionType === 'picture'
      ? {
          imageGenerateNum: defaults.pictureSessionSettings().imageGenerateNum,
          dalleStyle: defaults.pictureSessionSettings().dalleStyle,
        }
      : {
          maxContextMessageCount: defaults.chatSessionSettings().maxContextMessageCount,
        }),
    ...sessionSetting,
  })
}

export function initEmptyChatSession(): Omit<Session, 'id'> {
  const settings = settingsStore.getState().getSettings()
  const { chat: lastUsedChatModel } = lastUsedModelStore.getState()
  const newSession: Omit<Session, 'id'> = {
    name: 'Untitled',
    type: 'chat',
    messages: [],
    settings: {
      maxContextMessageCount: settings.maxContextMessageCount ?? Number.MAX_SAFE_INTEGER,
      temperature: settings.temperature || undefined,
      topP: settings.topP || undefined,
      ...(settings.defaultChatModel
        ? {
            provider: settings.defaultChatModel.provider,
            modelId: settings.defaultChatModel.model,
          }
        : lastUsedChatModel),
    },
  }
  if (settings.defaultPrompt) {
    newSession.messages.push(createMessage('system', settings.defaultPrompt || defaults.getDefaultPrompt()))
  }
  return newSession
}

export function initEmptyPictureSession(): Omit<Session, 'id'> {
  const { picture: lastUsedPictureModel } = lastUsedModelStore.getState()

  return {
    name: 'Untitled',
    type: 'picture',
    messages: [createMessage('system', i18n.t('Image Creator Intro') || '')],
    settings: {
      ...lastUsedPictureModel,
    },
  }
}

export function getSessionMeta(session: SessionMeta) {
  return pick(session, ['id', 'name', 'singletonKey', 'starred', 'assistantAvatarKey', 'picUrl', 'type'])
}

function _searchSessions(regexp: RegExp, s: Session) {
  const session = migrateSession(s)
  const matchedMessages: Message[] = []
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const message = session.messages[i]
    if (regexp.test(getMessageText(message))) {
      matchedMessages.push(message)
    }
  }
  // 搜索会话的历史主题
  if (session.threads) {
    for (let i = session.threads.length - 1; i >= 0; i--) {
      const thread = session.threads[i]
      for (let j = thread.messages.length - 1; j >= 0; j--) {
        const message = thread.messages[j]
        if (regexp.test(getMessageText(message))) {
          matchedMessages.push(message)
        }
      }
    }
  }
  return matchedMessages.map((m) => migrateMessage(m))
}

export async function searchSessions(searchInput: string, sessionId?: string, onResult?: (result: Session[]) => void) {
  const safeInput = searchInput.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
  const regexp = new RegExp(safeInput, 'i')
  let matchedMessageTotal = 0

  const emitBatch = (batch: Session[]) => {
    if (batch.length === 0) {
      return
    }
    onResult?.(batch)
  }

  if (sessionId) {
    const session = await storage.getItem<Session | null>(StorageKeyGenerator.session(sessionId), null)
    if (session) {
      const matchedMessages = _searchSessions(regexp, session)
      matchedMessageTotal += matchedMessages.length
      emitBatch([{ ...session, messages: matchedMessages }])
    }
  } else {
    const sessionsList = sortSessions(await storage.getItem<SessionMeta[]>(StorageKey.ChatSessionsList, []))

    for (const sessionMeta of sessionsList) {
      const session = await storage.getItem<Session | null>(StorageKeyGenerator.session(sessionMeta.id), null)
      if (session) {
        const messages = _searchSessions(regexp, session)
        if (messages.length > 0) {
          matchedMessageTotal += messages.length
          emitBatch([{ ...session, messages }])
        }
        if (matchedMessageTotal >= 50) {
          break
        }
      }
    }
  }
}

export function getCurrentThreadHistoryHash(s: Session) {
  const ret: { [firstMessageId: string]: SessionThreadBrief } = {}
  if (s.threads) {
    for (const thread of s.threads) {
      if (!thread.messages || thread.messages.length === 0) {
        continue
      }
      ret[thread.messages[0].id] = {
        id: thread.id,
        name: thread.name,
        createdAt: thread.createdAt,
        createdAtLabel: new Date(thread.createdAt).toLocaleString(),
        firstMessageId: thread.messages[0].id,
        messageCount: thread.messages.length,
      }
    }
    if (s.messages && s.messages.length > 0) {
      ret[s.messages[0].id] = {
        id: s.id,
        name: s.threadName || '',
        firstMessageId: s.messages[0].id,
        messageCount: s.messages.length,
      }
    }
  }
  return ret
}

export function getAllMessageList(s: Session) {
  let messageContext: Message[] = []
  if (s.threads) {
    for (const thread of s.threads) {
      messageContext = messageContext.concat(thread.messages)
    }
  }
  if (s.messages) {
    messageContext = messageContext.concat(s.messages)
  }
  return messageContext
}
