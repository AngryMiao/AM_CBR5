/**
 * 录音状态
 */
export type RecordingState = 'inactive' | 'recording' | 'paused'

/**
 * 语音录制器
 * 使用 MediaRecorder API 录制音频，并提供实时音频电平分析
 */
export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private dataArray: Uint8Array | null = null
  private animationFrameId: number | null = null
  private onAudioLevelChange: ((level: number) => void) | null = null
  private silenceDetectionTimer: NodeJS.Timeout | null = null
  private onSilenceDetected: (() => void) | null = null
  private silenceThreshold: number = 0.01
  private silenceDuration: number = 1500

  /**
   * 开始录音
   * @param options 录音选项
   */
  async start(options?: {
    onAudioLevelChange?: (level: number) => void
    onSilenceDetected?: () => void
    silenceThreshold?: number
    silenceDuration?: number
    microphoneDeviceId?: string
  }): Promise<void> {
    try {
      // 请求麦克风权限
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: this.buildAudioConstraints(options?.microphoneDeviceId),
        })
      } catch (error) {
        const errorName =
          error instanceof Error ? error.name : (error as { name?: string } | null | undefined)?.name

        if (
          options?.microphoneDeviceId &&
          (errorName === 'NotFoundError' || errorName === 'OverconstrainedError')
        ) {
          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: this.buildAudioConstraints(),
          })
        } else {
          throw error
        }
      }

      // 创建 MediaRecorder
      const mimeType = this.getSupportedMimeType()
      this.mediaRecorder = new MediaRecorder(this.stream, { mimeType })

      this.audioChunks = []

      // 监听数据事件
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      // 设置音频分析
      if (options?.onAudioLevelChange) {
        this.onAudioLevelChange = options.onAudioLevelChange
        this.setupAudioAnalysis()
      }

      // 设置静音检测
      if (options?.onSilenceDetected) {
        this.onSilenceDetected = options.onSilenceDetected
        this.silenceThreshold = options.silenceThreshold ?? 0.01
        this.silenceDuration = options.silenceDuration ?? 1500
      }

      // 开始录音
      this.mediaRecorder.start(100) // 每 100ms 触发一次 dataavailable
    } catch (error) {
      console.error('Failed to start recording:', error)
      throw new Error(`无法访问麦克风: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 停止录音
   * @returns 录制的音频 Blob
   */
  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not initialized'))
        return
      }

      this.mediaRecorder.onstop = () => {
        const mimeType = this.mediaRecorder?.mimeType || 'audio/webm'
        const audioBlob = new Blob(this.audioChunks, { type: mimeType })
        this.cleanup()
        resolve(audioBlob)
      }

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        this.cleanup()
        reject(new Error('Recording failed'))
      }

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop()
      }
    })
  }

  /**
   * 暂停录音
   */
  pause(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause()
    }
  }

  /**
   * 恢复录音
   */
  resume(): void {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume()
    }
  }

  /**
   * 获取当前录音状态
   */
  getState(): RecordingState {
    return this.mediaRecorder?.state || 'inactive'
  }

  /**
   * 获取当前累积的音频数据（用于流式识别）
   * @returns 当前累积的音频 Blob，如果未在录音则返回 null
   */
  getCurrentAudioBlob(): Blob | null {
    if (!this.mediaRecorder || this.audioChunks.length === 0) {
      return null
    }
    const mimeType = this.mediaRecorder.mimeType || 'audio/webm'
    return new Blob(this.audioChunks, { type: mimeType })
  }

  /**
   * 获取当前音频电平（0-1）
   */
  getAudioLevel(): number {
    if (!this.analyser || !this.dataArray) {
      return 0
    }

    this.analyser.getByteFrequencyData(this.dataArray)

    // 计算平均音量
    let sum = 0
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i]
    }
    const average = sum / this.dataArray.length
    const level = average / 255 // 归一化到 0-1

    return level
  }

  /**
   * 设置音频分析
   */
  private setupAudioAnalysis(): void {
    if (!this.stream) return

    try {
      this.audioContext = new AudioContext()
      const source = this.audioContext.createMediaStreamSource(this.stream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      const bufferLength = this.analyser.frequencyBinCount
      this.dataArray = new Uint8Array(bufferLength)

      source.connect(this.analyser)

      // 开始分析循环
      this.startAnalysisLoop()
    } catch (error) {
      console.error('Failed to setup audio analysis:', error)
    }
  }

  /**
   * 开始音频分析循环
   */
  private startAnalysisLoop(): void {
    const analyze = () => {
      if (!this.analyser || !this.dataArray) return

      const level = this.getAudioLevel()

      // 触发音频电平回调
      if (this.onAudioLevelChange) {
        this.onAudioLevelChange(level)
      }

      // 静音检测
      if (this.onSilenceDetected) {
        if (level < this.silenceThreshold) {
          // 检测到静音，启动计时器
          if (!this.silenceDetectionTimer) {
            this.silenceDetectionTimer = setTimeout(() => {
              if (this.onSilenceDetected) {
                this.onSilenceDetected()
              }
            }, this.silenceDuration)
          }
        } else {
          // 有声音，清除计时器
          if (this.silenceDetectionTimer) {
            clearTimeout(this.silenceDetectionTimer)
            this.silenceDetectionTimer = null
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(analyze)
    }

    analyze()
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    // 停止分析循环
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    // 清除静音检测计时器
    if (this.silenceDetectionTimer) {
      clearTimeout(this.silenceDetectionTimer)
      this.silenceDetectionTimer = null
    }

    // 关闭音频上下文
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    // 停止媒体流
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    this.analyser = null
    this.dataArray = null
    this.onAudioLevelChange = null
    this.onSilenceDetected = null
  }

  /**
   * 获取支持的 MIME 类型
   */
  private getSupportedMimeType(): string {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/mpeg']

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }

    return 'audio/webm' // 默认
  }

  private buildAudioConstraints(microphoneDeviceId?: string): MediaTrackConstraints {
    return {
      ...(microphoneDeviceId ? { deviceId: { exact: microphoneDeviceId } } : {}),
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
  }

  /**
   * 检查浏览器是否支持录音
   */
  static isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)
  }
}
