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
import { WhisperLocalProvider, FunASRLocalProvider, OpenAIASRProvider, AzureASRProvider, GoogleASRProvider } from '@/packages/voice/asr'
import { BrowserTTSProvider, OpenAITTSProvider, AzureTTSProvider, ElevenLabsTTSProvider } from '@/packages/voice/tts'
import * as chatStore from '@/stores/chatStore'
import { switchCurrentSession } from '@/stores/session/crud'
import { submitNewUserMessage } from '@/stores/session/messages'
import { createMessage } from '@shared/types'
import { getMessageText } from '@shared/utils/message'
import { initEmptyChatSession } from '@/stores/sessionHelpers'
import platform from '@/platform'
import { mcpController } from '@/packages/mcp/controller'

import type { KeyboardShortcut } from '@shared/types/voice'

const VOICE_SESSION_NAME = 'angrymiao'

async function ensureSystemControlMCP(keyboardDriverPath?: string): Promise<void> {
  if (platform.type !== 'desktop') return
  const existing = mcpController.servers.get('system-control')
  if (existing && existing.instance.status.state === 'running') return

  try {
    const mcpPath = await window.electronAPI.invoke('getSystemControlMCPPath')
    const mcpCommand = await window.electronAPI.invoke('getSystemControlMCPCommand')
    const env: Record<string, string> = {}
    if (keyboardDriverPath) {
      env.KEYBOARD_DRIVER_PATH = keyboardDriverPath
    }
    if (mcpCommand !== 'node') {
      env.ELECTRON_RUN_AS_NODE = '1'
    }
    await mcpController.updateServer({
      id: 'system-control',
      name: 'system-control',
      enabled: true,
      transport: {
        type: 'stdio' as const,
        command: mcpCommand,
        args: [mcpPath],
        env,
      },
    })
    console.info('system-control-mcp server started for voice control')
  } catch (err) {
    console.error('Failed to start system-control-mcp:', err)
  }
}


function buildVoiceSystemPrompt(platformType: string, keyboardShortcuts: KeyboardShortcut[] = []): string {
  // 工具名需要与 MCP controller 注册的名称一致（mcp__<server_name>__<tool_name>）
  const t = (name: string) => `mcp__system-control__${name}`

  const enabledShortcuts = keyboardShortcuts.filter((s) => s.enabled)

  // 构建快捷键映射表
  let shortcutTable = ''
  if (enabledShortcuts.length > 0) {
    const rows = enabledShortcuts
      .map((s) => `| ${s.triggerWords.join(' / ')} | ${JSON.stringify(s.keyCodes)} |`)
      .join('\n')
    shortcutTable = `
<skill name="keyboard_shortcuts">
你具备键盘快捷键控制能力。以下是已配置的快捷键映射表，当用户语音匹配触发词时，直接调用 ${t('keyboard_control')} 并传入对应的 keyCodes：

| 触发词 | keyCodes |
|--------|----------|
${rows}

规则：
- 用户说出触发词时，直接调用 ${t('keyboard_control')}(keyCodes: [...])，不要反问
- 如果用户说的快捷键不在映射表中，尝试根据 key code 格式自行组合
- 回复简短确认即可，如"已复制"、"已粘贴"
</skill>`
  }

  return `<identity>
你是 Angrymiao 语音控制助手，一个通过语音指令控制用户计算机的智能代理。你接收用户的语音转文字输入，理解意图后调用对应的工具执行操作。
</identity>

<available_tools>
你可以使用以下工具：

1. ${t('type_text')} - 在当前光标位置输入文本
   参数: text (string) - 要输入的文本内容
   触发词: "打"、"输入"、"写"、"键入"、"打字"

2. ${t('keyboard_control')} - 执行键盘快捷键操作
   参数: keyCodes (string[]) - 8位hex按键序列，按下和抬起成对出现

3. ${t('open_browser')} - 在默认浏览器中打开 URL
   参数: url (string) - 完整 URL（含协议）
   触发词: "打开浏览器"、"打开网页"、"搜索"、"上网"

4. ${t('system_shutdown')} - 关闭计算机（需确认）
5. ${t('system_restart')} - 重启计算机（需确认）
6. ${t('system_lock_screen')} - 锁定屏幕
7. ${t('system_sleep')} - 进入睡眠模式
</available_tools>
${shortcutTable}
<intent_mapping>
语音输入的意图识别规则（按优先级排序）：

优先级 1 - 文本输入：当用户说"打"、"输入"、"写"、"键入"后跟内容时，使用 ${t('type_text')} 输入该内容。
  - "帮我打一二三" → ${t('type_text')}("一二三")
  - "输入你好世界" → ${t('type_text')}("你好世界")
  - "打 hello world" → ${t('type_text')}("hello world")
  - "写一个邮箱地址 test@example.com" → ${t('type_text')}("test@example.com")

优先级 2 - 键盘控制：当用户说出快捷键映射表中的触发词时，查找映射表并调用 ${t('keyboard_control')}(keyCodes: [...])。

优先级 3 - 浏览器/搜索：
  - "打开百度" → ${t('open_browser')}("https://www.baidu.com")
  - "搜索天气预报" → ${t('open_browser')}("https://www.google.com/search?q=天气预报")

优先级 4 - 系统控制：
  - "关机" / "重启" / "锁屏" / "睡眠" → 对应系统工具
</intent_mapping>

<behavior>
- 收到指令后，直接调用对应的工具，不要生成任何文本内容。
- 只在以下情况生成文本回复：
  1. 无法识别用户意图时，简短询问
  2. 工具调用失败时，说明错误原因
  3. 关机/重启操作需要确认时
- 如果语音文本有歧义，优先理解为文本输入意图。
- 工具执行成功后，不要再输出确认信息，工具结果已经足够。
</behavior>`
}

async function ensureVoiceSystemPrompt(sessionId: string, keyboardShortcuts: KeyboardShortcut[] = []): Promise<void> {
  const session = await chatStore.getSession(sessionId)
  if (!session) return

  const platformType = await platform.getPlatform()
  const newPrompt = buildVoiceSystemPrompt(platformType, keyboardShortcuts)

  const existingSystemIdx = session.messages.findIndex((m) => m.role === 'system')

  // 检查 system prompt 是否真的变化了
  let promptChanged = false
  if (existingSystemIdx >= 0) {
    const oldPrompt = session.messages[existingSystemIdx].contentParts?.[0]?.text || ''
    promptChanged = oldPrompt !== newPrompt
  } else {
    promptChanged = true
  }

  // 更新 system prompt
  if (existingSystemIdx >= 0) {
    await chatStore.updateMessage(sessionId, session.messages[existingSystemIdx].id, {
      contentParts: [{ type: 'text', text: newPrompt }],
    })
  } else {
    const systemMsg = createMessage('system', newPrompt)
    await chatStore.insertMessage(sessionId, systemMsg)
  }

  // 如果 prompt 变化了，清空历史消息（避免新旧指令冲突）
  if (promptChanged && session.messages.length > 1) {
    console.log('[Voice] Keyboard shortcuts changed, clearing conversation history')
    const nonSystemMessages = session.messages.filter((m) => m.role !== 'system')
    for (const msg of nonSystemMessages) {
      await chatStore.deleteMessage(sessionId, msg.id)
    }
  }
}

async function findOrCreateVoiceSession(keyboardShortcuts: KeyboardShortcut[] = []): Promise<string> {
  const sessions = await chatStore.listSessionsMeta()
  const existing = sessions.find((s) => s.name === VOICE_SESSION_NAME)
  if (existing) {
    await ensureVoiceSystemPrompt(existing.id, keyboardShortcuts)
    return existing.id
  }

  const platformType = await platform.getPlatform()
  const session = initEmptyChatSession()
  session.messages = [createMessage('system', buildVoiceSystemPrompt(platformType, keyboardShortcuts))]
  session.name = VOICE_SESSION_NAME

  const newSession = await chatStore.createSession(session)
  return newSession.id
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
      setTimeout(() => {
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
  ])

  // 停止录音并识别
  const stopRecording = useCallback(async () => {
    if (!recorderRef.current) return

    try {
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
        const sessionId = await findOrCreateVoiceSession(settings.keyboardShortcuts)
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
  }, [getASRProvider, getTTSProvider, setIsRecording, setIsSpeaking, setSpeakingText, setVoiceMode, setTranscript, setError, settings.autoPlayResponse])

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

  // 切换语音模式
  const toggleVoice = useCallback(async () => {
    if (voiceMode === 'inactive') {
      // 确保 system-control-mcp 已启动
      await ensureSystemControlMCP(settings.keyboardDriverPath)
      // macOS: 检查并请求辅助功能权限
      try {
        const granted = await window.electronAPI?.invoke('ensureAccessibilityPermission')
        if (!granted) {
          console.warn('Accessibility permission not granted, system control may not work')
        }
      } catch (e) {
        console.error('Failed to check accessibility permission:', e)
      }
      // 自动跳转到 angrymiao 对话
      try {
        const sessionId = await findOrCreateVoiceSession(settings.keyboardShortcuts)
        switchCurrentSession(sessionId)
      } catch (e) {
        console.error('Failed to switch to voice session:', e)
      }
      startRecording()
    } else if (voiceMode === 'listening' && isRecording) {
      stopRecording()
    } else if (voiceMode === 'speaking' && isSpeaking) {
      stopSpeaking()
    }
  }, [voiceMode, isRecording, isSpeaking, startRecording, stopRecording, stopSpeaking, settings.keyboardDriverPath])

  // 监听快捷键事件
  useEffect(() => {
    if (!settings.enabled) {
      console.log('Voice control not enabled, skipping event listener')
      return
    }

    console.log('Setting up voice toggle listener')

    const handleVoiceToggle = () => {
      console.log('Voice toggle event received!')
      toggleVoice()
    }

    // 监听来自主进程的语音切换事件
    const cleanup = window.electronAPI?.onVoiceToggle?.(handleVoiceToggle)

    console.log('Voice toggle listener registered, cleanup:', !!cleanup)

    return () => {
      console.log('Cleaning up voice toggle listener')
      cleanup?.()
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
  }, [settings.enabled, toggleVoice])

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
