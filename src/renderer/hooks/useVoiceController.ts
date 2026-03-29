import { createMessage, type Settings } from '@shared/types'
import { getMessageText } from '@shared/utils/message'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useCallback, useEffect, useRef } from 'react'
import { useVoiceSettings } from '@/hooks/useVoiceSettings'
import { ANGRYMIAO_SKILL_BUNDLE_ID, ANGRYMIAO_SKILL_RUNTIME_ID } from '@/packages/agent-skills'
import { mcpController } from '@/packages/mcp/controller'
import { getInstalledSkillBundle, resolveSkillBundleRuntimeServerConfig } from '@/packages/skill-bundles'
import { ensureAngrymiaoSession } from '@/packages/voice/angrymiao-session'
import type { ASRProvider } from '@/packages/voice/asr'
import {
  AliyunASRProvider,
  AzureASRProvider,
  FunASRLocalProvider,
  GoogleASRProvider,
  OpenAIASRProvider,
  WhisperLocalProvider,
} from '@/packages/voice/asr'
import {
  deriveTypelessExecutionState,
  findAssistantMessageForUser,
  mapTypelessExecutionStateToOverlay,
} from '@/packages/voice/typeless-execution-state'
import { startTypelessRequest } from '@/packages/voice/typeless-request'
import { VoiceRecorder } from '@/packages/voice/recorder'
import type { TTSProvider } from '@/packages/voice/tts'
import { AzureTTSProvider, BrowserTTSProvider, ElevenLabsTTSProvider, OpenAITTSProvider } from '@/packages/voice/tts'
import platform from '@/platform'
import * as chatStore from '@/stores/chatStore'
import { switchCurrentSession } from '@/stores/session/crud'
import { submitNewUserMessage } from '@/stores/session/messages'
import {
  audioLevelAtom,
  closeTypelessChatResult,
  isRecordingAtom,
  isSpeakingAtom,
  speakingTextAtom,
  streamingTextAtom,
  transcriptAtom,
  type TypelessStatus,
  typelessChatResultAtom,
  typelessRequestAtom,
  typelessStatusAtom,
  voiceErrorAtom,
  voiceModeAtom,
  voicePanelVisibleAtom,
} from '@/stores/voiceStore'

async function ensureAngrymiaoSkillRuntime(settings?: Partial<Settings>): Promise<void> {
  if (platform.type !== 'desktop') return
  const bundle = await getInstalledSkillBundle(ANGRYMIAO_SKILL_BUNDLE_ID)
  if (!bundle) return

  const existing = mcpController.servers.get('angrymiao-system-control')
  if (existing && existing.instance.status.state === 'running') return

  try {
    const runtimeConfig = await resolveSkillBundleRuntimeServerConfig(bundle.id, ANGRYMIAO_SKILL_RUNTIME_ID, settings)
    if (!runtimeConfig) return
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
  const { settings } = useVoiceSettings()
  const { session: typelessSession } = chatStore.useSession(typelessRequest?.sessionId ?? null)

  const recorderRef = useRef<VoiceRecorder | null>(null)
  const asrProviderRef = useRef<ASRProvider | null>(null)
  const ttsProviderRef = useRef<TTSProvider | null>(null)
  const isSpeakingRef = useRef(false)
  const voiceModeRef = useRef(voiceMode)
  const holdShortcutActiveRef = useRef(false)
  const holdActivationPendingRef = useRef(false)
  const pendingHotkeyReleaseRef = useRef(false)
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentTypelessRequestRef = useRef(typelessRequest)

  const trackedAssistantMessage = typelessRequest
    ? findAssistantMessageForUser(typelessSession?.messages ?? [], typelessRequest.userMessageId)
    : null
  const typelessExecutionState = typelessRequest
    ? deriveTypelessExecutionState({ assistantMessage: trackedAssistantMessage })
    : null
  const typelessOverlayState = typelessExecutionState
    ? mapTypelessExecutionStateToOverlay(typelessExecutionState)
    : null
  const derivedTypelessStatus =
    typelessOverlayState?.visibility === 'visible'
      ? {
          type: typelessOverlayState.type,
          message: typelessOverlayState.message,
        }
      : null
  const activeTypelessStatus = typelessRequest ? derivedTypelessStatus : typelessStatus
  const activeTypelessStatusType = activeTypelessStatus?.type ?? null
  const activeTypelessStatusMessage = activeTypelessStatus?.message ?? null

  const clearRecordingTimeout = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
      recordingTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    voiceModeRef.current = voiceMode
  }, [voiceMode])

  useEffect(() => {
    currentTypelessRequestRef.current = typelessRequest
  }, [typelessRequest])

  useEffect(() => {
    if (platform.type !== 'desktop' || settings.workMode !== 'typeless') {
      return
    }

    return window.electronAPI?.onTypelessChatResultClosed?.((payload) => {
      closeTypelessChatResultState(payload)
      setTypelessStatus(null)
    })
  }, [settings.workMode, closeTypelessChatResultState, setTypelessStatus])

  useEffect(() => {
    if (platform.type !== 'desktop' || settings.workMode !== 'typeless') {
      return
    }

    if (!typelessRequest || !trackedAssistantMessage || typelessExecutionState?.phase !== 'chat_result') {
      return
    }

    const replyText = getMessageText(trackedAssistantMessage).trim()
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
      setTypelessStatus(null)
    }
  }, [settings.workMode, closeTypelessChatResultState, setTypelessStatus])

  useEffect(() => {
    if (settings.workMode !== 'typeless' || !typelessRequest) {
      return
    }

    if (!isSameTypelessStatus(typelessStatus, derivedTypelessStatus)) {
      setTypelessStatus(derivedTypelessStatus)
    }
  }, [settings.workMode, typelessRequest, typelessStatus, derivedTypelessStatus, setTypelessStatus])

  useEffect(() => {
    if (platform.type !== 'desktop') {
      return
    }

    if (settings.workMode !== 'typeless') {
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
        const timer = setTimeout(() => {
          void window.electronAPI?.invoke('typelessOverlay:hide')
          setTypelessStatus(null)
          if (
            trackedUserMessageId &&
            currentTypelessRequestRef.current?.userMessageId === trackedUserMessageId
          ) {
            setTypelessRequest(null)
          }
        }, 900)
        return () => clearTimeout(timer)
      }
      return
    }

    if (voiceMode === 'listening' && isRecording) {
      void window.electronAPI?.invoke('typelessOverlay:show', {
        mode: 'listening',
        text: streamingText?.trim() || '正在聆听...',
      })
      return
    }

    if (voiceMode === 'listening' && !isRecording) {
      void window.electronAPI?.invoke('typelessOverlay:show', {
        mode: 'listening',
        text: '正在唤起麦克风...',
      })
      return
    }

    if (voiceMode === 'processing') {
      void window.electronAPI?.invoke('typelessOverlay:show', {
        mode: 'processing',
        text: '正在识别...',
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
    setTypelessRequest,
    setTypelessStatus,
  ])

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

  // 开始录音
  const startRecording = useCallback(async (): Promise<boolean> => {
    try {
      clearRecordingTimeout()
      setError(null)

      if (settings.workMode === 'typeless') {
        void window.electronAPI?.hideTypelessChatResult?.()
      }
      setTypelessChatResult(null)
      setTypelessRequest(null)
      setTypelessStatus(null)

      if (!VoiceRecorder.isSupported()) {
        throw new Error('当前环境不支持麦克风录音')
      }

      if (platform.type === 'desktop') {
        const granted = await window.electronAPI?.invoke('ensureMicrophonePermission')
        if (granted === false) {
          throw new Error('麦克风权限未授权，请在系统设置中允许后重试')
        }
      }

      setVoiceMode('listening')
      setPanelVisible(true)
      setStreamingText('')

      const recorder = new VoiceRecorder()
      recorderRef.current = recorder

      await recorder.start({
        onAudioLevelChange: (level) => setAudioLevel(level),
        onSilenceDetected: settings.autoStopRecording
          ? () => {
              stopRecording()
            }
          : undefined,
        silenceThreshold: settings.silenceThreshold,
        silenceDuration: settings.silenceDuration,
      })

      // Typeless 模式下启动流式识别
      if (settings.workMode === 'typeless') {
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
    settings.workMode,
    setError,
    setVoiceMode,
    setPanelVisible,
    setIsRecording,
    setAudioLevel,
    setStreamingText,
    setTypelessStatus,
    setTypelessChatResult,
    clearRecordingTimeout,
    startStreamingRecognition,
  ])

  // 停止录音并识别
  const stopRecording = useCallback(async () => {
    if (!recorderRef.current) return
    const recorder = recorderRef.current
    recorderRef.current = null

    try {
      clearRecordingTimeout()
      stopStreamingRecognition()
      setIsRecording(false)
      setVoiceMode('processing')

      const audioBlob = await recorder.stop()

      // 执行语音识别
      const asrProvider = getASRProvider()
      const text = await asrProvider.transcribe(audioBlob)

      setTranscript(text)
      setStreamingText('')

      // 根据工作模式决定输出目标
      if (text) {
        if (settings.workMode === 'typeless') {
          try {
            const { context, submitPromise } = await startTypelessRequest({
              text,
              keyboardShortcuts: settings.keyboardShortcuts || [],
              ensureSession: ensureAngrymiaoSession,
              submit: submitNewUserMessage,
            })
            setTypelessRequest(context)
            void submitPromise.catch((err) => {
              const message = err instanceof Error ? err.message : String(err)
              setTypelessStatus({ type: 'error', message })
              setTypelessRequest(null)
              setError(message)
            })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            setTypelessStatus({ type: 'error', message })
            setError(message)
          }
        } else {
          // Chat 模式：发送到 AI 对话
          const session = await ensureAngrymiaoSession({
            keyboardShortcuts: settings.keyboardShortcuts,
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
        setTypelessStatus({ type: 'error', message: '未识别到语音，请重试' })
      }

      setVoiceMode('inactive')

      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
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
    settings.workMode,
    settings.keyboardShortcuts,
    clearRecordingTimeout,
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

    if (settings.workMode !== 'typeless') {
      void (async () => {
        try {
          const session = await ensureAngrymiaoSession({
            keyboardShortcuts: settings.keyboardShortcuts,
            purgeOthers: true,
          })
          switchCurrentSession(session.id)
        } catch (e) {
          console.error('Failed to switch to voice session:', e)
        }
      })()
    }
  }, [settings, startRecording])

  const activateVoiceInputRef = useRef(activateVoiceInput)
  const stopRecordingRef = useRef(stopRecording)
  const stopSpeakingRef = useRef(stopSpeaking)

  useEffect(() => {
    activateVoiceInputRef.current = activateVoiceInput
    stopRecordingRef.current = stopRecording
    stopSpeakingRef.current = stopSpeaking
  }, [activateVoiceInput, stopRecording, stopSpeaking])

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
        if (voiceModeRef.current === 'inactive') {
          holdShortcutActiveRef.current = true
          holdActivationPendingRef.current = true
          pendingHotkeyReleaseRef.current = false
          try {
            await activateVoiceInputRef.current()

            const shouldStopAfterActivation = !holdShortcutActiveRef.current || pendingHotkeyReleaseRef.current
            if (shouldStopAfterActivation && recorderRef.current?.getState() === 'recording') {
              pendingHotkeyReleaseRef.current = false
              await stopRecordingRef.current()
            }
          } finally {
            holdActivationPendingRef.current = false
          }
        } else if (voiceModeRef.current === 'speaking' && isSpeakingRef.current) {
          stopSpeakingRef.current()
        }
      })()
    }

    const handleHotkeyUp = () => {
      console.log('Hotkey up')
      holdShortcutActiveRef.current = false

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
      clearRecordingTimeout()
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
  }, [settings.enabled, settings.workMode, clearRecordingTimeout])

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
