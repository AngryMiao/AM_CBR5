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

export type StreamingASRSessionEvent =
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string }
  | { type: 'completed'; text: string }
  | { type: 'error'; message: string }

export interface StreamingASRSession {
  appendAudio(chunk: Uint8Array): Promise<void>
  commit(): Promise<void>
  close(): Promise<void>
}

export interface StreamingASRProvider extends ASRProvider {
  createStreamingSession(options: { onEvent: (event: StreamingASRSessionEvent) => void }): Promise<StreamingASRSession>
}

export function isStreamingASRProvider(provider: ASRProvider): provider is StreamingASRProvider {
  return typeof (provider as StreamingASRProvider).createStreamingSession === 'function'
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

export { AliyunASRProvider } from './aliyun'
export { AzureASRProvider } from './azure'
export { DoubaoASRProvider } from './doubao'
export { FunASRLocalProvider } from './funasr-local'
export { GoogleASRProvider } from './google'
export { OpenAIASRProvider } from './openai'
export { WhisperLocalProvider } from './whisper-local'
