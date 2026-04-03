/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { streamingTextAtom, typelessChatResultAtom, typelessRequestAtom, voiceModeAtom } from '@/stores/voiceStore'

const mocks = vi.hoisted(() => {
  const hotkeys = {
    down: null as (() => void) | null,
    up: null as (() => void) | null,
    resultClosed: null as ((payload: { userMessageId: string }) => void) | null,
  }

  const recorder = {
    startCalls: 0,
    stopCalls: 0,
    stopDelays: [] as number[],
    transcribeDelayMs: 0,
    transcribeText: '',
    transcribeCalls: 0,
    startOptions: null as Record<string, unknown> | null,
    audioChunkHandler: null as ((chunk: Uint8Array) => void) | null,
  }

  const request = {
    executionPhase: null as 'thinking' | 'chat_result' | null,
    context: {
      sessionId: 'session-1',
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      asrText: '你好',
      startedAt: 1,
    },
    lastStartText: null as string | null,
  }

  const live = {
    createCalls: 0,
    enqueueCalls: [] as Array<{ text: string; toolExecutionMode: 'preview' | 'execute' }>,
    abortCalls: 0,
    onGenerationSettled: null as
      | ((payload: {
          context: {
            sessionId: string
            userMessageId: string
            assistantMessageId?: string
            asrText: string
            startedAt: number
            finalized: boolean
          }
          assistantMessage: {
            id: string
            role: 'assistant'
            generating?: boolean
            error?: string
            contentParts: Array<{ type: 'text'; text: string }>
          } | null
          toolExecutionMode: 'preview' | 'execute'
        }) => void)
      | null,
  }

  const ipc = {
    invoke: vi.fn(),
    showTypelessChatResult: vi.fn(async () => undefined),
    hideTypelessChatResult: vi.fn(async () => undefined),
  }

  const chat = {
    session: null as { messages: unknown[] } | null,
  }

  const voiceSettings = {
    enabled: true,
    workMode: 'typeless',
    asrProvider: 'whisper-local',
    ttsProvider: 'browser',
    asrConfig: {
      doubao: {
        appId: 'test-app',
        accessKey: 'test-key',
        model: 'bigmodel',
        baseURL: 'wss://example.invalid/api/v3/sauc/bigmodel_async',
      },
    },
    ttsConfig: {},
    autoStopRecording: false,
    silenceThreshold: 0.02,
    silenceDuration: 3000,
    maxRecordingDuration: 60000,
    microphoneDeviceId: undefined,
    autoPlayResponse: false,
    shortcuts: {
      toggleVoice: 'PageDown',
    },
  }

  const doubao = {
    createSessionCalls: 0,
    appendCalls: [] as Uint8Array[],
    commitCalls: 0,
    closeCalls: 0,
    onEvent: null as ((event: { type: string; text?: string; message?: string }) => void) | null,
    eventHandlers: [] as Array<(event: { type: string; text?: string; message?: string }) => void>,
  }

  class MockVoiceRecorder {
    private state: 'inactive' | 'recording' = 'inactive'

    static isSupported() {
      return true
    }

    async start(options?: Record<string, unknown>) {
      recorder.startCalls += 1
      recorder.startOptions = options ?? null
      recorder.audioChunkHandler = (options?.onAudioChunk as ((chunk: Uint8Array) => void) | undefined) ?? null
      this.state = 'recording'
    }

    async stop() {
      const delayMs = recorder.stopDelays.shift() ?? 0
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      recorder.stopCalls += 1
      this.state = 'inactive'
      return new Blob(['voice'])
    }

    getState() {
      return this.state
    }

    getCurrentAudioBlob() {
      return new Blob(['voice'])
    }
  }

  class MockASRProvider {
    async transcribe() {
      recorder.transcribeCalls += 1
      if (recorder.transcribeDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, recorder.transcribeDelayMs))
      }
      return recorder.transcribeText
    }
  }

  class MockDoubaoASRProvider extends MockASRProvider {
    async createStreamingSession({ onEvent }: { onEvent: (event: { type: string; text?: string }) => void }) {
      doubao.createSessionCalls += 1
      doubao.onEvent = onEvent
      doubao.eventHandlers.push(onEvent)
      return {
        appendAudio: vi.fn(async (chunk: Uint8Array) => {
          doubao.appendCalls.push(chunk)
        }),
        commit: vi.fn(async () => {
          doubao.commitCalls += 1
        }),
        close: vi.fn(async () => {
          doubao.closeCalls += 1
        }),
      }
    }
  }

  class MockTTSProvider {
    async speak() {}
    stop() {}
  }

  return {
    chat,
    doubao,
    hotkeys,
    ipc,
    live,
    recorder,
    request,
    MockASRProvider,
    MockDoubaoASRProvider,
    MockTTSProvider,
    MockVoiceRecorder,
    voiceSettings,
  }
})

vi.mock('@/hooks/useVoiceSettings', () => ({
  useVoiceSettings: () => ({
    settings: mocks.voiceSettings,
  }),
}))

vi.mock('@/platform', () => ({
  default: {
    type: 'desktop',
    getPlatform: vi.fn(async () => 'win32'),
  },
}))

vi.mock('@/packages/voice/recorder', () => ({
  VoiceRecorder: mocks.MockVoiceRecorder,
}))

vi.mock('@/packages/voice/asr', () => ({
  WhisperLocalProvider: mocks.MockASRProvider,
  FunASRLocalProvider: mocks.MockASRProvider,
  OpenAIASRProvider: mocks.MockASRProvider,
  AliyunASRProvider: mocks.MockASRProvider,
  AzureASRProvider: mocks.MockASRProvider,
  GoogleASRProvider: mocks.MockASRProvider,
  DoubaoASRProvider: mocks.MockDoubaoASRProvider,
  isStreamingASRProvider: (provider: unknown) =>
    typeof (provider as { createStreamingSession?: unknown })?.createStreamingSession === 'function',
}))

vi.mock('@/packages/voice/tts', () => ({
  BrowserTTSProvider: mocks.MockTTSProvider,
  OpenAITTSProvider: mocks.MockTTSProvider,
  AzureTTSProvider: mocks.MockTTSProvider,
  ElevenLabsTTSProvider: mocks.MockTTSProvider,
}))

vi.mock('@/packages/voice/typeless-execution-state', () => ({
  deriveTypelessExecutionState: ({
    assistantMessage,
  }: {
    assistantMessage: {
      generating?: boolean
      error?: string
      contentParts?: Array<{ type: string; text?: string }>
    } | null
  }) => {
    if (mocks.request.executionPhase) {
      return { phase: mocks.request.executionPhase }
    }
    if (!assistantMessage) {
      return null
    }
    if (assistantMessage.error) {
      return { phase: 'error', message: assistantMessage.error }
    }
    const hasText = assistantMessage.contentParts?.some((part) => part.type === 'text' && part.text?.trim()) ?? false
    if (assistantMessage.generating) {
      return { phase: 'thinking' }
    }
    return hasText ? { phase: 'chat_result' } : null
  },
  findAssistantMessageForUser: () =>
    mocks.request.executionPhase
      ? {
          id: 'assistant-1',
          role: 'assistant',
          contentParts: [{ type: 'text', text: '已完成' }],
        }
      : null,
  mapTypelessExecutionStateToOverlay: (state: { phase: string } | null) =>
    state?.phase === 'chat_result'
      ? { visibility: 'hidden' }
      : state?.phase === 'thinking'
        ? { visibility: 'visible', type: 'thinking', message: '正在思考...' }
        : null,
}))

vi.mock('@/packages/voice/typeless-request', () => ({
  isTypelessRequestFinalized: (context: { finalized?: boolean } | null | undefined) => context?.finalized !== false,
  startTypelessRequest: vi.fn(async ({ text }: { text: string }) => {
    mocks.request.lastStartText = text
    return {
      context: { ...mocks.request.context, asrText: text },
      submitPromise: Promise.resolve(),
    }
  }),
}))

vi.mock('@/packages/voice/live-typeless-request', () => ({
  createLiveTypelessRequestController: vi.fn((args?: {
    onContextChange?: (context: {
      sessionId: string
      userMessageId: string
      assistantMessageId: string
      asrText: string
      startedAt: number
      finalized: boolean
    } | null) => void
    onGenerationSettled?: (payload: {
      context: {
        sessionId: string
        userMessageId: string
        assistantMessageId?: string
        asrText: string
        startedAt: number
        finalized: boolean
      }
      assistantMessage: {
        id: string
        role: 'assistant'
        generating?: boolean
        error?: string
        contentParts: Array<{ type: 'text'; text: string }>
      } | null
      toolExecutionMode: 'preview' | 'execute'
    }) => void
  }) => {
    mocks.live.createCalls += 1
    mocks.live.onGenerationSettled = args?.onGenerationSettled ?? null
    return {
      enqueueTranscript: vi.fn(async (text: string, options?: { toolExecutionMode?: 'preview' | 'execute' }) => {
        mocks.live.enqueueCalls.push({
          text,
          toolExecutionMode: options?.toolExecutionMode ?? 'preview',
        })
        const context = {
          ...mocks.request.context,
          asrText: text,
          finalized: (options?.toolExecutionMode ?? 'preview') === 'execute',
        }
        args?.onContextChange?.(context)
        return context
      }),
      abort: vi.fn(async () => {
        mocks.live.abortCalls += 1
        args?.onContextChange?.(null)
      }),
    }
  }),
}))

vi.mock('@/packages/voice/angrymiao-session', () => ({
  ensureAngrymiaoSession: vi.fn(async () => ({ id: 'session-1' })),
}))

vi.mock('@/stores/session/messages', () => ({
  insertMessage: vi.fn(async () => undefined),
  modifyMessage: vi.fn(async () => undefined),
  removeMessage: vi.fn(async () => undefined),
  submitNewUserMessage: vi.fn(async () => undefined),
}))

vi.mock('@/stores/session/crud', () => ({
  switchCurrentSession: vi.fn(),
}))

vi.mock('@/stores/chatStore', () => ({
  useSession: vi.fn(() => ({ session: mocks.chat.session })),
  getSession: vi.fn(async () => mocks.chat.session),
}))

vi.mock('@/packages/mcp/controller', () => ({
  mcpController: {
    stopServer: vi.fn(async () => undefined),
    updateServer: vi.fn(async () => undefined),
  },
}))

vi.mock('@/packages/skill-bundles', () => ({
  getInstalledSkillBundle: vi.fn(async () => null),
  resolveSkillBundleRuntimeServerConfig: vi.fn(async () => null),
}))

vi.mock('@shared/utils/message', () => ({
  getMessageText: (message: { contentParts?: Array<{ text?: string }> }) =>
    message.contentParts?.map((part) => part.text ?? '').join('') ?? '',
}))

import { startTypelessRequest } from '@/packages/voice/typeless-request'
import { switchCurrentSession } from '@/stores/session/crud'
import { submitNewUserMessage } from '@/stores/session/messages'
import { useVoiceController } from './useVoiceController'

function createWrapper(initializer?: (store: ReturnType<typeof createStore>) => void) {
  const store = createStore()
  initializer?.(store)
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children)
}

function createWrapperWithStore(initializer?: (store: ReturnType<typeof createStore>) => void) {
  const store = createStore()
  initializer?.(store)
  return {
    store,
    wrapper: ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children),
  }
}

function hasInvokeCall(channel: string) {
  return mocks.ipc.invoke.mock.calls.some(([currentChannel]) => currentChannel === channel)
}

function countInvokeCalls(channel: string) {
  return mocks.ipc.invoke.mock.calls.filter(([currentChannel]) => currentChannel === channel).length
}

function getInvokeCalls(channel: string) {
  return mocks.ipc.invoke.mock.calls.filter(([currentChannel]) => currentChannel === channel)
}

async function flushAsyncWork(iterations = 5) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve()
  }
}

async function settleAsyncFlow(options?: { advanceMs?: number; iterations?: number }) {
  if ((options?.advanceMs ?? 0) > 0) {
    vi.advanceTimersByTime(options?.advanceMs ?? 0)
  }
  await flushAsyncWork(options?.iterations ?? 20)
}

describe('useVoiceController typeless hotkey regressions', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.hotkeys.down = null
    mocks.hotkeys.up = null
    mocks.hotkeys.resultClosed = null
    mocks.recorder.startCalls = 0
    mocks.recorder.stopCalls = 0
    mocks.recorder.stopDelays = []
    mocks.recorder.transcribeDelayMs = 0
    mocks.recorder.transcribeText = ''
    mocks.recorder.transcribeCalls = 0
    mocks.recorder.startOptions = null
    mocks.recorder.audioChunkHandler = null
    mocks.request.executionPhase = null
    mocks.request.lastStartText = null
    mocks.live.createCalls = 0
    mocks.live.enqueueCalls = []
    mocks.live.abortCalls = 0
    mocks.live.onGenerationSettled = null
    mocks.chat.session = null
    mocks.voiceSettings.enabled = true
    mocks.voiceSettings.workMode = 'typeless'
    mocks.voiceSettings.asrProvider = 'whisper-local'
    mocks.voiceSettings.ttsProvider = 'browser'
    mocks.voiceSettings.asrConfig = {
      doubao: {
        appId: 'test-app',
        accessKey: 'test-key',
        model: 'bigmodel',
        baseURL: 'wss://example.invalid/api/v3/sauc/bigmodel_async',
      },
    }
    mocks.voiceSettings.ttsConfig = {}
    mocks.voiceSettings.autoStopRecording = false
    mocks.voiceSettings.silenceThreshold = 0.02
    mocks.voiceSettings.silenceDuration = 3000
    mocks.voiceSettings.maxRecordingDuration = 60000
    mocks.voiceSettings.microphoneDeviceId = undefined
    mocks.voiceSettings.autoPlayResponse = false
    mocks.voiceSettings.shortcuts = { toggleVoice: 'PageDown' }
    mocks.doubao.createSessionCalls = 0
    mocks.doubao.appendCalls = []
    mocks.doubao.commitCalls = 0
    mocks.doubao.closeCalls = 0
    mocks.doubao.onEvent = null
    mocks.doubao.eventHandlers = []
    mocks.ipc.invoke.mockImplementation(async (channel: string) => {
      if (channel === 'ensureMicrophonePermission' || channel === 'ensureAccessibilityPermission') {
        return true
      }
      return undefined
    })
    mocks.ipc.showTypelessChatResult.mockClear()
    mocks.ipc.hideTypelessChatResult.mockClear()

    window.electronAPI = {
      invoke: mocks.ipc.invoke,
      showTypelessChatResult: mocks.ipc.showTypelessChatResult,
      hideTypelessChatResult: mocks.ipc.hideTypelessChatResult,
      onTypelessChatResultClosed: (callback: (payload: { userMessageId: string }) => void) => {
        mocks.hotkeys.resultClosed = callback
        return () => {
          mocks.hotkeys.resultClosed = null
        }
      },
      onHotkeyDown: (callback: () => void) => {
        mocks.hotkeys.down = callback
        return () => {
          mocks.hotkeys.down = null
        }
      },
      onHotkeyUp: (callback: () => void) => {
        mocks.hotkeys.up = callback
        return () => {
          mocks.hotkeys.up = null
        }
      },
    } as unknown as typeof window.electronAPI
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('switches to the angrymiao session when typeless recording starts', async () => {
    const { result } = renderHook(() => useVoiceController(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.toggleVoice()
      await flushAsyncWork(20)
    })

    expect(vi.mocked(switchCurrentSession)).toHaveBeenCalledWith('session-1')
  })

  it('cancels the active typeless operation on short tap without starting a new recording', async () => {
    const { result } = renderHook(() => useVoiceController(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.startRecording()
    })

    expect(mocks.recorder.startCalls).toBe(1)

    await act(async () => {
      mocks.hotkeys.down?.()
      await flushAsyncWork()
      vi.advanceTimersByTime(50)
      mocks.hotkeys.up?.()
      vi.advanceTimersByTime(10)
      await flushAsyncWork()
    })

    expect(result.current.voiceMode).toBe('inactive')
    expect(mocks.recorder.startCalls).toBe(1)
    expect(mocks.recorder.stopCalls).toBe(1)
    expect(hasInvokeCall('typelessOverlay:hide')).toBe(true)
    expect(countInvokeCalls('typelessOverlay:hide')).toBeGreaterThanOrEqual(2)
  })

  it('cancels the current round before asr when the initial hotkey press is a short tap', async () => {
    const { result } = renderHook(() => useVoiceController(), { wrapper: createWrapper() })

    await act(async () => {
      mocks.hotkeys.down?.()
      await flushAsyncWork(20)
      vi.advanceTimersByTime(50)
      mocks.hotkeys.up?.()
      vi.advanceTimersByTime(10)
      await flushAsyncWork(20)
    })

    expect(result.current.voiceMode).toBe('inactive')
    expect(mocks.recorder.startCalls).toBe(1)
    expect(mocks.recorder.stopCalls).toBe(1)
    expect(mocks.recorder.transcribeCalls).toBe(0)
    expect(vi.mocked(submitNewUserMessage)).not.toHaveBeenCalled()
    expect(countInvokeCalls('typelessOverlay:hide')).toBeGreaterThanOrEqual(1)
  })

  it('cancels the active typeless operation on short tap during asr without starting a new recording', async () => {
    mocks.recorder.transcribeDelayMs = 200
    mocks.recorder.transcribeText = '取消这轮'
    const { result } = renderHook(() => useVoiceController(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.startRecording()
    })

    let stopPromise: Promise<unknown> | null = null
    await act(async () => {
      stopPromise = result.current.stopRecording()
      await flushAsyncWork()
    })

    expect(result.current.voiceMode).toBe('processing')

    await act(async () => {
      mocks.hotkeys.down?.()
      vi.advanceTimersByTime(50)
      mocks.hotkeys.up?.()
      await flushAsyncWork()
      vi.advanceTimersByTime(250)
      await flushAsyncWork()
      await stopPromise
    })

    expect(result.current.voiceMode).toBe('inactive')
    expect(mocks.recorder.startCalls).toBe(1)
    expect(vi.mocked(submitNewUserMessage)).not.toHaveBeenCalled()
    expect(hasInvokeCall('typelessOverlay:hide')).toBe(true)
    expect(countInvokeCalls('typelessOverlay:hide')).toBeGreaterThanOrEqual(2)
  })

  it('restarts a new typeless recording on long press while a previous operation is active', async () => {
    mocks.recorder.stopDelays = [100, 0]
    const { result } = renderHook(() => useVoiceController(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.startRecording()
    })

    await act(async () => {
      mocks.hotkeys.down?.()
      vi.advanceTimersByTime(190)
      await flushAsyncWork(20)
    })

    await act(async () => {
      await settleAsyncFlow({ advanceMs: 300, iterations: 40 })
    })

    expect(mocks.recorder.startCalls).toBe(2)
    await act(async () => {
      mocks.hotkeys.up?.()
      vi.advanceTimersByTime(50)
      await flushAsyncWork(20)
    })

    expect(mocks.recorder.startCalls).toBe(2)
    expect(mocks.recorder.stopCalls).toBeGreaterThanOrEqual(1)
  })

  it('suppresses the configured single-key hotkey default behavior in typeless mode', () => {
    renderHook(() => useVoiceController(), { wrapper: createWrapper() })

    const keydownEvent = new KeyboardEvent('keydown', {
      code: 'PageDown',
      key: 'PageDown',
      bubbles: true,
      cancelable: true,
    })
    const keyupEvent = new KeyboardEvent('keyup', {
      code: 'PageDown',
      key: 'PageDown',
      bubbles: true,
      cancelable: true,
    })

    const keydownResult = window.dispatchEvent(keydownEvent)
    const keyupResult = window.dispatchEvent(keyupEvent)

    expect(keydownResult).toBe(false)
    expect(keydownEvent.defaultPrevented).toBe(true)
    expect(keyupResult).toBe(false)
    expect(keyupEvent.defaultPrevented).toBe(true)
  })

  it('starts a new recording and hides the previous typeless result when the result is already visible', async () => {
    mocks.request.executionPhase = 'chat_result'
    const wrapper = createWrapper((store) => {
      store.set(typelessRequestAtom, mocks.request.context)
    })

    renderHook(() => useVoiceController(), { wrapper })

    await act(async () => {
      await flushAsyncWork()
    })

    expect(mocks.ipc.showTypelessChatResult).toHaveBeenCalledTimes(1)

    await act(async () => {
      mocks.hotkeys.down?.()
      await flushAsyncWork()
      vi.advanceTimersByTime(50)
      mocks.hotkeys.up?.()
      vi.advanceTimersByTime(10)
      await flushAsyncWork()
    })

    expect(mocks.recorder.startCalls).toBe(1)
    expect(mocks.ipc.showTypelessChatResult).toHaveBeenCalledTimes(1)
    expect(mocks.ipc.hideTypelessChatResult).toHaveBeenCalled()
  })

  it('keeps the overlay hidden once a finalized chat result is ready even if voiceMode is still processing', async () => {
    mocks.request.executionPhase = 'chat_result'
    const wrapper = createWrapper((store) => {
      store.set(typelessRequestAtom, {
        ...mocks.request.context,
        finalized: true,
      })
      store.set(voiceModeAtom, 'processing')
    })

    renderHook(() => useVoiceController(), { wrapper })

    await act(async () => {
      await flushAsyncWork(20)
    })

    expect(mocks.ipc.showTypelessChatResult).toHaveBeenCalledTimes(1)
    expect(
      getInvokeCalls('typelessOverlay:show').some(
        ([, payload]) => payload && typeof payload === 'object' && (payload as { mode?: string }).mode === 'processing'
      )
    ).toBe(false)
  })

  it('keeps the overlay hidden after the chat result window is shown even if status falls back to thinking', async () => {
    mocks.request.executionPhase = 'thinking'
    const wrapper = createWrapper((store) => {
      store.set(typelessRequestAtom, {
        ...mocks.request.context,
        finalized: true,
      })
      store.set(typelessChatResultAtom, {
        sessionId: mocks.request.context.sessionId,
        userMessageId: mocks.request.context.userMessageId,
        asrText: mocks.request.context.asrText,
        replyText: '已完成',
        shownAt: Date.now(),
      })
    })

    renderHook(() => useVoiceController(), { wrapper })

    await act(async () => {
      await flushAsyncWork(20)
    })

    expect(
      getInvokeCalls('typelessOverlay:show').some(
        ([, payload]) => payload && typeof payload === 'object' && (payload as { mode?: string }).mode === 'thinking'
      )
    ).toBe(false)
  })

  it('shows the chat result when execute generation settles even if the session snapshot has no assistant', async () => {
    mocks.voiceSettings.asrProvider = 'doubao'
    mocks.chat.session = {
      messages: [],
    }
    const { result } = renderHook(() => useVoiceController(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.startRecording()
    })

    let stopPromise: Promise<unknown> | null = null
    await act(async () => {
      stopPromise = result.current.stopRecording()
      await flushAsyncWork(20)
    })

    await act(async () => {
      mocks.doubao.onEvent?.({ type: 'completed', text: '你好' })
      await flushAsyncWork(20)
      await stopPromise
    })

    expect(mocks.live.onGenerationSettled).toBeTypeOf('function')

    await act(async () => {
      mocks.live.onGenerationSettled?.({
        context: {
          ...mocks.request.context,
          asrText: '你好',
          finalized: true,
        },
        assistantMessage: {
          id: 'assistant-final',
          role: 'assistant',
          generating: false,
          contentParts: [{ type: 'text', text: '直接结果' }],
        },
        toolExecutionMode: 'execute',
      })
      await flushAsyncWork(20)
    })

    expect(mocks.ipc.showTypelessChatResult).toHaveBeenCalledWith({
      userMessageId: mocks.request.context.userMessageId,
      asrText: '你好',
      replyText: '直接结果',
    })
    expect(
      getInvokeCalls('typelessOverlay:show').some(
        ([, payload]) => payload && typeof payload === 'object' && (payload as { mode?: string }).mode === 'thinking'
      )
    ).toBe(false)
  })

  it('defers doubao typeless processing until the final transcript is confirmed on stop', async () => {
    mocks.voiceSettings.asrProvider = 'doubao'
    const { store, wrapper } = createWrapperWithStore()
    const { result } = renderHook(() => useVoiceController(), { wrapper })
    let started = false

    await act(async () => {
      started = await result.current.startRecording()
    })

    expect(started).toBe(true)
    expect(mocks.doubao.createSessionCalls).toBe(1)
    expect(mocks.live.createCalls).toBe(1)
    expect(mocks.live.abortCalls).toBe(0)

    await act(async () => {
      mocks.recorder.audioChunkHandler?.(new Uint8Array([1, 2, 3, 4]))
      await flushAsyncWork(20)
      mocks.doubao.onEvent?.({ type: 'partial', text: '你' })
      await flushAsyncWork(20)
      mocks.doubao.onEvent?.({ type: 'final', text: '你' })
      await settleAsyncFlow({ iterations: 40 })
    })

    expect(store.get(streamingTextAtom)).toBe('你')
    expect(mocks.live.abortCalls).toBe(0)
    expect(mocks.live.enqueueCalls).toEqual([])

    let stopPromise: Promise<unknown> | null = null
    await act(async () => {
      stopPromise = result.current.stopRecording()
      await flushAsyncWork()
    })

    expect(mocks.doubao.commitCalls).toBe(1)

    await act(async () => {
      mocks.doubao.onEvent?.({ type: 'completed', text: '你好' })
      await flushAsyncWork(20)
      await stopPromise
    })

    expect(mocks.live.enqueueCalls).toEqual([
      {
        text: '你好',
        toolExecutionMode: 'execute',
      },
    ])
    expect(vi.mocked(startTypelessRequest)).not.toHaveBeenCalled()
  })

  it('keeps showing recognition until the final transcript is confirmed, then switches to thinking', async () => {
    mocks.voiceSettings.asrProvider = 'doubao'
    const { result } = renderHook(() => useVoiceController(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.startRecording()
    })

    let stopPromise: Promise<unknown> | null = null
    await act(async () => {
      stopPromise = result.current.stopRecording()
      await flushAsyncWork(20)
    })

    const processingOverlayShownBeforeCompleted = getInvokeCalls('typelessOverlay:show').some(
      ([, payload]) =>
        payload &&
        typeof payload === 'object' &&
        (payload as { mode?: string; text?: string }).mode === 'processing' &&
        (payload as { mode?: string; text?: string }).text === '正在识别...'
    )

    expect(processingOverlayShownBeforeCompleted).toBe(true)

    mocks.request.executionPhase = 'thinking'
    await act(async () => {
      mocks.doubao.onEvent?.({ type: 'completed', text: '你好' })
      await flushAsyncWork(20)
      await stopPromise
    })

    const thinkingOverlayShownAfterCompleted = getInvokeCalls('typelessOverlay:show').some(
      ([, payload]) =>
        payload &&
        typeof payload === 'object' &&
        (payload as { mode?: string; text?: string }).mode === 'thinking' &&
        (payload as { mode?: string; text?: string }).text === '正在思考...'
    )

    expect(thinkingOverlayShownAfterCompleted).toBe(true)
  })

  it('ignores stale doubao streaming events from a cancelled round after a new round starts', async () => {
    mocks.voiceSettings.asrProvider = 'doubao'
    const { result } = renderHook(() => useVoiceController(), { wrapper: createWrapper() })

    await act(async () => {
      await result.current.startRecording()
    })

    const firstOnEvent = mocks.doubao.onEvent
    expect(firstOnEvent).toBeTypeOf('function')

    let firstStopPromise: Promise<unknown> | null = null
    await act(async () => {
      firstStopPromise = result.current.stopRecording()
      await flushAsyncWork()
    })

    expect(mocks.doubao.commitCalls).toBe(1)

    await act(async () => {
      mocks.hotkeys.down?.()
      vi.advanceTimersByTime(50)
      mocks.hotkeys.up?.()
      await flushAsyncWork(40)
      await firstStopPromise
    })

    expect(result.current.voiceMode).toBe('inactive')
    expect(mocks.live.abortCalls).toBeGreaterThanOrEqual(1)

    await act(async () => {
      await result.current.startRecording()
    })

    const secondOnEvent = mocks.doubao.onEvent
    expect(secondOnEvent).toBeTypeOf('function')
    expect(secondOnEvent).not.toBe(firstOnEvent)

    await act(async () => {
      firstOnEvent?.({ type: 'final', text: '上一轮内容' })
      await flushAsyncWork(30)
    })

    expect(mocks.live.enqueueCalls).toEqual([])

    let secondStopPromise: Promise<unknown> | null = null
    await act(async () => {
      secondStopPromise = result.current.stopRecording()
      await flushAsyncWork()
    })

    expect(mocks.doubao.commitCalls).toBe(2)

    await act(async () => {
      firstOnEvent?.({ type: 'completed', text: '上一轮内容' })
      await flushAsyncWork(20)
      secondOnEvent?.({ type: 'completed', text: '第二轮内容' })
      await flushAsyncWork(20)
      await secondStopPromise
    })

    expect(mocks.live.enqueueCalls).toEqual([
      {
        text: '第二轮内容',
        toolExecutionMode: 'execute',
      },
    ])
    expect(vi.mocked(startTypelessRequest)).not.toHaveBeenCalled()
  })
})
