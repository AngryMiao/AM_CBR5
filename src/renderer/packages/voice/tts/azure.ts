import type { TTSProvider, TTSOptions } from './index'
import { TTSError } from './index'

/**
 * Azure Speech Services TTS 提供商
 */
export class AzureTTSProvider implements TTSProvider {
  private apiKey: string
  private endpoint: string
  private voice: string
  private region: string
  private audio: HTMLAudioElement | null = null
  private _isSpeaking = false

  constructor(config: { apiKey: string; endpoint: string; voice?: string; region: string }) {
    this.apiKey = config.apiKey
    this.endpoint = config.endpoint
    this.voice = config.voice || 'zh-CN-XiaoxiaoNeural'
    this.region = config.region
  }

  getName(): string {
    return 'Azure TTS'
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey && !!this.endpoint && !!this.region
  }

  isSpeaking(): boolean {
    return this._isSpeaking
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.apiKey || !this.endpoint || !this.region) {
      throw new TTSError('Azure Speech Services 配置不完整', 'azure')
    }

    if (!text.trim()) {
      throw new TTSError('文本不能为空', 'azure')
    }

    // 停止当前播放
    this.stop()

    try {
      this._isSpeaking = true

      const voice = options?.voice || this.voice
      const rate = options?.rate ? `${(options.rate - 1) * 100}%` : '0%'
      const pitch = options?.pitch ? `${(options.pitch - 1) * 50}%` : '0%'

      // 构建 SSML
      const ssml = `
        <speak version='1.0' xml:lang='zh-CN'>
          <voice name='${voice}'>
            <prosody rate='${rate}' pitch='${pitch}'>
              ${text}
            </prosody>
          </voice>
        </speak>
      `.trim()

      // 调用 Azure TTS API
      const response = await fetch(`${this.endpoint}/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        },
        body: ssml,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(errorText || `HTTP ${response.status}: ${response.statusText}`)
      }

      // 获取音频数据
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      // 播放音频
      await this.playAudio(audioUrl, options)

      // 清理 URL
      URL.revokeObjectURL(audioUrl)
    } catch (error) {
      this._isSpeaking = false
      if (error instanceof TTSError) {
        options?.onError?.(error)
        throw error
      }
      const ttsError = new TTSError(
        `Azure TTS 失败: ${error instanceof Error ? error.message : String(error)}`,
        'azure',
        error instanceof Error ? error : undefined
      )
      options?.onError?.(ttsError)
      throw ttsError
    }
  }

  private async playAudio(audioUrl: string, options?: TTSOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.audio = new Audio(audioUrl)

      if (options?.volume !== undefined) {
        this.audio.volume = options.volume
      }

      this.audio.onended = () => {
        this._isSpeaking = false
        this.audio = null
        options?.onEnd?.()
        resolve()
      }

      this.audio.onerror = (event) => {
        this._isSpeaking = false
        this.audio = null
        const error = new TTSError('音频播放失败', 'azure')
        options?.onError?.(error)
        reject(error)
      }

      this.audio.ontimeupdate = () => {
        if (this.audio && options?.onProgress) {
          const progress = this.audio.currentTime / this.audio.duration
          options.onProgress(progress)
        }
      }

      this.audio.play().catch((error) => {
        this._isSpeaking = false
        this.audio = null
        const ttsError = new TTSError(
          `音频播放失败: ${error instanceof Error ? error.message : String(error)}`,
          'azure',
          error instanceof Error ? error : undefined
        )
        options?.onError?.(ttsError)
        reject(ttsError)
      })
    })
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.currentTime = 0
      this.audio = null
    }
    this._isSpeaking = false
  }

  pause(): void {
    if (this.audio && !this.audio.paused) {
      this.audio.pause()
    }
  }

  resume(): void {
    if (this.audio && this.audio.paused) {
      this.audio.play().catch((error) => {
        console.error('Failed to resume audio:', error)
      })
    }
  }
}
