import type { ASRProvider } from './index'
import { ASRError } from './index'

type AliyunASRConfig = {
  apiKey: string
  model?: string
  baseURL?: string
  language?: string
  enableITN?: boolean
}

function sanitizeConfigValue(value?: string): string | undefined {
  return value?.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()
}

function isHeaderSafeAscii(value: string): boolean {
  return /^[\x20-\x7E]+$/.test(value)
}

/**
 * Aliyun DashScope Qwen ASR provider via OpenAI-compatible chat completions.
 */
export class AliyunASRProvider implements ASRProvider {
  private apiKey: string
  private model: string
  private baseURL: string
  private language?: string
  private enableITN: boolean

  constructor(config: AliyunASRConfig) {
    this.apiKey = sanitizeConfigValue(config.apiKey) || ''
    this.model = sanitizeConfigValue(config.model) || 'qwen3-asr-flash'
    this.baseURL = (sanitizeConfigValue(config.baseURL) || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(
      /\/$/,
      ''
    )
    this.language = sanitizeConfigValue(config.language)
    this.enableITN = config.enableITN ?? false
  }

  getName(): string {
    return 'Aliyun Qwen ASR'
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  private async blobToDataUrl(audioBlob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
          resolve(reader.result)
          return
        }
        reject(new Error('音频转 Base64 失败'))
      }
      reader.onerror = () => reject(reader.error || new Error('音频读取失败'))
      reader.readAsDataURL(audioBlob)
    })
  }

  async transcribe(audioBlob: Blob, language?: string): Promise<string> {
    if (!this.apiKey) {
      throw new ASRError('阿里云 API Key 未配置', 'aliyun')
    }

    if (!isHeaderSafeAscii(this.apiKey)) {
      throw new ASRError(
        '阿里云 API Key 包含非法字符。请重新粘贴 API Key，并确认不要带中文空格、换行或其他特殊字符。',
        'aliyun'
      )
    }

    try {
      const audioDataUrl = await this.blobToDataUrl(audioBlob)
      const asrLanguage = sanitizeConfigValue(language) || this.language

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: audioDataUrl,
                  },
                },
              ],
            },
          ],
          stream: false,
          asr_options: {
            enable_itn: this.enableITN,
            ...(asrLanguage ? { language: asrLanguage } : {}),
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || errorData.message || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const text =
        data.choices?.[0]?.message?.content?.trim?.() ||
        data.output?.choices?.[0]?.message?.content?.[0]?.text?.trim?.() ||
        ''

      if (!text) {
        throw new ASRError('转录结果为空', 'aliyun')
      }

      return text
    } catch (error) {
      if (error instanceof ASRError) {
        throw error
      }
      throw new ASRError(
        `阿里云 ASR 转录失败: ${error instanceof Error ? error.message : String(error)}`,
        'aliyun',
        error instanceof Error ? error : undefined
      )
    }
  }
}
