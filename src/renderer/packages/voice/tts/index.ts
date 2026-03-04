/**
 * TTS (Text-to-Speech) 提供商接口
 */
export interface TTSProvider {
  /**
   * 将文本转换为语音并播放
   * @param text 要转换的文本
   * @param options 可选配置
   * @returns Promise，播放完成后 resolve
   */
  speak(text: string, options?: TTSOptions): Promise<void>

  /**
   * 停止当前播放
   */
  stop(): void

  /**
   * 暂停播放
   */
  pause?(): void

  /**
   * 恢复播放
   */
  resume?(): void

  /**
   * 检查提供商是否可用
   */
  isAvailable(): Promise<boolean>

  /**
   * 获取提供商名称
   */
  getName(): string

  /**
   * 是否正在播放
   */
  isSpeaking(): boolean
}

/**
 * TTS 选项
 */
export interface TTSOptions {
  /**
   * 语速（0.1-10，默认 1）
   */
  rate?: number

  /**
   * 音调（0-2，默认 1）
   */
  pitch?: number

  /**
   * 音量（0-1，默认 1）
   */
  volume?: number

  /**
   * 语音名称（提供商特定）
   */
  voice?: string

  /**
   * 播放进度回调
   */
  onProgress?: (progress: number) => void

  /**
   * 播放完成回调
   */
  onEnd?: () => void

  /**
   * 播放错误回调
   */
  onError?: (error: Error) => void
}

/**
 * TTS 错误类
 */
export class TTSError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'TTSError'
  }
}

export { BrowserTTSProvider } from './browser'
export { OpenAITTSProvider } from './openai'
export { AzureTTSProvider } from './azure'
export { ElevenLabsTTSProvider } from './elevenlabs'
