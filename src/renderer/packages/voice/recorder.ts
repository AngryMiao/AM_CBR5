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
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private scriptProcessor: ScriptProcessorNode | null = null
  private dataArray: Uint8Array<ArrayBuffer> | null = null
  private animationFrameId: number | null = null
  private onAudioLevelChange: ((level: number) => void) | null = null
  private onAudioChunk: ((chunk: Uint8Array) => void) | null = null
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
    onAudioChunk?: (chunk: Uint8Array) => void
    onSilenceDetected?: () => void
    silenceThreshold?: number
    silenceDuration?: number
    microphoneDeviceId?: string
  }): Promise<void> {
    try {
      const requestedDeviceId = options?.microphoneDeviceId
      const requestedConstraints = this.buildAudioConstraints(requestedDeviceId)

      console.info('[VoiceRecorder] Requesting microphone stream', {
        requestedDeviceId: requestedDeviceId ?? 'system-default',
        requestedConstraints,
      })

      // 请求麦克风权限
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: requestedConstraints,
        })
      } catch (error) {
        const errorName = error instanceof Error ? error.name : (error as { name?: string } | null | undefined)?.name

        if (requestedDeviceId && (errorName === 'NotFoundError' || errorName === 'OverconstrainedError')) {
          console.warn('[VoiceRecorder] Requested microphone unavailable, falling back to system default', {
            requestedDeviceId,
            errorName,
          })
          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: this.buildAudioConstraints(),
          })
        } else {
          throw error
        }
      }

      await this.logResolvedMicrophone(requestedDeviceId)

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
      }
      if (options?.onAudioChunk) {
        this.onAudioChunk = options.onAudioChunk
      }
      if (options?.onAudioLevelChange || options?.onAudioChunk) {
        this.setupAudioAnalysis(Boolean(options?.onAudioChunk))
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
  private setupAudioAnalysis(enableAudioChunk: boolean = false): void {
    if (!this.stream) return

    try {
      this.audioContext = new AudioContext()
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.analyser = this.audioContext.createAnalyser()
      this.analyser.fftSize = 256
      const bufferLength = this.analyser.frequencyBinCount
      this.dataArray = new Uint8Array(new ArrayBuffer(bufferLength))

      this.sourceNode.connect(this.analyser)

      if (enableAudioChunk && typeof this.audioContext.createScriptProcessor === 'function') {
        this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1)
        this.scriptProcessor.onaudioprocess = (event) => {
          const chunk = this.buildPCMChunk(event.inputBuffer.getChannelData(0), this.audioContext?.sampleRate || 16000)
          if (chunk.byteLength > 0) {
            this.onAudioChunk?.(chunk)
          }
        }
        this.sourceNode.connect(this.scriptProcessor)
        this.scriptProcessor.connect(this.audioContext.destination)
      }

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
      this.scriptProcessor?.disconnect()
      this.sourceNode?.disconnect()
      this.audioContext.close()
      this.audioContext = null
    }

    // 停止媒体流
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    this.analyser = null
    this.sourceNode = null
    this.scriptProcessor = null
    this.dataArray = null
    this.onAudioLevelChange = null
    this.onAudioChunk = null
    this.onSilenceDetected = null
  }

  private buildPCMChunk(input: Float32Array, sampleRate: number): Uint8Array {
    const normalizedSamples = sampleRate === 16000 ? input : this.resampleTo16k(input, sampleRate)
    const pcm = new Int16Array(normalizedSamples.length)

    for (let index = 0; index < normalizedSamples.length; index += 1) {
      const clamped = Math.max(-1, Math.min(1, normalizedSamples[index]))
      pcm[index] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
    }

    return new Uint8Array(pcm.buffer.slice(0))
  }

  private resampleTo16k(input: Float32Array, sourceRate: number): Float32Array {
    if (sourceRate <= 16000) {
      return input
    }

    const ratio = sourceRate / 16000
    const outputLength = Math.max(1, Math.round(input.length / ratio))
    const output = new Float32Array(outputLength)

    for (let index = 0; index < outputLength; index += 1) {
      const position = index * ratio
      const leftIndex = Math.floor(position)
      const rightIndex = Math.min(leftIndex + 1, input.length - 1)
      const weight = position - leftIndex
      output[index] = input[leftIndex] * (1 - weight) + input[rightIndex] * weight
    }

    return output
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

  private async logResolvedMicrophone(requestedDeviceId?: string): Promise<void> {
    const tracks = this.stream && typeof this.stream.getAudioTracks === 'function' ? this.stream.getAudioTracks() : []
    const track = tracks[0]
    if (!track) {
      console.warn('[VoiceRecorder] No audio track available after getUserMedia')
      return
    }

    const trackSettings = typeof track.getSettings === 'function' ? track.getSettings() : {}
    const actualDeviceId = typeof trackSettings.deviceId === 'string' ? trackSettings.deviceId : undefined
    const actualGroupId = typeof trackSettings.groupId === 'string' ? trackSettings.groupId : undefined
    const actualLabel = track.label || undefined

    let requestedDeviceLabel: string | undefined
    let actualEnumeratedLabel: string | undefined

    try {
      const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
      if (mediaDevices?.enumerateDevices) {
        const devices = await mediaDevices.enumerateDevices()
        const audioInputs = devices.filter((device) => device.kind === 'audioinput')
        requestedDeviceLabel = requestedDeviceId
          ? audioInputs.find((device) => device.deviceId === requestedDeviceId)?.label
          : undefined
        actualEnumeratedLabel =
          audioInputs.find((device) => device.deviceId === actualDeviceId)?.label ||
          audioInputs.find((device) => device.label === actualLabel)?.label
      }
    } catch (error) {
      console.warn('[VoiceRecorder] Failed to enumerate audio input devices for logging', error)
    }

    console.info('[VoiceRecorder] Microphone stream resolved', {
      requestedDeviceId: requestedDeviceId ?? 'system-default',
      requestedDeviceLabel: requestedDeviceLabel ?? null,
      actualTrackDeviceId: actualDeviceId ?? null,
      actualTrackLabel: actualLabel ?? null,
      actualEnumeratedLabel: actualEnumeratedLabel ?? null,
      actualGroupId: actualGroupId ?? null,
      readyState: track.readyState,
    })
  }

  /**
   * 检查浏览器是否支持录音
   */
  static isSupported(): boolean {
    return !!(
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof window !== 'undefined' &&
      typeof window.MediaRecorder !== 'undefined'
    )
  }
}
