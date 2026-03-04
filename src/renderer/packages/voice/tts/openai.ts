import type { TTSProvider, TTSOptions } from './index'
import { TTSError } from './index'

/**
 * OpenAI TTS 提供商
 */
export class OpenAITTSProvider implements TTSProvider {
  private apiKey: string
  private model: string
  private voice: string
  private speed: number
  private baseURL: string
  private audio: HTMLAudioElement | null = null
  private _isSpeaking = false

  constructor(config: {
    apiKey: string
    model?: string
    voice?: string
    speed?: number
    baseURL?: string
  }) {
    this.apiKey = config.apiKey
    this.model = config.model || 'tts-1'
    this.voice = config.voice || 'alloy'
    this.speed = config.speed || 1.0
    this.baseURL = config.baseURL || 'https://api.openai.com/v1'
  }

  getName(): string {
    return 'OpenAI TTS'
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  isSpeaking(): boolean {
    return this._isSpeaking
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.apiKey) {
      throw new TTSError('OpenAI API Key 未配置', 'openai')
    }

    if (!text.trim()) {
      throw new TTSError('文本不能为空', 'openai')
    }

    // 停止当前播放
    this.stop()

    try {
      this._isSpeaking = true

      // 调用 OpenAI TTS API
      const response = await fetch(`${this.baseURL}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
          voice: options?.voice || this.voice,
          speed: options?.rate || this.speed,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`)
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
        `OpenAI TTS 失败: ${error instanceof Error ? error.message : String(error)}`,
        'openai',
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
        const error = new TTSError('音频播放失败', 'openai')
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
          'openai',
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
