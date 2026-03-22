import type { Session, SessionMeta } from '@shared/types'
import type { KeyboardShortcut } from '@shared/types/voice'
import storage from '@/storage'
import { StorageKeyGenerator } from '@/storage/StoreStorage'
import { ANGRYMIAO_AGENT_SKILL_ID } from '@/packages/agent-skills'
import * as chatStore from '@/stores/chatStore'
import { getSessionMeta, initEmptyChatSession } from '@/stores/sessionHelpers'

export const ANGRYMIAO_SESSION_NAME = 'angrymiao'
export const ANGRYMIAO_SINGLETON_KEY = 'angrymiao-voice'

export function isAngrymiaoSession(session?: Pick<SessionMeta, 'name' | 'singletonKey'> | Pick<Session, 'name' | 'singletonKey'> | null) {
  if (!session) {
    return false
  }
  return session.singletonKey === ANGRYMIAO_SINGLETON_KEY || session.name === ANGRYMIAO_SESSION_NAME
}

function normalizeAngrymiaoSession(session: Session): Session {
  return {
    ...session,
    name: ANGRYMIAO_SESSION_NAME,
    singletonKey: ANGRYMIAO_SINGLETON_KEY,
    agentSkill: {
      id: ANGRYMIAO_AGENT_SKILL_ID,
      version: 1,
    },
    // Angrymiao skill is injected at runtime now, so legacy system prompts can be removed.
    messages: session.messages.filter((message) => message.role !== 'system'),
    threads: undefined,
    threadName: undefined,
    messageForksHash: undefined,
    compactionPoints: undefined,
  }
}

async function ensureAngrymiaoAgentSkill(sessionId: string, _keyboardShortcuts: KeyboardShortcut[] = []) {
  const session = await chatStore.getSession(sessionId)
  if (!session) {
    return null
  }

  const alreadyNormalized = session.name === ANGRYMIAO_SESSION_NAME
    && session.singletonKey === ANGRYMIAO_SINGLETON_KEY
    && session.agentSkill?.id === ANGRYMIAO_AGENT_SKILL_ID
    && session.agentSkill.version === 1
    && !session.messages.some((message) => message.role === 'system')
    && !session.threads
    && !session.threadName
    && !session.messageForksHash
    && !session.compactionPoints

  if (alreadyNormalized) {
    return session
  }

  return await chatStore.updateSessionWithMessages(sessionId, normalizeAngrymiaoSession(session))
}

function createAngrymiaoSession(): Omit<Session, 'id'> {
  const session = initEmptyChatSession()
  session.name = ANGRYMIAO_SESSION_NAME
  session.singletonKey = ANGRYMIAO_SINGLETON_KEY
  session.agentSkill = {
    id: ANGRYMIAO_AGENT_SKILL_ID,
    version: 1,
  }
  session.messages = session.messages.filter((message) => message.role !== 'system')
  session.threads = undefined
  session.threadName = undefined
  session.messageForksHash = undefined
  session.compactionPoints = undefined
  return session
}

export async function ensureAngrymiaoSession(options?: {
  keyboardShortcuts?: KeyboardShortcut[]
  purgeOthers?: boolean
}) {
  const sessions = await chatStore.listSessionsMeta()

  const existingMeta = sessions.find((session) => session.singletonKey === ANGRYMIAO_SINGLETON_KEY)
    || sessions.find((session) => session.name === ANGRYMIAO_SESSION_NAME)

  let session = existingMeta ? await chatStore.getSession(existingMeta.id) : null

  if (!session) {
    session = await chatStore.createSession(createAngrymiaoSession())
  } else {
    session = await ensureAngrymiaoAgentSkill(session.id, options?.keyboardShortcuts)
  }

  if (!session) {
    throw new Error('Failed to initialize angrymiao session')
  }

  if (options?.purgeOthers) {
    const currentSessions = await chatStore.listSessionsMeta()
    for (const existing of currentSessions) {
      if (existing.id !== session.id) {
        await chatStore.deleteSession(existing.id)
      }
    }
    await chatStore.updateSessionList(() => [getSessionMeta(session)])

    const keepStorageKey = StorageKeyGenerator.session(session.id)
    const allKeys = await storage.getAllKeys()
    for (const key of allKeys) {
      if (key.startsWith('session:') && key !== keepStorageKey) {
        await storage.removeItem(key)
      }
    }
  }

  return session
}
