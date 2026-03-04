import type { TTSProvider, TTSOptions } from './index'
import { TTSError } from './index'

/**
 * ElevenLabs TTS 提供商
 */
export class ElevenLabsTTSProvider implements TTSProvider {
  private apiKey: string
  private voiceId: string
  private modelId: string
  private audio: HTMLAudioElement | null = null
  private _isSpeaking = false

  constructor(config: { apiKey: string; voiceId: string; modelId?: string }) {
    this.apiKey = config.apiKey
    this.voiceId = config.voiceId
    this.modelId = config.modelId || 'eleven_multilingual_v2'
  }

  getName(): string {
    return 'ElevenLabs TTS'
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey && !!this.voiceId
  }

  isSpeaking(): boolean {
    return this._isSpeaking
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.apiKey || !this.voiceId) {
      throw new TTSError('ElevenLabs 配置不完整', 'elevenlabs')
    }

    if (!text.trim()) {
      throw new TTSError('文本不能为空', 'elevenlabs')
    }

    // 停止当前播放
    this.stop()

    try {
      this._isSpeaking = true

      // 调用 ElevenLabs TTS API
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail?.message || `HTTP ${response.status}: ${response.statusText}`)
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
        `ElevenLabs TTS 失败: ${error instanceof Error ? error.message : String(error)}`,
        'elevenlabs',
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
        const error = new TTSError('音频播放失败', 'elevenlabs')
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
          'elevenlabs',
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
