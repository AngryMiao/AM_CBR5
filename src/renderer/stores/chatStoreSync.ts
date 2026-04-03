import type { Session, SessionMeta } from '@shared/types'

const CHAT_STORE_SYNC_CHANNEL = 'angrymiao-chat-store-sync'

type SessionSyncPayload = {
  sourceId: string
  type: 'session'
  sessionId: string
  session: Session | null
  persisted: boolean
}

type SessionListSyncPayload = {
  sourceId: string
  type: 'session-list'
  sessionMetaList: SessionMeta[]
}

type ChatStoreSyncPayload = SessionSyncPayload | SessionListSyncPayload

function createSourceId() {
  return `chat-store-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function cloneForSync<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function createChatStoreSync(args: {
  onRemoteSession: (sessionId: string, session: Session | null, options: { persisted: boolean }) => void
  onRemoteSessionList: (sessionMetaList: SessionMeta[]) => void
}) {
  if (typeof BroadcastChannel === 'undefined') {
    return {
      broadcastSession: (_sessionId: string, _session: Session | null, _options?: { persisted?: boolean }) => undefined,
      broadcastSessionList: (_sessionMetaList: SessionMeta[]) => undefined,
      dispose: () => undefined,
    }
  }

  const sourceId = createSourceId()
  const channel = new BroadcastChannel(CHAT_STORE_SYNC_CHANNEL)

  channel.onmessage = (event) => {
    const payload = event.data as ChatStoreSyncPayload | null
    if (!payload || payload.sourceId === sourceId) {
      return
    }

    if (payload.type === 'session') {
      args.onRemoteSession(payload.sessionId, payload.session ?? null, { persisted: payload.persisted !== false })
      return
    }

    args.onRemoteSessionList(payload.sessionMetaList ?? [])
  }

  return {
    broadcastSession(sessionId: string, session: Session | null, options?: { persisted?: boolean }) {
      channel.postMessage({
        sourceId,
        type: 'session',
        sessionId,
        session: cloneForSync(session),
        persisted: options?.persisted !== false,
      } satisfies SessionSyncPayload)
    },
    broadcastSessionList(sessionMetaList: SessionMeta[]) {
      channel.postMessage({
        sourceId,
        type: 'session-list',
        sessionMetaList: cloneForSync(sessionMetaList),
      } satisfies SessionListSyncPayload)
    },
    dispose() {
      channel.close()
    },
  }
}
