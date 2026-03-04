import type { TTSProvider, TTSOptions } from './index'
import { TTSError } from './index'

/**
 * 浏览器原生 TTS 提供商
 * 使用 Web Speech API (speechSynthesis)
 */
export class BrowserTTSProvider implements TTSProvider {
  private synthesis: SpeechSynthesis
  private currentUtterance: SpeechSynthesisUtterance | null = null
  private defaultVoice: string | undefined
  private defaultRate: number
  private defaultPitch: number
  private defaultVolume: number

  constructor(config?: { voice?: string; rate?: number; pitch?: number; volume?: number }) {
    this.synthesis = window.speechSynthesis
    this.defaultVoice = config?.voice
    this.defaultRate = config?.rate ?? 1
    this.defaultPitch = config?.pitch ?? 1
    this.defaultVolume = config?.volume ?? 1
  }

  getName(): string {
    return 'Browser TTS'
  }

  async isAvailable(): Promise<boolean> {
    return 'speechSynthesis' in window
  }

  isSpeaking(): boolean {
    return this.synthesis.speaking
  }

  /**
   * 获取可用的语音列表
   */
  getVoices(): SpeechSynthesisVoice[] {
    return this.synthesis.getVoices()
  }

  /**
   * 根据名称查找语音
   */
  private findVoice(voiceName?: string): SpeechSynthesisVoice | null {
    const voices = this.getVoices()
    if (!voiceName) {
      // 返回默认中文语音
      return voices.find((v) => v.lang.startsWith('zh')) || voices[0] || null
    }
    return voices.find((v) => v.name === voiceName) || null
  }

  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!text.trim()) {
      throw new TTSError('文本不能为空', 'browser')
    }

    // 停止当前播放
    this.stop()

    return new Promise((resolve, reject) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text)

        // 设置语音
        const voice = this.findVoice(options?.voice || this.defaultVoice)
        if (voice) {
          utterance.voice = voice
        }

        // 设置参数
        utterance.rate = options?.rate ?? this.defaultRate
        utterance.pitch = options?.pitch ?? this.defaultPitch
        utterance.volume = options?.volume ?? this.defaultVolume

        // 设置事件监听器
        utterance.onend = () => {
          this.currentUtterance = null
          options?.onEnd?.()
          resolve()
        }

        utterance.onerror = (event) => {
          this.currentUtterance = null
          const error = new TTSError(`浏览器 TTS 播放失败: ${event.error}`, 'browser')
          options?.onError?.(error)
          reject(error)
        }

        utterance.onboundary = (event) => {
          // 计算播放进度
          if (options?.onProgress && text.length > 0) {
            const progress = event.charIndex / text.length
            options.onProgress(progress)
          }
        }

        this.currentUtterance = utterance
        this.synthesis.speak(utterance)
      } catch (error) {
        const ttsError = new TTSError(
          `浏览器 TTS 初始化失败: ${error instanceof Error ? error.message : String(error)}`,
          'browser',
          error instanceof Error ? error : undefined
        )
        options?.onError?.(ttsError)
        reject(ttsError)
      }
    })
  }

  stop(): void {
    if (this.synthesis.speaking) {
      this.synthesis.cancel()
    }
    this.currentUtterance = null
  }

  pause(): void {
    if (this.synthesis.speaking && !this.synthesis.paused) {
      this.synthesis.pause()
    }
  }

  resume(): void {
    if (this.synthesis.paused) {
      this.synthesis.resume()
    }
  }
}
