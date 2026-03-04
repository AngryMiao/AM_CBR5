import type { ASRProvider } from './index'
import { ASRError } from './index'

/**
 * OpenAI Whisper API ASR 提供商
 */
export class OpenAIASRProvider implements ASRProvider {
  private apiKey: string
  private model: string
  private baseURL: string

  constructor(config: { apiKey: string; model?: string; baseURL?: string }) {
    this.apiKey = config.apiKey
    this.model = config.model || 'whisper-1'
    this.baseURL = config.baseURL || 'https://api.openai.com/v1'
  }

  getName(): string {
    return 'OpenAI Whisper'
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  async transcribe(audioBlob: Blob, language?: string): Promise<string> {
    if (!this.apiKey) {
      throw new ASRError('OpenAI API Key 未配置', 'openai')
    }

    try {
      // 准备 FormData
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.webm')
      formData.append('model', this.model)
      if (language) {
        formData.append('language', language)
      }

      // 调用 OpenAI Whisper API
      const response = await fetch(`${this.baseURL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const text = data.text?.trim() || ''

      if (!text) {
        throw new ASRError('转录结果为空', 'openai')
      }

      return text
    } catch (error) {
      if (error instanceof ASRError) {
        throw error
      }
      throw new ASRError(
        `OpenAI Whisper 转录失败: ${error instanceof Error ? error.message : String(error)}`,
        'openai',
        error instanceof Error ? error : undefined
      )
    }
  }
}
