import type { ASRProvider } from './index'
import { ASRError } from './index'

/**
 * Azure Speech Services ASR 提供商
 */
export class AzureASRProvider implements ASRProvider {
  private apiKey: string
  private endpoint: string
  private region: string

  constructor(config: { apiKey: string; endpoint: string; region: string }) {
    this.apiKey = config.apiKey
    this.endpoint = config.endpoint
    this.region = config.region
  }

  getName(): string {
    return 'Azure Speech'
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey && !!this.endpoint && !!this.region
  }

  async transcribe(audioBlob: Blob, language?: string): Promise<string> {
    if (!this.apiKey || !this.endpoint || !this.region) {
      throw new ASRError('Azure Speech Services 配置不完整', 'azure')
    }

    try {
      const lang = language || 'zh-CN'
      const url = `${this.endpoint}/speech/recognition/conversation/cognitiveservices/v1?language=${lang}`

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'audio/wav',
        },
        body: audioBlob,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const text = data.DisplayText?.trim() || ''

      if (!text) {
        throw new ASRError('转录结果为空', 'azure')
      }

      return text
    } catch (error) {
      if (error instanceof ASRError) {
        throw error
      }
      throw new ASRError(
        `Azure Speech 转录失败: ${error instanceof Error ? error.message : String(error)}`,
        'azure',
        error instanceof Error ? error : undefined
      )
    }
  }
}
