/**
 * @vitest-environment jsdom
 */
import { Provider, createStore } from 'jotai'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { typelessRequestAtom } from '@/stores/voiceStore'

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
  }

  const request = {
    executionPhase: null as 'chat_result' | null,
    context: {
      sessionId: 'session-1',
      userMessageId: 'user-1',
      asrText: '你好',
      startedAt: 1,
    },
  }

  const ipc = {
    invoke: vi.fn(),
    showTypelessChatResult: vi.fn(async () => undefined),
    hideTypelessChatResult: vi.fn(async () => undefined),
  }

  const chat = {
    session: null as { messages: unknown[] } | null,
  }

  class MockVoiceRecorder {
    private state: 'inactive' | 'recording' = 'inactive'

    static isSupported() {
      return true
    }

    async start() {
      recorder.startCalls += 1
      this.state = 'recording'
    }

    async stop() {
      const delayMs = recorder.stopDelays.shift() ?? 0
      await new Promise((resolve) => setTimeout(resolve, delayMs))
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

  class MockTTSProvider {
    async speak() {}
    stop() {}
  }

  return {
    chat,
    hotkeys,
    ipc,
    recorder,
    request,
    MockASRProvider,
    MockTTSProvider,
    MockVoiceRecorder,
  }
})

vi.mock('@/hooks/useVoiceSettings', () => ({
  useVoiceSettings: () => ({
    settings: {
      enabled: true,
      workMode: 'typeless',
      asrProvider: 'whisper-local',
      ttsProvider: 'browser',
      asrConfig: {},
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
    },
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
}))

vi.mock('@/packages/voice/tts', () => ({
  BrowserTTSProvider: mocks.MockTTSProvider,
  OpenAITTSProvider: mocks.MockTTSProvider,
  AzureTTSProvider: mocks.MockTTSProvider,
  ElevenLabsTTSProvider: mocks.MockTTSProvider,
}))

vi.mock('@/packages/voice/typeless-execution-state', () => ({
  deriveTypelessExecutionState: () => (mocks.request.executionPhase ? { phase: mocks.request.executionPhase } : null),
  findAssistantMessageForUser: () =>
    mocks.request.executionPhase
      ? {
          id: 'assistant-1',
          role: 'assistant',
          contentParts: [{ type: 'text', text: '已完成' }],
        }
      : null,
  mapTypelessExecutionStateToOverlay: (state: { phase: string } | null) =>
    state?.phase === 'chat_result' ? { visibility: 'hidden' } : null,
}))

vi.mock('@/packages/voice/typeless-request', () => ({
  startTypelessRequest: vi.fn(async () => ({
    context: mocks.request.context,
    submitPromise: Promise.resolve(),
  })),
}))

vi.mock('@/packages/voice/angrymiao-session', () => ({
  ensureAngrymiaoSession: vi.fn(async () => ({ id: 'session-1' })),
}))

vi.mock('@/stores/session/messages', () => ({
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

import { useVoiceController } from './useVoiceController'
import { submitNewUserMessage } from '@/stores/session/messages'

function createWrapper(initializer?: (store: ReturnType<typeof createStore>) => void) {
  const store = createStore()
  initializer?.(store)
  return ({ children }: { children: ReactNode }) => createElement(Provider, { store }, children)
}

function hasInvokeCall(channel: string) {
  return mocks.ipc.invoke.mock.calls.some(([currentChannel]) => currentChannel === channel)
}

function countInvokeCalls(channel: string) {
  return mocks.ipc.invoke.mock.calls.filter(([currentChannel]) => currentChannel === channel).length
}

async function flushAsyncWork(iterations = 5) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve()
  }
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
    mocks.request.executionPhase = null
    mocks.chat.session = null
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
      await flushAsyncWork()
    })

    expect(mocks.recorder.startCalls).toBe(2)
    await act(async () => {
      mocks.hotkeys.up?.()
      vi.advanceTimersByTime(50)
      await flushAsyncWork()
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
})
