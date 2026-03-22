import { useAtom, useSetAtom } from 'jotai'
import { useCallback, useEffect, useRef } from 'react'
import {
  audioLevelAtom,
  isRecordingAtom,
  isSpeakingAtom,
  speakingTextAtom,
  transcriptAtom,
  voiceErrorAtom,
  voiceModeAtom,
  voicePanelVisibleAtom,
} from '@/stores/voiceStore'
import { useVoiceSettings } from '@/hooks/useVoiceSettings'
import { VoiceRecorder } from '@/packages/voice/recorder'
import type { ASRProvider } from '@/packages/voice/asr'
import type { TTSProvider } from '@/packages/voice/tts'
import {
  WhisperLocalProvider,
  FunASRLocalProvider,
  OpenAIASRProvider,
  AliyunASRProvider,
  AzureASRProvider,
  GoogleASRProvider,
} from '@/packages/voice/asr'
import { BrowserTTSProvider, OpenAITTSProvider, AzureTTSProvider, ElevenLabsTTSProvider } from '@/packages/voice/tts'
import * as chatStore from '@/stores/chatStore'
import { switchCurrentSession } from '@/stores/session/crud'
import { submitNewUserMessage } from '@/stores/session/messages'
import { createMessage, type Settings } from '@shared/types'
import { getMessageText } from '@shared/utils/message'
import platform from '@/platform'
import { ANGRYMIAO_SKILL_BUNDLE_ID, ANGRYMIAO_SKILL_RUNTIME_ID } from '@/packages/agent-skills'
import { mcpController } from '@/packages/mcp/controller'
import { getInstalledSkillBundle, resolveSkillBundleRuntimeServerConfig } from '@/packages/skill-bundles'
import { ensureAngrymiaoSession } from '@/packages/voice/angrymiao-session'

async function ensureAngrymiaoSkillRuntime(settings?: Partial<Settings>): Promise<void> {
  if (platform.type !== 'desktop') return
  const bundle = await getInstalledSkillBundle(ANGRYMIAO_SKILL_BUNDLE_ID)
  if (!bundle) return

  const existing = mcpController.servers.get('angrymiao-system-control')
  if (existing && existing.instance.status.state === 'running') return

  try {
    const runtimeConfig = await resolveSkillBundleRuntimeServerConfig(
      bundle.id,
      ANGRYMIAO_SKILL_RUNTIME_ID,
      settings
    )
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

type ParsedShortcut = {
  modifiers: Set<'ctrl' | 'meta' | 'alt' | 'shift' | 'mod'>
  key?: string
}

function normalizeShortcutToken(token: string): string {
  switch (token.trim().toLowerCase()) {
    case 'control':
    case 'ctrl':
      return 'ctrl'
    case 'command':
    case 'cmd':
    case 'meta':
    case 'win':
      return 'meta'
    case 'option':
    case 'alt':
      return 'alt'
    case 'shift':
      return 'shift'
    case 'commandorcontrol':
    case 'mod':
      return 'mod'
    case 'return':
    case 'enter':
      return 'enter'
    case 'space':
      return ' '
    case 'escape':
    case 'esc':
      return 'escape'
    case 'up':
      return 'arrowup'
    case 'down':
      return 'arrowdown'
    case 'left':
      return 'arrowleft'
    case 'right':
      return 'arrowright'
    default:
      return token.trim().toLowerCase()
  }
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parsed: ParsedShortcut = {
    modifiers: new Set(),
  }

  for (const part of shortcut.split('+').filter(Boolean)) {
    const normalized = normalizeShortcutToken(part)
    if (normalized === 'ctrl' || normalized === 'meta' || normalized === 'alt' || normalized === 'shift' || normalized === 'mod') {
      parsed.modifiers.add(normalized)
    } else {
      parsed.key = normalized
    }
  }

  return parsed
}

function normalizeEventKey(key: string): string {
  switch (key) {
    case 'Control':
      return 'ctrl'
    case 'Meta':
      return 'meta'
    case 'Alt':
      return 'alt'
    case 'Shift':
      return 'shift'
    case 'Enter':
      return 'enter'
    case ' ':
      return ' '
    case 'Escape':
      return 'escape'
    case 'ArrowUp':
      return 'arrowup'
    case 'ArrowDown':
      return 'arrowdown'
    case 'ArrowLeft':
      return 'arrowleft'
    case 'ArrowRight':
      return 'arrowright'
    default:
      return key.toLowerCase()
  }
}

function matchesShortcutEvent(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut)
  if (!parsed.key) {
    return false
  }

  const requiresCtrl = parsed.modifiers.has('ctrl')
  const requiresMeta = parsed.modifiers.has('meta')
  const requiresAlt = parsed.modifiers.has('alt')
  const requiresShift = parsed.modifiers.has('shift')
  const requiresMod = parsed.modifiers.has('mod')

  if (normalizeEventKey(event.key) !== parsed.key) {
    return false
  }
  if (requiresCtrl && !event.ctrlKey) {
    return false
  }
  if (requiresMeta && !event.metaKey) {
    return false
  }
  if (requiresAlt && !event.altKey) {
    return false
  }
  if (requiresShift && !event.shiftKey) {
    return false
  }
  if (requiresMod && !(event.ctrlKey || event.metaKey)) {
    return false
  }
  if (!requiresAlt && event.altKey) {
    return false
  }
  if (!requiresShift && event.shiftKey) {
    return false
  }
  if (!requiresMod && !requiresCtrl && event.ctrlKey) {
    return false
  }
  if (!requiresMod && !requiresMeta && event.metaKey) {
    return false
  }

  return true
}

function releasesShortcut(event: KeyboardEvent, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut)
  const released = normalizeEventKey(event.key)

  if (parsed.key === released) {
    return true
  }
  if (released === 'ctrl' || released === 'meta' || released === 'alt' || released === 'shift') {
    return parsed.modifiers.has(released) || (parsed.modifiers.has('mod') && (released === 'ctrl' || released === 'meta'))
  }

  return false
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
  const { settings } = useVoiceSettings()

  const recorderRef = useRef<VoiceRecorder | null>(null)
  const asrProviderRef = useRef<ASRProvider | null>(null)
  const ttsProviderRef = useRef<TTSProvider | null>(null)
  const isSpeakingRef = useRef(false)
  const voiceModeRef = useRef(voiceMode)
  const holdShortcutActiveRef = useRef(false)
  const holdActivationPendingRef = useRef(false)
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearRecordingTimeout = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current)
      recordingTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    voiceModeRef.current = voiceMode
  }, [voiceMode])

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

  // 开始录音
  const startRecording = useCallback(async () => {
    try {
      clearRecordingTimeout()
      setError(null)
      setVoiceMode('listening')
      setPanelVisible(true)
      setIsRecording(true)

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

      // 自动停止录音（最大时长）
      recordingTimeoutRef.current = setTimeout(() => {
        if (recorderRef.current) {
          stopRecording()
        }
      }, settings.maxRecordingDuration)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setError(message)
      setVoiceMode('inactive')
      setIsRecording(false)
    }
  }, [
    settings.autoStopRecording,
    settings.silenceThreshold,
    settings.silenceDuration,
    settings.maxRecordingDuration,
    setError,
    setVoiceMode,
    setPanelVisible,
    setIsRecording,
    setAudioLevel,
    clearRecordingTimeout,
  ])

  // 停止录音并识别
  const stopRecording = useCallback(async () => {
    if (!recorderRef.current) return

    try {
      clearRecordingTimeout()
      setIsRecording(false)
      setVoiceMode('processing')

      const audioBlob = await recorderRef.current.stop()
      recorderRef.current = null

      // 执行语音识别
      const asrProvider = getASRProvider()
      const text = await asrProvider.transcribe(audioBlob)

      setTranscript(text)
      setVoiceMode('inactive')

      // 将识别结果发送到 angrymiao 对话
      if (text) {
        const session = await ensureAngrymiaoSession({ keyboardShortcuts: settings.keyboardShortcuts, purgeOthers: true })
        const sessionId = session.id
        const msg = createMessage('user', text)
        await submitNewUserMessage(sessionId, {
          newUserMsg: msg,
          needGenerating: true,
        })

        // 生成完成后，自动播放 TTS
        if (settings.autoPlayResponse) {
          console.log('[Voice TTS] autoPlayResponse enabled, fetching session...')
          const session = await chatStore.getSession(sessionId)
          console.log('[Voice TTS] session messages count:', session?.messages.length)
          if (session) {
            const lastAssistantMsg = [...session.messages].reverse().find(
              (m) => m.role === 'assistant' && !m.error && !m.generating
            )
            console.log('[Voice TTS] lastAssistantMsg:', lastAssistantMsg ? {
              role: lastAssistantMsg.role,
              error: lastAssistantMsg.error,
              generating: lastAssistantMsg.generating,
              contentParts: lastAssistantMsg.contentParts?.length,
            } : null)
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

      return text
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setError(message)
      setVoiceMode('inactive')
      return null
    }
  }, [getASRProvider, getTTSProvider, setIsRecording, setIsSpeaking, setSpeakingText, setVoiceMode, setTranscript, setError, settings.autoPlayResponse, clearRecordingTimeout])

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
    await ensureAngrymiaoSkillRuntime({ voice: settings })
    try {
      const granted = await window.electronAPI?.invoke('ensureAccessibilityPermission')
      if (!granted) {
        console.warn('Accessibility permission not granted, system control may not work')
      }
    } catch (e) {
      console.error('Failed to check accessibility permission:', e)
    }
    try {
      const session = await ensureAngrymiaoSession({ keyboardShortcuts: settings.keyboardShortcuts, purgeOthers: true })
      switchCurrentSession(session.id)
    } catch (e) {
      console.error('Failed to switch to voice session:', e)
    }
    await startRecording()
  }, [settings.keyboardDriverPath, settings.keyboardShortcuts, startRecording])

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

    console.log('Setting up voice toggle listener')

    const handleVoiceToggle = () => {
      if (settings.triggerMode !== 'toggle') {
        return
      }
      console.log('Voice toggle event received!')
      void (async () => {
        if (voiceModeRef.current === 'inactive') {
          await activateVoiceInput()
        } else if (voiceModeRef.current === 'listening' && recorderRef.current) {
          await stopRecording()
        } else if (voiceModeRef.current === 'speaking' && isSpeakingRef.current) {
          stopSpeaking()
        }
      })()
    }

    // 监听来自主进程的语音切换事件
    const cleanup = window.electronAPI?.onVoiceToggle?.(handleVoiceToggle)

    const handleHoldShortcutKeyDown = (event: KeyboardEvent) => {
      if (settings.triggerMode !== 'hold' || event.repeat || !matchesShortcutEvent(event, settings.shortcuts.toggleVoice)) {
        return
      }

      event.preventDefault()
      if (holdShortcutActiveRef.current || holdActivationPendingRef.current) {
        return
      }

      holdShortcutActiveRef.current = true
      holdActivationPendingRef.current = true

      void (async () => {
        try {
          if (voiceModeRef.current === 'inactive') {
            await activateVoiceInput()
            if (!holdShortcutActiveRef.current && recorderRef.current) {
              await stopRecording()
            }
          } else if (voiceModeRef.current === 'speaking' && isSpeakingRef.current) {
            stopSpeaking()
          }
        } finally {
          holdActivationPendingRef.current = false
        }
      })()
    }

    const handleHoldShortcutKeyUp = (event: KeyboardEvent) => {
      if (settings.triggerMode !== 'hold' || !releasesShortcut(event, settings.shortcuts.toggleVoice)) {
        return
      }

      if (!holdShortcutActiveRef.current && !holdActivationPendingRef.current) {
        return
      }

      holdShortcutActiveRef.current = false
      if (recorderRef.current && recorderRef.current.getState() === 'recording') {
        void stopRecording()
      }
    }

    const handleWindowBlur = () => {
      if (settings.triggerMode !== 'hold') {
        return
      }
      holdShortcutActiveRef.current = false
      if (recorderRef.current && recorderRef.current.getState() === 'recording') {
        void stopRecording()
      }
    }

    window.addEventListener('keydown', handleHoldShortcutKeyDown)
    window.addEventListener('keyup', handleHoldShortcutKeyUp)
    window.addEventListener('blur', handleWindowBlur)

    console.log('Voice toggle listener registered, cleanup:', !!cleanup)

    return () => {
      console.log('Cleaning up voice toggle listener')
      cleanup?.()
      window.removeEventListener('keydown', handleHoldShortcutKeyDown)
      window.removeEventListener('keyup', handleHoldShortcutKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
      holdShortcutActiveRef.current = false
      holdActivationPendingRef.current = false
      clearRecordingTimeout()
      // 清理资源 - 只在 recorder 存在时才调用 stop
      if (recorderRef.current && recorderRef.current.getState() !== 'inactive') {
        recorderRef.current.stop().catch((err) => {
          console.error('Error stopping recorder during cleanup:', err)
        })
      }
      if (ttsProviderRef.current && !isSpeakingRef.current) {
        ttsProviderRef.current.stop()
      }
    }
  }, [settings.enabled, settings.triggerMode, settings.shortcuts.toggleVoice, activateVoiceInput, stopRecording, stopSpeaking, clearRecordingTimeout])

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
