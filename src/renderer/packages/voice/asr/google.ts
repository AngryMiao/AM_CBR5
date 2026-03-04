import type { ASRProvider } from './index'
import { ASRError } from './index'

/**
 * Google Cloud Speech-to-Text ASR 提供商
 */
export class GoogleASRProvider implements ASRProvider {
  private apiKey: string
  private languageCode: string

  constructor(config: { apiKey: string; languageCode?: string }) {
    this.apiKey = config.apiKey
    this.languageCode = config.languageCode || 'zh-CN'
  }

  getName(): string {
    return 'Google Speech'
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  async transcribe(audioBlob: Blob, language?: string): Promise<string> {
    if (!this.apiKey) {
      throw new ASRError('Google Cloud API Key 未配置', 'google')
    }

    try {
      // 将音频转换为 base64
      const arrayBuffer = await audioBlob.arrayBuffer()
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))

      const lang = language || this.languageCode

      // 调用 Google Cloud Speech-to-Text API
      const response = await fetch(
        `https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            config: {
              encoding: 'WEBM_OPUS',
              sampleRateHertz: 48000,
              languageCode: lang,
              enableAutomaticPunctuation: true,
            },
            audio: {
              content: base64Audio,
            },
          }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const text = data.results?.[0]?.alternatives?.[0]?.transcript?.trim() || ''

      if (!text) {
        throw new ASRError('转录结果为空', 'google')
      }

      return text
    } catch (error) {
      if (error instanceof ASRError) {
        throw error
      }
      throw new ASRError(
        `Google Speech 转录失败: ${error instanceof Error ? error.message : String(error)}`,
        'google',
        error instanceof Error ? error : undefined
      )
    }
  }
}
