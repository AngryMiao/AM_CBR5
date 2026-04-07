import { createMessage, type Message, type Settings } from '@shared/types'
import { getMessageText } from '@shared/utils/message'
import { normalizeRecordedVoiceHotkey, normalizeStoredVoiceHotkey } from '@shared/voice-hotkey'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useVoiceSettings } from '@/hooks/useVoiceSettings'
import { ANGRYMIAO_SKILL_BUNDLE_ID, ANGRYMIAO_SKILL_RUNTIME_ID } from '@/packages/agent-skills'
import { runCompactionWithUIState } from '@/packages/context-management'
import { mcpController } from '@/packages/mcp/controller'
import { getInstalledSkillBundle, resolveSkillBundleRuntimeServerConfig } from '@/packages/skill-bundles'
import { ensureAngrymiaoSession } from '@/packages/voice/angrymiao-session'
import type { ASRProvider, StreamingASRSession, StreamingASRSessionEvent } from '@/packages/voice/asr'
import {
  AliyunASRProvider,
  AzureASRProvider,
  DoubaoASRProvider,
  FunASRLocalProvider,
  GoogleASRProvider,
  isStreamingASRProvider,
  OpenAIASRProvider,
  WhisperLocalProvider,
} from '@/packages/voice/asr'
import { createLiveTypelessRequestController } from '@/packages/voice/live-typeless-request'
import { VoiceRecorder } from '@/packages/voice/recorder'
import type { TTSProvider } from '@/packages/voice/tts'
import { AzureTTSProvider, BrowserTTSProvider, ElevenLabsTTSProvider, OpenAITTSProvider } from '@/packages/voice/tts'
import {
  deriveTypelessExecutionState,
  findAssistantMessageForUser,
  mapTypelessExecutionStateToOverlay,
} from '@/packages/voice/typeless-execution-state'
import {
  isTypelessRequestFinalized,
  startTypelessRequest,
  type TypelessRequestContext,
} from '@/packages/voice/typeless-request'
import platform from '@/platform'
import * as chatStore from '@/stores/chatStore'
import { switchCurrentSession } from '@/stores/session/crud'
import { generate } from '@/stores/session/generation'
import { insertMessage, modifyMessage, removeMessage, submitNewUserMessage } from '@/stores/session/messages'
import {
  audioLevelAtom,
  closeTypelessChatResult,
  isRecordingAtom,
  isSpeakingAtom,
  speakingTextAtom,
  streamingTextAtom,
  type TypelessStatus,
  transcriptAtom,
  typelessChatResultAtom,
  typelessRequestAtom,
  typelessStatusAtom,
  voiceErrorAtom,
  voiceModeAtom,
  voicePanelVisibleAtom,
} from '@/stores/voiceStore'

type TypelessOperationPhase = 'idle' | 'recording' | 'asr' | 'llm' | 'mcp' | 'result'

const HOTKEY_RESTART_THRESHOLD_MS = 180
const ENABLE_STREAMING_TYPELESS_PREVIEW = false

type PendingStreamingRecognition = {
  promise: Promise<string>
  reject: (error: Error) => void
  resolve: (text: string) => void
}

type SettledTypelessAssistantSnapshot = {
  userMessageId: string
  assistantMessage: Message
}

function createPendingStreamingRecognition(): PendingStreamingRecognition {
  let settled = false
  let resolvePromise!: (text: string) => void
  let rejectPromise!: (error: Error) => void
  const promise = new Promise<string>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  return {
    promise,
    resolve: (text: string) => {
      if (settled) {
        return
      }
      settled = true
      resolvePromise(text)
    },
    reject: (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      rejectPromise(error)
    },
  }
}

async function ensureAngrymiaoSkillRuntime(settings?: Partial<Settings>): Promise<void> {
  if (platform.type !== 'desktop') return
  const bundle = await getInstalledSkillBundle(ANGRYMIAO_SKILL_BUNDLE_ID)
  if (!bundle) return

  try {
    const runtimeConfig = await resolveSkillBundleRuntimeServerConfig(bundle.id, ANGRYMIAO_SKILL_RUNTIME_ID, settings)
    if (!runtimeConfig) {
      await mcpController.stopServer('angrymiao-system-control')
      return
    }
    await mcpController.updateServer({
      ...runtimeConfig,
      scope: 'skill-bundle',
      skillBundleId: bundle.id,
    })
    console.info('Angrymiao skill runtime started for voice control')
  } catch (err) {
    console.error('Failed to start Angrymiao skill runtime:', err)
  }
}

function isSameTypelessStatus(left: TypelessStatus | null, right: TypelessStatus | null) {
  if (!left && !right) {
    return true
  }
  if (!left || !right) {
    return false
  }
  return left.type === right.type && left.message === right.message
}

function matchesSingleVoiceHotkeyKeyboardEvent(event: KeyboardEvent, hotkey?: string): boolean {
  if (!hotkey) {
    return false
  }

  const normalizedHotkey = normalizeStoredVoiceHotkey(hotkey)
  if (normalizedHotkey.includes('+')) {
    return false
  }

  const normalizedEventHotkey = normalizeRecordedVoiceHotkey([event.code])
  return normalizedEventHotkey !== '' && normalizedEventHotkey === normalizedHotkey
}

/**
 * 语音控制器 Hook
 * 管理语音录制、识别、合成的完整流程
 */
export function useVoiceController() {
  const [voiceMode, setVoiceMode] = useAtom(voiceModeAtom)
  const [isRecording, setIsRecording] = useAtom(isRecordingAtom)
  const [isSpeaking, setIsSpeaking] = useAtom(isSpeakingAtom)
  const setTranscript = useSetAtom(transcriptAtom)
  const setSpeakingText = useSetAtom(speakingTextAtom)
  const setAudioLevel = useSetAtom(audioLevelAtom)
  const setError = useSetAtom(voiceErrorAtom)
  const setPanelVisible = useSetAtom(voicePanelVisibleAtom)
  const setTypelessStatus = useSetAtom(typelessStatusAtom)
  const typelessStatus = useAtomValue(typelessStatusAtom)
  const setTypelessRequest = useSetAtom(typelessRequestAtom)
  const typelessRequest = useAtomValue(typelessRequestAtom)
  const setTypelessChatResult = useSetAtom(typelessChatResultAtom)
  const typelessChatResult = useAtomValue(typelessChatResultAtom)
  const closeTypelessChatResultState = useSetAtom(closeTypelessChatResult)
  const setStreamingText = useSetAtom(streamingTextAtom)
  const streamingText = useAtomValue(streamingTextAtom)
  const [settledTypelessAssistantSnapshot, setSettledTypelessAssistantSnapshot] =
    useState<SettledTypelessAssistantSnapshot | null>(null)
  const { settings } = useVoiceSettings()
  const { session: typelessSession } = chatStore.useSession(typelessRequest?.sessionId ?? null)

  const recorderRef = useRef<VoiceRecorder | null>(null)
  const asrProviderRef = useRef<ASRProvider | null>(null)
  const streamingASRSessionRef = useRef<StreamingASRSession | null>(null)
  const pendingStreamingRecognitionRef = useRef<PendingStreamingRecognition | null>(null)
  const latestStreamingTranscriptRef = useRef('')
  const liveTypelessControllerRef = useRef<ReturnType<typeof createLiveTypelessRequestController> | null>(null)
  const ttsProviderRef = useRef<TTSProvider | null>(null)
  const isSpeakingRef = useRef(false)
  const voiceModeRef = useRef(voiceMode)
  const holdShortcutActiveRef = useRef(false)
  const holdActivationPendingRef = useRef(false)
  const pendingHotkeyReleaseRef = useRef(false)
  const pendingHotkeyReleaseShouldCancelRef = useRef(false)
  const activationHotkeyPressStartedAtRef = useRef<number | null>(null)
  const interruptedHotkeyPressStartedAtRef = useRef<number | null>(null)
  const interruptedHotkeyPendingRef = useRef(false)
  const interruptedHotkeyRestartRequestedRef = useRef(false)
  const interruptedHotkeyRestartTriggeredRef = useRef(false)
  const interruptedHotkeyRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activationHotkeyStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentTypelessRequestRef = useRef(typelessRequest)
  const typelessOperationIdRef = useRef(0)
  const typelessOperationPhaseRef = useRef<TypelessOperationPhase>('idle')
  const completedTypelessOperationIdRef = useRef<number | null>(null)

  const sessionTrackedAssistantMessage = typelessRequest
    ? typelessRequest.assistantMessageId
      ? ((typelessSession?.messages ?? []).find(
          (message) => message.id === typelessRequest.assistantMessageId && message.role === 'assistant'
        ) ?? findAssistantMessageForUser(typelessSession?.messages ?? [], typelessRequest.userMessageId))
      : findAssistantMessageForUser(typelessSession?.messages ?? [], typelessRequest.userMessageId)
    : null
  const trackedAssistantMessage =
    typelessRequest &&
    settledTypelessAssistantSnapshot?.userMessageId === typelessRequest.userMessageId &&
    settledTypelessAssistantSnapshot.assistantMessage.role === 'assistant'
      ? settledTypelessAssistantSnapshot.assistantMessage
      : sessionTrackedAssistantMessage
  const typelessExecutionState = typelessRequest
    ? deriveTypelessExecutionState({ assistantMessage: trackedAssistantMessage })
    : null
  const typelessOverlayState = typelessExecutionState
    ? mapTypelessExecutionStateToOverlay(typelessExecutionState)
    : null
  const isTrackedTypelessRequestFinalized = isTypelessRequestFinalized(typelessRequest)
  const trackedAssistantReplyText = trackedAssistantMessage ? getMessageText(trackedAssistantMessage).trim() : ''
  const isTypelessChatResultReady =
    !!typelessRequest &&
    isTrackedTypelessRequestFinalized &&
    typelessExecutionState?.phase === 'chat_result' &&
    !!trackedAssistantReplyText
  const derivedTypelessStatus =
    typelessOverlayState?.visibility === 'visible'
      ? {
          type: typelessOverlayState.type,
          message: typelessOverlayState.message,
        }
      : null
  const normalizedDerivedTypelessStatus =
    !isTrackedTypelessRequestFinalized && derivedTypelessStatus?.type === 'success' ? null : derivedTypelessStatus
  const activeTypelessStatus = typelessRequest ? normalizedDerivedTypelessStatus : typelessStatus
  const activeTypelessStatusType = activeTypelessStatus?.type ?? null
  const activeTypelessStatusMessage = activeTypelessStatus?.message ?? null

  const clearRecordingTimeout = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
      recordingTimeoutRef.current = null
    }
  }, [])

  const clearInterruptedHotkeyRestartTimer = useCallback(() => {
    if (interruptedHotkeyRestartTimerRef.current) {
      clearTimeout(interruptedHotkeyRestartTimerRef.current)
      interruptedHotkeyRestartTimerRef.current = null
    }
  }, [])

  const clearActivationHotkeyStartTimer = useCallback(() => {
    if (activationHotkeyStartTimerRef.current) {
      clearTimeout(activationHotkeyStartTimerRef.current)
      activationHotkeyStartTimerRef.current = null
    }
  }, [])

  const rejectPendingStreamingRecognition = useCallback((message: string) => {
    const pendingRecognition = pendingStreamingRecognitionRef.current
    if (!pendingRecognition) {
      return
    }

    pendingStreamingRecognitionRef.current = null
    void pendingRecognition.promise.catch(() => undefined)
    pendingRecognition.reject(new Error(message))
  }, [])

  const abortLiveTypelessController = useCallback(async () => {
    const controller = liveTypelessControllerRef.current
    liveTypelessControllerRef.current = null
    if (!controller) {
      return
    }

    try {
      await controller.abort()
    } catch (error) {
      console.error('Failed to abort live typeless controller:', error)
    }
  }, [])

  const closeStreamingASRSession = useCallback(async () => {
    const session = streamingASRSessionRef.current
    streamingASRSessionRef.current = null
    if (!session) {
      return
    }

    try {
      await session.close()
    } catch (error) {
      console.error('Failed to close streaming ASR session:', error)
    }
  }, [])

  const handleStreamingASREvent = useCallback(
    (event: StreamingASRSessionEvent, operationId: number) => {
      if (typelessOperationIdRef.current !== operationId) {
        return
      }

      if (event.type === 'error') {
        const message = event.message || '实时语音识别失败'
        setError(message)
        rejectPendingStreamingRecognition(message)
        return
      }

      const text = (event.text ?? '').trim()
      if (text) {
        latestStreamingTranscriptRef.current = text
        setStreamingText(text)
      }

      if (ENABLE_STREAMING_TYPELESS_PREVIEW && text && event.type === 'final') {
        void liveTypelessControllerRef.current
          ?.enqueueTranscript(text, {
            toolExecutionMode: 'preview',
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            setError(message)
            setTypelessStatus({ type: 'error', message })
          })
      }

      if (event.type === 'completed') {
        const finalText = text || latestStreamingTranscriptRef.current.trim()
        const pendingRecognition = pendingStreamingRecognitionRef.current
        pendingStreamingRecognitionRef.current = null
        pendingRecognition?.resolve(finalText)
      }
    },
    [rejectPendingStreamingRecognition, setError, setStreamingText, setTypelessStatus]
  )

  const clearTypelessResultForNextRound = useCallback(() => {
    if (settings.workMode !== 'typeless') {
      return
    }

    void window.electronAPI?.hideTypelessChatResult?.()
    setSettledTypelessAssistantSnapshot(null)
    setTypelessChatResult(null)
    setTypelessRequest(null)
    setTypelessStatus(null)
  }, [settings.workMode, setTypelessChatResult, setTypelessRequest, setTypelessStatus])

  const rememberSettledTypelessAssistant = useCallback(
    (context: TypelessRequestContext | null | undefined, assistantMessage: Message | null | undefined) => {
      if (!context || context.finalized === false || !assistantMessage || assistantMessage.role !== 'assistant') {
        return
      }

      setSettledTypelessAssistantSnapshot({
        userMessageId: context.userMessageId,
        assistantMessage,
      })
    },
    []
  )

  const isCurrentTypelessOperation = useCallback((operationId: number) => {
    return typelessOperationIdRef.current === operationId
  }, [])

  const setTypelessOperationPhase = useCallback(
    (phase: TypelessOperationPhase, operationId: number = typelessOperationIdRef.current) => {
      if (typelessOperationIdRef.current !== operationId) {
        return false
      }

      typelessOperationPhaseRef.current = phase
      if (phase === 'result') {
        completedTypelessOperationIdRef.current = operationId
      }
      return true
    },
    []
  )

  const beginTypelessOperation = useCallback((phase: Exclude<TypelessOperationPhase, 'idle'>) => {
    const nextOperationId = typelessOperationIdRef.current + 1
    typelessOperationIdRef.current = nextOperationId
    typelessOperationPhaseRef.current = phase
    completedTypelessOperationIdRef.current = phase === 'result' ? nextOperationId : null
    return nextOperationId
  }, [])

  const clearTypelessOperation = useCallback((operationId?: number) => {
    if (operationId !== undefined && typelessOperationIdRef.current !== operationId) {
      return false
    }

    typelessOperationIdRef.current += 1
    typelessOperationPhaseRef.current = 'idle'
    completedTypelessOperationIdRef.current = null
    return true
  }, [])

  const isTypelessCancelablePhase = useCallback((phase: TypelessOperationPhase = typelessOperationPhaseRef.current) => {
    return phase === 'recording' || phase === 'asr' || phase === 'llm' || phase === 'mcp'
  }, [])

  const isTypelessResultPhase = useCallback((phase: TypelessOperationPhase = typelessOperationPhaseRef.current) => {
    return phase === 'result'
  }, [])

  const isTypelessInterruptibleState = useCallback(() => {
    if (isTypelessCancelablePhase()) {
      return true
    }

    return voiceModeRef.current === 'processing' && !isTypelessResultPhase()
  }, [isTypelessCancelablePhase, isTypelessResultPhase])

  useEffect(() => {
    voiceModeRef.current = voiceMode
  }, [voiceMode])

  useEffect(() => {
    currentTypelessRequestRef.current = typelessRequest
  }, [typelessRequest])

  useEffect(() => {
    asrProviderRef.current = null
  }, [settings.asrProvider, settings.asrConfig])

  useEffect(() => {
    ttsProviderRef.current = null
  }, [settings.ttsProvider, settings.ttsConfig])

  useEffect(() => {
    if (platform.type !== 'desktop' || settings.workMode !== 'typeless') {
      return
    }

    return window.electronAPI?.onTypelessChatResultClosed?.((payload) => {
      closeTypelessChatResultState(payload)
      setSettledTypelessAssistantSnapshot(null)
      setTypelessStatus(null)
      const completedOperationId = completedTypelessOperationIdRef.current
      if (completedOperationId !== null) {
        clearTypelessOperation(completedOperationId)
      }
    })
  }, [settings.workMode, clearTypelessOperation, closeTypelessChatResultState, setTypelessStatus])

  useEffect(() => {
    if (settings.workMode !== 'typeless' || !typelessRequest) {
      return
    }

    switch (typelessExecutionState?.phase) {
      case 'thinking':
        setTypelessOperationPhase('llm')
        return
      case 'executing':
      case 'inserting':
        setTypelessOperationPhase('mcp')
        return
      case 'success':
      case 'chat_result':
        if (!isTrackedTypelessRequestFinalized) {
          return
        }
        setTypelessOperationPhase('result')
        return
      case 'error':
        setTypelessOperationPhase('result')
        return
      default:
        return
    }
  }, [
    settings.workMode,
    typelessRequest,
    typelessExecutionState?.phase,
    setTypelessOperationPhase,
    isTrackedTypelessRequestFinalized,
  ])

  useEffect(() => {
    if (platform.type !== 'desktop' || settings.workMode !== 'typeless') {
      return
    }

    if (
      !typelessRequest ||
      !isTrackedTypelessRequestFinalized ||
      !trackedAssistantMessage ||
      typelessExecutionState?.phase !== 'chat_result'
    ) {
      return
    }

    const replyText = trackedAssistantReplyText
    if (!replyText || typelessChatResult?.userMessageId === typelessRequest.userMessageId) {
      return
    }

    const payload = {
      userMessageId: typelessRequest.userMessageId,
      asrText: typelessRequest.asrText,
      replyText,
    }

    // 纯聊天结果改由主进程全局窗口展示，先关闭底部状态条，再同步 renderer 状态与主进程窗口。
    void window.electronAPI?.invoke('typelessOverlay:hide')
    setTypelessChatResult({
      sessionId: typelessRequest.sessionId,
      userMessageId: typelessRequest.userMessageId,
      asrText: typelessRequest.asrText,
      replyText,
      shownAt: Date.now(),
    })
    setTypelessStatus(null)
    void window.electronAPI?.showTypelessChatResult?.(payload)
  }, [
    settings.workMode,
    isTrackedTypelessRequestFinalized,
    trackedAssistantMessage,
    typelessExecutionState?.phase,
    typelessChatResult?.userMessageId,
    typelessRequest,
    setTypelessChatResult,
    setTypelessStatus,
  ])

  useEffect(() => {
    if (platform.type !== 'desktop' || settings.workMode !== 'typeless') {
      return
    }

    return () => {
      void window.electronAPI?.hideTypelessChatResult?.()
      closeTypelessChatResultState()
      setSettledTypelessAssistantSnapshot(null)
      setTypelessStatus(null)
    }
  }, [settings.workMode, closeTypelessChatResultState, setTypelessStatus])

  useEffect(() => {
    if (settings.workMode !== 'typeless' || !typelessRequest) {
      return
    }

    if (!isSameTypelessStatus(typelessStatus, normalizedDerivedTypelessStatus)) {
      setTypelessStatus(normalizedDerivedTypelessStatus)
    }
  }, [settings.workMode, typelessRequest, typelessStatus, normalizedDerivedTypelessStatus, setTypelessStatus])

  useEffect(() => {
    if (platform.type !== 'desktop') {
      return
    }

    if (settings.workMode !== 'typeless') {
      void window.electronAPI?.invoke('typelessOverlay:hide')
      return
    }

    const shouldHideForVisibleResult =
      !!typelessChatResult?.userMessageId &&
      !!typelessRequest?.userMessageId &&
      typelessChatResult.userMessageId === typelessRequest.userMessageId

    if (isTypelessChatResultReady || shouldHideForVisibleResult) {
      void window.electronAPI?.invoke('typelessOverlay:hide')
      return
    }

    if (activeTypelessStatus) {
      void window.electronAPI?.invoke('typelessOverlay:show', {
        mode: activeTypelessStatus.type,
        text: activeTypelessStatus.message,
      })

      if (activeTypelessStatus.type === 'success' || activeTypelessStatus.type === 'error') {
        const trackedUserMessageId = typelessRequest?.userMessageId
        const completedOperationId = completedTypelessOperationIdRef.current
        const timer = setTimeout(() => {
          void window.electronAPI?.invoke('typelessOverlay:hide')
          setTypelessStatus(null)
          if (trackedUserMessageId && currentTypelessRequestRef.current?.userMessageId === trackedUserMessageId) {
            setTypelessRequest(null)
          }
          if (completedOperationId !== null) {
            clearTypelessOperation(completedOperationId)
          }
        }, 900)
        return () => clearTimeout(timer)
      }
      return
    }

    if (voiceMode === 'listening' && isRecording) {
      void window.electronAPI?.invoke('typelessOverlay:show', {
        mode: 'listening',
        text: streamingText?.trim() || '正在识别...',
      })
      return
    }

    if (voiceMode === 'listening' && !isRecording) {
      void window.electronAPI?.invoke('typelessOverlay:show', {
        mode: 'listening',
        text: '正在启动识别...',
      })
      return
    }

    if (voiceMode === 'processing') {
      const processingText =
        settings.workMode === 'typeless' && typelessOperationPhaseRef.current === 'asr' ? '正在识别...' : '正在思考...'
      void window.electronAPI?.invoke('typelessOverlay:show', {
        mode: 'processing',
        text: settings.workMode === 'typeless' ? processingText : '正在识别...',
      })
      return
    }

    if (voiceMode === 'inactive') {
      if (holdShortcutActiveRef.current || holdActivationPendingRef.current) {
        return
      }
      void window.electronAPI?.invoke('typelessOverlay:hide')
    }
  }, [
    settings.workMode,
    activeTypelessStatusType,
    activeTypelessStatusMessage,
    voiceMode,
    isRecording,
    streamingText,
    typelessRequest?.userMessageId,
    typelessChatResult?.userMessageId,
    isTypelessChatResultReady,
    clearTypelessOperation,
    setTypelessRequest,
    setTypelessStatus,
  ])

  useEffect(() => {
    if (platform.type !== 'desktop' || !settings.enabled || settings.workMode !== 'typeless') {
      return
    }

    const handleKeyboardEvent = (event: KeyboardEvent) => {
      if (!matchesSingleVoiceHotkeyKeyboardEvent(event, settings.shortcuts?.toggleVoice)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('keydown', handleKeyboardEvent, true)
    window.addEventListener('keyup', handleKeyboardEvent, true)
    return () => {
      window.removeEventListener('keydown', handleKeyboardEvent, true)
      window.removeEventListener('keyup', handleKeyboardEvent, true)
    }
  }, [settings.enabled, settings.shortcuts?.toggleVoice, settings.workMode])

  // 初始化 ASR 提供商
  const getASRProvider = useCallback((): ASRProvider => {
    if (asrProviderRef.current) {
      return asrProviderRef.current
    }

    switch (settings.asrProvider) {
      case 'whisper-local':
        asrProviderRef.current = new WhisperLocalProvider(
          settings.asrConfig.whisperLocal?.modelSize || 'base',
          settings.asrConfig.whisperLocal?.remoteHost,
          settings.asrConfig.whisperLocal?.localModelPath
        )
        break
      case 'funasr-local':
        asrProviderRef.current = new FunASRLocalProvider(settings.asrConfig.funasrLocal)
        break
      case 'openai':
        if (!settings.asrConfig.openai?.apiKey) {
          throw new Error('OpenAI API Key 未配置')
        }
        asrProviderRef.current = new OpenAIASRProvider(settings.asrConfig.openai)
        break
      case 'aliyun':
        if (!settings.asrConfig.aliyun?.apiKey) {
          throw new Error('阿里云 API Key 未配置')
        }
        asrProviderRef.current = new AliyunASRProvider(settings.asrConfig.aliyun)
        break
      case 'azure':
        if (!settings.asrConfig.azure) {
          throw new Error('Azure 配置不完整')
        }
        asrProviderRef.current = new AzureASRProvider(settings.asrConfig.azure)
        break
      case 'google':
        if (!settings.asrConfig.google?.apiKey) {
          throw new Error('Google API Key 未配置')
        }
        asrProviderRef.current = new GoogleASRProvider(settings.asrConfig.google)
        break
      case 'doubao':
        if (
          !(
            settings.asrConfig.doubao?.appId &&
            (settings.asrConfig.doubao?.accessKey || settings.asrConfig.doubao?.apiKey)
          )
        ) {
          throw new Error('豆包 App Key / Access Key 未配置')
        }
        asrProviderRef.current = new DoubaoASRProvider(settings.asrConfig.doubao)
        break
      default:
        throw new Error(`未知的 ASR 提供商: ${settings.asrProvider}`)
    }

    return asrProviderRef.current
  }, [settings.asrProvider, settings.asrConfig])

  // 初始化 TTS 提供商
  const getTTSProvider = useCallback((): TTSProvider => {
    if (ttsProviderRef.current) {
      return ttsProviderRef.current
    }

    switch (settings.ttsProvider) {
      case 'browser':
        ttsProviderRef.current = new BrowserTTSProvider(settings.ttsConfig.browser)
        break
      case 'openai':
        if (!settings.ttsConfig.openai?.apiKey) {
          throw new Error('OpenAI API Key 未配置')
        }
        ttsProviderRef.current = new OpenAITTSProvider(settings.ttsConfig.openai)
        break
      case 'azure':
        if (!settings.ttsConfig.azure) {
          throw new Error('Azure 配置不完整')
        }
        ttsProviderRef.current = new AzureTTSProvider(settings.ttsConfig.azure)
        break
      case 'elevenlabs':
        if (!settings.ttsConfig.elevenlabs) {
          throw new Error('ElevenLabs 配置不完整')
        }
        ttsProviderRef.current = new ElevenLabsTTSProvider(settings.ttsConfig.elevenlabs)
        break
      default:
        throw new Error(`未知的 TTS 提供商: ${settings.ttsProvider}`)
    }

    return ttsProviderRef.current
  }, [settings.ttsProvider, settings.ttsConfig])

  const streamingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startStreamingRecognition = useCallback(
    (recorder: VoiceRecorder) => {
      if (streamingIntervalRef.current) {
        clearInterval(streamingIntervalRef.current)
      }

      streamingIntervalRef.current = setInterval(async () => {
        if (!recorderRef.current || recorderRef.current.getState() !== 'recording') {
          return
        }

        const audioBlob = recorder.getCurrentAudioBlob()
        if (!audioBlob || audioBlob.size < 1000) {
          return
        }

        try {
          const asrProvider = getASRProvider()
          const text = await asrProvider.transcribe(audioBlob)
          if (text && text.trim()) {
            setStreamingText(text.trim())
          }
        } catch (err) {
          // 静默处理流式识别错误，不影响主流程
        }
      }, 1500)
    },
    [getASRProvider, setStreamingText]
  )

  const stopStreamingRecognition = useCallback(() => {
    if (streamingIntervalRef.current) {
      clearInterval(streamingIntervalRef.current)
      streamingIntervalRef.current = null
    }
  }, [])

  const cancelCurrentOperation = useCallback(async () => {
    if (settings.workMode !== 'typeless' || !isTypelessInterruptibleState()) {
      return false
    }

    clearRecordingTimeout()
    stopStreamingRecognition()
    clearInterruptedHotkeyRestartTimer()
    clearTypelessOperation()
    rejectPendingStreamingRecognition('录音已取消')
    await abortLiveTypelessController()

    pendingHotkeyReleaseRef.current = false
    setIsRecording(false)
    setVoiceMode('inactive')
    setPanelVisible(false)
    setStreamingText('')
    latestStreamingTranscriptRef.current = ''
    setTranscript('')
    setSettledTypelessAssistantSnapshot(null)
    setTypelessStatus(null)
    setTypelessRequest(null)
    setTypelessChatResult(null)
    void window.electronAPI?.invoke('typelessOverlay:hide')
    void window.electronAPI?.hideTypelessChatResult?.()

    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.getState() !== 'inactive') {
      try {
        await recorder.stop()
      } catch (error) {
        console.error('Failed to stop recorder while cancelling typeless operation:', error)
      }
    }

    await closeStreamingASRSession()

    return true
  }, [
    settings.workMode,
    isTypelessInterruptibleState,
    clearRecordingTimeout,
    stopStreamingRecognition,
    clearInterruptedHotkeyRestartTimer,
    clearTypelessOperation,
    abortLiveTypelessController,
    closeStreamingASRSession,
    rejectPendingStreamingRecognition,
    setIsRecording,
    setVoiceMode,
    setPanelVisible,
    setStreamingText,
    setTranscript,
    setSettledTypelessAssistantSnapshot,
    setTypelessStatus,
    setTypelessRequest,
    setTypelessChatResult,
  ])

  // 开始录音
  const startRecording = useCallback(async (): Promise<boolean> => {
    let operationId: number | null = null
    try {
      clearRecordingTimeout()
      setError(null)

      clearTypelessResultForNextRound()
      await abortLiveTypelessController()

      if (!VoiceRecorder.isSupported()) {
        throw new Error('当前环境不支持麦克风录音')
      }

      if (platform.type === 'desktop') {
        const granted = await window.electronAPI?.invoke('ensureMicrophonePermission')
        if (granted === false) {
          throw new Error('麦克风权限未授权，请在系统设置中允许后重试')
        }
      }

      if (settings.workMode === 'typeless') {
        operationId = beginTypelessOperation('recording')
      }

      setVoiceMode('listening')
      setPanelVisible(true)
      setStreamingText('')
      latestStreamingTranscriptRef.current = ''

      const recorder = new VoiceRecorder()
      recorderRef.current = recorder
      const shouldUseDoubaoStreaming = settings.workMode === 'typeless' && settings.asrProvider === 'doubao'
      if (shouldUseDoubaoStreaming) {
        const asrProvider = getASRProvider()
        if (!isStreamingASRProvider(asrProvider)) {
          throw new Error('当前 ASR 提供商不支持流式识别')
        }

        rejectPendingStreamingRecognition('新的实时识别会话已开始')
        pendingStreamingRecognitionRef.current = createPendingStreamingRecognition()
        streamingASRSessionRef.current = await asrProvider.createStreamingSession({
          onEvent: (event) => handleStreamingASREvent(event, operationId),
        })
        const controller = createLiveTypelessRequestController({
          ensureSession: ensureAngrymiaoSession,
          prepareSession: async (sessionId) => {
            const compactionResult = await runCompactionWithUIState(sessionId)
            if (!compactionResult.success) {
              throw compactionResult.error ?? new Error('Compaction failed')
            }
          },
          getSession: chatStore.getSession,
          insertMessage,
          updateMessage: async (sessionId, message) => {
            await modifyMessage(sessionId, message, true)
          },
          removeMessage,
          generate,
          onContextChange: (context) => {
            if (liveTypelessControllerRef.current !== controller) {
              return
            }
            setTypelessRequest(context)
          },
          onGenerationSettled: ({ context, assistantMessage, toolExecutionMode }) => {
            if (liveTypelessControllerRef.current !== controller || toolExecutionMode !== 'execute') {
              return
            }

            rememberSettledTypelessAssistant(context, assistantMessage)
          },
        })
        liveTypelessControllerRef.current = controller
      }

      console.info('[VoiceController] Starting recording with microphone preference', {
        microphoneDeviceId: settings.microphoneDeviceId ?? 'system-default',
        workMode: settings.workMode,
        asrProvider: settings.asrProvider,
      })

      await recorder.start({
        onAudioLevelChange: (level) => setAudioLevel(level),
        onSilenceDetected: settings.autoStopRecording
          ? () => {
              stopRecording()
            }
          : undefined,
        silenceThreshold: settings.silenceThreshold,
        silenceDuration: settings.silenceDuration,
        microphoneDeviceId: settings.microphoneDeviceId,
        onAudioChunk: shouldUseDoubaoStreaming
          ? (chunk) => {
              void streamingASRSessionRef.current?.appendAudio(chunk).catch((error) => {
                const message = error instanceof Error ? error.message : String(error)
                setError(message)
                rejectPendingStreamingRecognition(message)
              })
            }
          : undefined,
      })

      if (operationId !== null && !isCurrentTypelessOperation(operationId)) {
        try {
          await recorder.stop()
        } catch (error) {
          console.error('Failed to stop stale recorder after typeless restart:', error)
        }
        await closeStreamingASRSession()
        return false
      }

      // Typeless 模式下启动流式识别
      if (settings.workMode === 'typeless' && !shouldUseDoubaoStreaming) {
        startStreamingRecognition(recorder)
      }

      setIsRecording(true)

      // 自动停止录音（最大时长）
      recordingTimeoutRef.current = setTimeout(() => {
        if (recorderRef.current) {
          stopRecording()
        }
      }, settings.maxRecordingDuration)

      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (operationId !== null) {
        clearTypelessOperation(operationId)
      }
      rejectPendingStreamingRecognition(message)
      await abortLiveTypelessController()
      await closeStreamingASRSession()
      recorderRef.current = null
      setError(message)
      setVoiceMode('inactive')
      setPanelVisible(false)
      setIsRecording(false)
      if (settings.workMode === 'typeless') {
        setTypelessStatus({ type: 'error', message: `录音启动失败：${message}` })
      }
      return false
    }
  }, [
    settings.autoStopRecording,
    settings.silenceThreshold,
    settings.silenceDuration,
    settings.maxRecordingDuration,
    settings.asrProvider,
    settings.microphoneDeviceId,
    settings.workMode,
    setError,
    setVoiceMode,
    setPanelVisible,
    setIsRecording,
    setAudioLevel,
    setStreamingText,
    setTypelessStatus,
    setTypelessChatResult,
    setTypelessRequest,
    clearRecordingTimeout,
    closeStreamingASRSession,
    beginTypelessOperation,
    abortLiveTypelessController,
    clearTypelessOperation,
    clearTypelessResultForNextRound,
    getASRProvider,
    handleStreamingASREvent,
    isCurrentTypelessOperation,
    rejectPendingStreamingRecognition,
    startStreamingRecognition,
  ])

  // 停止录音并识别
  const stopRecording = useCallback(async () => {
    if (!recorderRef.current) return
    const recorder = recorderRef.current
    recorderRef.current = null
    const operationId = settings.workMode === 'typeless' ? typelessOperationIdRef.current : null

    try {
      clearRecordingTimeout()
      stopStreamingRecognition()
      setIsRecording(false)
      setVoiceMode('processing')
      if (operationId !== null) {
        setTypelessOperationPhase('asr', operationId)
      }

      const asrProvider = getASRProvider()
      const shouldUseDoubaoStreaming =
        settings.workMode === 'typeless' && settings.asrProvider === 'doubao' && isStreamingASRProvider(asrProvider)

      let text = ''
      if (shouldUseDoubaoStreaming) {
        await recorder.stop()
        if (operationId !== null && !isCurrentTypelessOperation(operationId)) {
          await closeStreamingASRSession()
          return null
        }

        const pendingRecognition = pendingStreamingRecognitionRef.current
        const streamingSession = streamingASRSessionRef.current
        if (!pendingRecognition || !streamingSession) {
          throw new Error('豆包实时识别会话未初始化')
        }

        await streamingSession.commit()
        text = (await pendingRecognition.promise).trim()
        if (text) {
          await liveTypelessControllerRef.current?.enqueueTranscript(text, {
            toolExecutionMode: 'execute',
          })
        }
        await closeStreamingASRSession()
      } else {
        const audioBlob = await recorder.stop()
        if (operationId !== null && !isCurrentTypelessOperation(operationId)) {
          return null
        }

        text = await asrProvider.transcribe(audioBlob)
        if (operationId !== null && !isCurrentTypelessOperation(operationId)) {
          return null
        }
      }

      setTranscript(text)
      setStreamingText('')
      latestStreamingTranscriptRef.current = ''

      // 根据工作模式决定输出目标
      if (text) {
        if (settings.workMode === 'typeless') {
          try {
            if (operationId !== null) {
              setTypelessOperationPhase('llm', operationId)
            }
            if (shouldUseDoubaoStreaming) {
              if (operationId !== null && !isCurrentTypelessOperation(operationId)) {
                return text
              }
            } else {
              const { context, submitPromise } = await startTypelessRequest({
                text,
                ensureSession: ensureAngrymiaoSession,
                submit: submitNewUserMessage,
              })
              if (operationId !== null && !isCurrentTypelessOperation(operationId)) {
                return text
              }
              setTypelessRequest(context)
              void submitPromise
                .then((assistantMessage) => {
                  if (operationId !== null && !isCurrentTypelessOperation(operationId)) {
                    return
                  }
                  rememberSettledTypelessAssistant(context, assistantMessage)
                })
                .catch((err) => {
                  if (operationId !== null && !isCurrentTypelessOperation(operationId)) {
                    return
                  }
                  const message = err instanceof Error ? err.message : String(err)
                  setTypelessStatus({ type: 'error', message })
                  setTypelessRequest(null)
                  setError(message)
                })
            }
          } catch (err) {
            if (operationId !== null && !isCurrentTypelessOperation(operationId)) {
              return text
            }
            const message = err instanceof Error ? err.message : String(err)
            setTypelessStatus({ type: 'error', message })
            setError(message)
          }
        } else {
          // Chat 模式：发送到 AI 对话
          const session = await ensureAngrymiaoSession({
            purgeOthers: true,
          })
          const sessionId = session.id
          const msg = createMessage('user', text)
          await submitNewUserMessage(sessionId, {
            newUserMsg: msg,
            needGenerating: true,
          })

          // 生成完成后，自动播放 TTS (仅 Chat 模式)
          if (settings.autoPlayResponse) {
            console.log('[Voice TTS] autoPlayResponse enabled, fetching session...')
            const session = await chatStore.getSession(sessionId)
            console.log('[Voice TTS] session messages count:', session?.messages.length)
            if (session) {
              const lastAssistantMsg = [...session.messages]
                .reverse()
                .find((m) => m.role === 'assistant' && !m.error && !m.generating)
              console.log(
                '[Voice TTS] lastAssistantMsg:',
                lastAssistantMsg
                  ? {
                      role: lastAssistantMsg.role,
                      error: lastAssistantMsg.error,
                      generating: lastAssistantMsg.generating,
                      contentParts: lastAssistantMsg.contentParts?.length,
                    }
                  : null
              )
              if (lastAssistantMsg) {
                const responseText = getMessageText(lastAssistantMsg)
                console.log('[Voice TTS] responseText:', responseText.substring(0, 100))
                if (responseText.trim()) {
                  try {
                    console.log('[Voice TTS] calling ttsProvider.speak...')
                    setVoiceMode('speaking')
                    setIsSpeaking(true)
                    isSpeakingRef.current = true
                    setSpeakingText(responseText)
                    const ttsProvider = getTTSProvider()
                    console.log('[Voice TTS] ttsProvider type:', settings.ttsProvider)
                    await ttsProvider.speak(responseText, {
                      onEnd: () => {
                        console.log('[Voice TTS] speak onEnd')
                        isSpeakingRef.current = false
                        setIsSpeaking(false)
                        setSpeakingText('')
                        setVoiceMode('inactive')
                      },
                      onError: (error: Error) => {
                        console.error('[Voice TTS] speak onError:', error.message)
                        isSpeakingRef.current = false
                        setError(error.message)
                        setIsSpeaking(false)
                        setSpeakingText('')
                        setVoiceMode('inactive')
                      },
                    })
                    console.log('[Voice TTS] speak() promise resolved')
                  } catch (ttsErr) {
                    console.error('[Voice TTS] speak() threw:', ttsErr)
                    const ttsMsg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr)
                    isSpeakingRef.current = false
                    setError(ttsMsg)
                    setIsSpeaking(false)
                    setSpeakingText('')
                    setVoiceMode('inactive')
                  }
                }
              }
            }
          }
        }
      } else if (settings.workMode === 'typeless') {
        if (operationId !== null) {
          setTypelessOperationPhase('result', operationId)
        }
        setTypelessStatus({ type: 'error', message: '未识别到语音，请重试' })
      }

      setVoiceMode('inactive')

      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await closeStreamingASRSession()
      rejectPendingStreamingRecognition(message)
      await abortLiveTypelessController()
      if (operationId !== null && isCurrentTypelessOperation(operationId)) {
        setTypelessOperationPhase('result', operationId)
      }
      setError(message)
      if (settings.workMode === 'typeless') {
        setTypelessStatus({ type: 'error', message: `识别失败：${message}` })
      }
      setVoiceMode('inactive')
      return null
    }
  }, [
    getASRProvider,
    getTTSProvider,
    setIsRecording,
    setIsSpeaking,
    setSpeakingText,
    setVoiceMode,
    setTranscript,
    setStreamingText,
    setError,
    setTypelessStatus,
    settings.autoPlayResponse,
    settings.asrProvider,
    settings.workMode,
    clearRecordingTimeout,
    closeStreamingASRSession,
    abortLiveTypelessController,
    isCurrentTypelessOperation,
    rejectPendingStreamingRecognition,
    rememberSettledTypelessAssistant,
    setTypelessOperationPhase,
    stopStreamingRecognition,
    setTypelessRequest,
  ])

  // 播放语音
  const speak = useCallback(
    async (text: string) => {
      try {
        setError(null)
        setVoiceMode('speaking')
        setIsSpeaking(true)
        isSpeakingRef.current = true
        setSpeakingText(text)

        const ttsProvider = getTTSProvider()
        await ttsProvider.speak(text, {
          onEnd: () => {
            isSpeakingRef.current = false
            setIsSpeaking(false)
            setSpeakingText('')
            setVoiceMode('inactive')
          },
          onError: (error: Error) => {
            isSpeakingRef.current = false
            setError(error.message)
            setIsSpeaking(false)
            setSpeakingText('')
            setVoiceMode('inactive')
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        isSpeakingRef.current = false
        setError(message)
        setIsSpeaking(false)
        setSpeakingText('')
        setVoiceMode('inactive')
      }
    },
    [getTTSProvider, setError, setVoiceMode, setIsSpeaking, setSpeakingText]
  )

  // 停止播放
  const stopSpeaking = useCallback(() => {
    const ttsProvider = ttsProviderRef.current
    if (ttsProvider) {
      ttsProvider.stop()
    }
    isSpeakingRef.current = false
    setIsSpeaking(false)
    setSpeakingText('')
    setVoiceMode('inactive')
  }, [setIsSpeaking, setSpeakingText, setVoiceMode])

  const activateVoiceInput = useCallback(async () => {
    const started = await startRecording()
    if (!started) {
      return
    }

    void ensureAngrymiaoSkillRuntime({ voice: settings }).catch((e) => {
      console.error('Failed to start Angrymiao skill runtime (non-blocking):', e)
    })

    void (async () => {
      try {
        const granted = await window.electronAPI?.invoke('ensureAccessibilityPermission')
        if (!granted) {
          console.warn('Accessibility permission not granted, system control may not work')
        }
      } catch (e) {
        console.error('Failed to check accessibility permission:', e)
      }
    })()

    void (async () => {
      try {
        const session = await ensureAngrymiaoSession({
          purgeOthers: settings.workMode !== 'typeless',
        })
        switchCurrentSession(session.id)
      } catch (e) {
        console.error('Failed to switch to voice session:', e)
      }
    })()
  }, [settings, startRecording])

  const activateVoiceInputRef = useRef(activateVoiceInput)
  const stopRecordingRef = useRef(stopRecording)
  const stopSpeakingRef = useRef(stopSpeaking)

  useEffect(() => {
    activateVoiceInputRef.current = activateVoiceInput
    stopRecordingRef.current = stopRecording
    stopSpeakingRef.current = stopSpeaking
  }, [activateVoiceInput, stopRecording, stopSpeaking])

  const beginHoldRecordingStart = useCallback(async () => {
    holdActivationPendingRef.current = true
    activationHotkeyStartTimerRef.current = null
    pendingHotkeyReleaseRef.current = false

    try {
      await activateVoiceInputRef.current()

      const shouldStopAfterActivation = !holdShortcutActiveRef.current || pendingHotkeyReleaseRef.current
      if (shouldStopAfterActivation && recorderRef.current?.getState() === 'recording') {
        pendingHotkeyReleaseRef.current = false
        const shouldCancelCurrentRound = pendingHotkeyReleaseShouldCancelRef.current
        pendingHotkeyReleaseShouldCancelRef.current = false
        if (shouldCancelCurrentRound) {
          await cancelCurrentOperation()
          return
        }
        await stopRecordingRef.current()
      }
    } finally {
      holdActivationPendingRef.current = false
    }
  }, [cancelCurrentOperation])

  const scheduleHoldRecordingStart = useCallback(() => {
    clearActivationHotkeyStartTimer()
    activationHotkeyStartTimerRef.current = setTimeout(() => {
      activationHotkeyStartTimerRef.current = null
      if (!holdShortcutActiveRef.current) {
        return
      }
      void beginHoldRecordingStart()
    }, HOTKEY_RESTART_THRESHOLD_MS)
  }, [beginHoldRecordingStart, clearActivationHotkeyStartTimer])

  const triggerInterruptedHotkeyRestart = useCallback(() => {
    if (interruptedHotkeyRestartTriggeredRef.current || holdActivationPendingRef.current) {
      return
    }

    clearInterruptedHotkeyRestartTimer()
    interruptedHotkeyRestartTriggeredRef.current = true
    interruptedHotkeyRestartRequestedRef.current = false
    interruptedHotkeyPressStartedAtRef.current = null
    void beginHoldRecordingStart()
  }, [beginHoldRecordingStart, clearInterruptedHotkeyRestartTimer])

  // 切换语音模式
  const toggleVoice = useCallback(async () => {
    if (voiceMode === 'inactive') {
      await activateVoiceInput()
    } else if (voiceMode === 'listening' && isRecording) {
      await stopRecording()
    } else if (voiceMode === 'speaking' && isSpeaking) {
      stopSpeaking()
    }
  }, [voiceMode, isRecording, isSpeaking, activateVoiceInput, stopRecording, stopSpeaking])

  // 监听快捷键事件
  useEffect(() => {
    if (!settings.enabled) {
      console.log('Voice control not enabled, skipping event listener')
      return
    }

    console.log('Setting up voice toggle listener, workMode:', settings.workMode)

    // 所有模式都使用全局键盘钩子事件（长按模式）
    const handleHotkeyDown = () => {
      console.log('Hotkey down, mode:', settings.workMode)
      void (async () => {
        if (settings.workMode === 'typeless' && isTypelessInterruptibleState()) {
          holdShortcutActiveRef.current = true
          interruptedHotkeyPendingRef.current = true
          interruptedHotkeyRestartRequestedRef.current = false
          interruptedHotkeyRestartTriggeredRef.current = false
          interruptedHotkeyPressStartedAtRef.current = Date.now()
          await cancelCurrentOperation()

          const pressStartedAt = interruptedHotkeyPressStartedAtRef.current
          if (pressStartedAt === null) {
            return
          }

          const elapsedMs = Date.now() - pressStartedAt
          const remainingDelayMs = Math.max(0, HOTKEY_RESTART_THRESHOLD_MS - elapsedMs)
          if (remainingDelayMs === 0) {
            if (holdShortcutActiveRef.current || interruptedHotkeyRestartRequestedRef.current) {
              triggerInterruptedHotkeyRestart()
            }
            return
          }

          clearInterruptedHotkeyRestartTimer()
          interruptedHotkeyRestartTimerRef.current = setTimeout(() => {
            if (!interruptedHotkeyPendingRef.current && !interruptedHotkeyRestartRequestedRef.current) {
              return
            }

            triggerInterruptedHotkeyRestart()
          }, remainingDelayMs)
          return
        }

        if (voiceModeRef.current === 'inactive') {
          holdShortcutActiveRef.current = true
          interruptedHotkeyPendingRef.current = false
          interruptedHotkeyRestartRequestedRef.current = false
          interruptedHotkeyRestartTriggeredRef.current = false
          interruptedHotkeyPressStartedAtRef.current = null
          activationHotkeyPressStartedAtRef.current = Date.now()
          pendingHotkeyReleaseShouldCancelRef.current = false
          clearTypelessResultForNextRound()
          scheduleHoldRecordingStart()
        } else if (voiceModeRef.current === 'speaking' && isSpeakingRef.current) {
          stopSpeakingRef.current()
        }
      })()
    }

    const handleHotkeyUp = () => {
      console.log('Hotkey up')
      holdShortcutActiveRef.current = false

      if (interruptedHotkeyPendingRef.current) {
        const pressStartedAt = interruptedHotkeyPressStartedAtRef.current
        const pressDurationMs = pressStartedAt === null ? 0 : Date.now() - pressStartedAt
        const shouldRestart = pressDurationMs >= HOTKEY_RESTART_THRESHOLD_MS

        clearInterruptedHotkeyRestartTimer()
        interruptedHotkeyPendingRef.current = false

        if (!shouldRestart) {
          interruptedHotkeyRestartRequestedRef.current = false
          interruptedHotkeyRestartTriggeredRef.current = false
          interruptedHotkeyPressStartedAtRef.current = null
          if (settings.workMode === 'typeless') {
            void window.electronAPI?.invoke('typelessOverlay:hide')
          }
          return
        }

        interruptedHotkeyRestartRequestedRef.current = !interruptedHotkeyRestartTriggeredRef.current
        const restartTriggered = interruptedHotkeyRestartTriggeredRef.current || holdActivationPendingRef.current

        if (restartTriggered) {
          pendingHotkeyReleaseRef.current = true
          if (recorderRef.current && recorderRef.current.getState() === 'recording') {
            pendingHotkeyReleaseRef.current = false
            void stopRecordingRef.current()
          }
        }
        return
      }

      const activationPressStartedAt = activationHotkeyPressStartedAtRef.current
      const activationPressDurationMs = activationPressStartedAt === null ? 0 : Date.now() - activationPressStartedAt
      activationHotkeyPressStartedAtRef.current = null
      clearActivationHotkeyStartTimer()

      if (activationPressDurationMs < HOTKEY_RESTART_THRESHOLD_MS) {
        pendingHotkeyReleaseRef.current = false
        pendingHotkeyReleaseShouldCancelRef.current = false
        return
      }

      pendingHotkeyReleaseShouldCancelRef.current = false
      pendingHotkeyReleaseRef.current = true
      if (recorderRef.current && recorderRef.current.getState() === 'recording') {
        pendingHotkeyReleaseRef.current = false
        void stopRecordingRef.current()
      }
    }

    const cleanupDown = window.electronAPI?.onHotkeyDown?.(handleHotkeyDown)
    const cleanupUp = window.electronAPI?.onHotkeyUp?.(handleHotkeyUp)

    console.log('Global hotkey listeners registered')

    return () => {
      console.log('Cleaning up hotkey listeners')
      cleanupDown?.()
      cleanupUp?.()
      holdShortcutActiveRef.current = false
      holdActivationPendingRef.current = false
      pendingHotkeyReleaseRef.current = false
      pendingHotkeyReleaseShouldCancelRef.current = false
      activationHotkeyPressStartedAtRef.current = null
      interruptedHotkeyPendingRef.current = false
      interruptedHotkeyRestartRequestedRef.current = false
      interruptedHotkeyRestartTriggeredRef.current = false
      interruptedHotkeyPressStartedAtRef.current = null
      clearInterruptedHotkeyRestartTimer()
      clearActivationHotkeyStartTimer()
      clearRecordingTimeout()
      rejectPendingStreamingRecognition('语音控制已清理')
      void abortLiveTypelessController()
      void closeStreamingASRSession()
      if (settings.workMode === 'typeless') {
        void window.electronAPI?.invoke('typelessOverlay:hide')
      }
      if (recorderRef.current && recorderRef.current.getState() !== 'inactive') {
        recorderRef.current.stop().catch((err) => {
          console.error('Error stopping recorder during cleanup:', err)
        })
      }
      if (ttsProviderRef.current && !isSpeakingRef.current) {
        ttsProviderRef.current.stop()
      }
    }
  }, [
    settings.enabled,
    settings.workMode,
    beginHoldRecordingStart,
    cancelCurrentOperation,
    clearTypelessResultForNextRound,
    clearInterruptedHotkeyRestartTimer,
    clearActivationHotkeyStartTimer,
    clearRecordingTimeout,
    abortLiveTypelessController,
    closeStreamingASRSession,
    isTypelessInterruptibleState,
    rejectPendingStreamingRecognition,
    scheduleHoldRecordingStart,
    triggerInterruptedHotkeyRestart,
  ])

  return {
    voiceMode,
    isRecording,
    isSpeaking,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    toggleVoice,
  }
}
