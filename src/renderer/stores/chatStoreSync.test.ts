import type { Session, SessionMeta } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type BroadcastMessageHandler = ((event: { data: unknown }) => void) | null

class FakeBroadcastChannel {
  static channels = new Map<string, Set<FakeBroadcastChannel>>()

  public onmessage: BroadcastMessageHandler = null

  constructor(public readonly name: string) {
    const peers = FakeBroadcastChannel.channels.get(name) ?? new Set<FakeBroadcastChannel>()
    peers.add(this)
    FakeBroadcastChannel.channels.set(name, peers)
  }

  postMessage(data: unknown) {
    const peers = FakeBroadcastChannel.channels.get(this.name)
    if (!peers) {
      return
    }

    for (const peer of peers) {
      if (peer === this) {
        continue
      }
      peer.onmessage?.({ data })
    }
  }

  close() {
    const peers = FakeBroadcastChannel.channels.get(this.name)
    peers?.delete(this)
    if (peers && peers.size === 0) {
      FakeBroadcastChannel.channels.delete(this.name)
    }
  }
}

vi.mock('@/lib/utils', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

describe('createChatStoreSync', () => {
  beforeEach(() => {
    vi.resetModules()
    FakeBroadcastChannel.channels.clear()
    ;(globalThis as typeof globalThis & { BroadcastChannel: typeof FakeBroadcastChannel }).BroadcastChannel =
      FakeBroadcastChannel
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete (globalThis as typeof globalThis & { BroadcastChannel?: typeof FakeBroadcastChannel }).BroadcastChannel
    FakeBroadcastChannel.channels.clear()
  })

  it('broadcasts session and session list updates to other windows using serializable snapshots only', async () => {
    const { createChatStoreSync } = await import('./chatStoreSync')

    const receivedByMain: {
      session: Array<{ sessionId: string; session: Session | null; persisted: boolean }>
      lists: SessionMeta[][]
    } = {
      session: [],
      lists: [],
    }
    const receivedByVoice: {
      session: Array<{ sessionId: string; session: Session | null; persisted: boolean }>
      lists: SessionMeta[][]
    } = {
      session: [],
      lists: [],
    }

    const mainSync = createChatStoreSync({
      onRemoteSession: (sessionId, session, options) => {
        receivedByMain.session.push({ sessionId, session, persisted: options.persisted })
      },
      onRemoteSessionList: (sessionMetaList) => {
        receivedByMain.lists.push(sessionMetaList)
      },
    })

    const voiceSync = createChatStoreSync({
      onRemoteSession: (sessionId, session, options) => {
        receivedByVoice.session.push({ sessionId, session, persisted: options.persisted })
      },
      onRemoteSessionList: (sessionMetaList) => {
        receivedByVoice.lists.push(sessionMetaList)
      },
    })

    const session = {
      id: 'session-1',
      name: 'angrymiao',
      messages: [
        {
          id: 'assistant-1',
          role: 'assistant',
          contentParts: [{ type: 'text', text: '你好' }],
          generating: true,
          cancel: () => undefined,
        },
      ],
    } as Session

    const sessionMetaList = [
      {
        id: 'session-1',
        name: 'angrymiao',
        type: 'chat',
      },
    ] as SessionMeta[]

    voiceSync.broadcastSession('session-1', session)

    expect(receivedByVoice.session).toEqual([])
    expect(receivedByMain.session).toHaveLength(1)
    expect(receivedByMain.session[0]?.sessionId).toBe('session-1')
    expect(receivedByMain.session[0]?.persisted).toBe(true)
    expect(receivedByMain.session[0]?.session?.messages[0]?.contentParts).toEqual([{ type: 'text', text: '你好' }])
    expect(receivedByMain.session[0]?.session?.messages[0]?.cancel).toBeUndefined()

    mainSync.broadcastSessionList(sessionMetaList)

    expect(receivedByMain.lists).toEqual([])
    expect(receivedByVoice.lists).toEqual([sessionMetaList])

    mainSync.dispose()
    voiceSync.dispose()
  })

  it('marks transient session snapshots so receivers can avoid treating cache-only updates as durable state', async () => {
    const { createChatStoreSync } = await import('./chatStoreSync')

    const receivedByMain: Array<{ sessionId: string; session: Session | null; persisted: boolean }> = []

    const mainSync = createChatStoreSync({
      onRemoteSession: (sessionId, session, options) => {
        receivedByMain.push({ sessionId, session, persisted: options.persisted })
      },
      onRemoteSessionList: () => undefined,
    })

    const voiceSync = createChatStoreSync({
      onRemoteSession: () => undefined,
      onRemoteSessionList: () => undefined,
    })

    voiceSync.broadcastSession(
      'session-2',
      {
        id: 'session-2',
        name: 'angrymiao',
        messages: [
          {
            id: 'assistant-2',
            role: 'assistant',
            contentParts: [],
            generating: true,
          },
        ],
      } as Session,
      { persisted: false }
    )

    expect(receivedByMain).toEqual([
      {
        sessionId: 'session-2',
        session: {
          id: 'session-2',
          name: 'angrymiao',
          messages: [
            {
              id: 'assistant-2',
              role: 'assistant',
              contentParts: [],
              generating: true,
            },
          ],
        },
        persisted: false,
      },
    ])

    mainSync.dispose()
    voiceSync.dispose()
  })
})
