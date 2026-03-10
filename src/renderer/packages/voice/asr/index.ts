/**
 * ASR (Automatic Speech Recognition) 提供商接口
 */
export interface ASRProvider {
  /**
   * 将音频转录为文本
   * @param audioBlob 音频 Blob 对象
   * @param language 语言代码（可选），如 'zh', 'en'
   * @returns 转录的文本
   */
  transcribe(audioBlob: Blob, language?: string): Promise<string>

  /**
   * 检查提供商是否可用
   * @returns 是否可用
   */
  isAvailable(): Promise<boolean>

  /**
   * 获取提供商名称
   */
  getName(): string
}

/**
 * ASR 错误类
 */
export class ASRError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'ASRError'
  }
}

export { WhisperLocalProvider } from './whisper-local'
export { FunASRLocalProvider } from './funasr-local'
export { OpenAIASRProvider } from './openai'
export { AzureASRProvider } from './azure'
export { GoogleASRProvider } from './google'
