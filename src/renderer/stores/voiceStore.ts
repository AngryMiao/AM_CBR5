import type { VoiceMode } from '@shared/types/voice'
import { atom } from 'jotai'
import type { TypelessRequestContext } from '@/packages/voice/typeless-request'

// 语音模式状态（运行时状态，不持久化）
export const voiceModeAtom = atom<VoiceMode>('inactive')

// 是否正在录音
export const isRecordingAtom = atom<boolean>(false)

// 当前转录文本（实时更新）
export const transcriptAtom = atom<string>('')

// 音频电平（0-1，用于可视化）
export const audioLevelAtom = atom<number>(0)

// 是否正在播放语音
export const isSpeakingAtom = atom<boolean>(false)

// 当前播放的文本
export const speakingTextAtom = atom<string>('')

// 语音面板是否可见
export const voicePanelVisibleAtom = atom<boolean>(false)

// 语音面板位置（用于拖动）
export const voicePanelPositionAtom = atom<{ x: number; y: number }>({
  x: typeof window !== 'undefined' ? window.innerWidth - 400 : 400,
  y: 100,
})

// 错误信息
export const voiceErrorAtom = atom<string | null>(null)

// 派生 atom：是否处于活跃的语音模式
export const isVoiceActiveAtom = atom((get) => {
  const mode = get(voiceModeAtom)
  return mode !== 'inactive'
})

// 派生 atom：语音状态描述文本
export const voiceStatusTextAtom = atom((get) => {
  const mode = get(voiceModeAtom)
  const isRecording = get(isRecordingAtom)
  const isSpeaking = get(isSpeakingAtom)

  if (mode === 'inactive') return ''
  if (mode === 'listening' && isRecording) return '正在听...'
  if (mode === 'processing') return '正在识别...'
  if (mode === 'speaking' && isSpeaking) return '正在播放...'
  return ''
})

// ==================== Typeless Mode ====================

// 流式识别文本（实时显示）
export const streamingTextAtom = atom<string>('')

// Typeless 状态
export interface TypelessStatus {
  type: 'executing' | 'inserting' | 'thinking' | 'success' | 'error'
  message: string
}
export const typelessStatusAtom = atom<TypelessStatus | null>(null)

// Typeless 请求上下文
export const typelessRequestAtom = atom<TypelessRequestContext | null>(null)

// Typeless 聊天结果上下文
export interface TypelessChatResultContext {
  sessionId: string
  userMessageId: string
  asrText: string
  replyText: string
  shownAt: number
}
export const typelessChatResultAtom = atom<TypelessChatResultContext | null>(null)

// 关闭结果窗口的 action
export const closeTypelessChatResult = atom(null, (get, set, payload?: { userMessageId?: string }) => {
  const currentRequest = get(typelessRequestAtom)
  const currentResult = get(typelessChatResultAtom)
  const targetUserMessageId = payload?.userMessageId

  if (!targetUserMessageId || currentResult?.userMessageId === targetUserMessageId) {
    set(typelessChatResultAtom, null)
  }
  if (!targetUserMessageId || currentRequest?.userMessageId === targetUserMessageId) {
    set(typelessRequestAtom, null)
  }
})
