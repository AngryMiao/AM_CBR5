import { pipeline, type PipelineType, env } from '@xenova/transformers'
import type { ASRProvider } from './index'
import { ASRError } from './index'
import type { WhisperModelSize } from '@shared/types/voice'

// 用于存储当前的 fetch 拦截器清理函数
let cleanupFetchInterceptor: (() => void) | null = null

/**
 * 安装 fetch 拦截器，将 HuggingFace/镜像站的请求重定向到本地 HTTP 服务器
 * 这是因为 Vite 预打包会导致 @xenova/transformers 的 env 对象引用不一致，
 * 直接修改 env.remoteHost 无法生效，所以我们在 fetch 层面拦截。
 */
function installFetchInterceptor(localModelPath: string) {
  // 先清理旧的拦截器
  cleanupFetchInterceptor?.()

  const originalFetch = window.fetch
  const normalizedLocal = localModelPath.endsWith('/') ? localModelPath : `${localModelPath}/`

  // 匹配 HuggingFace 和常见镜像站的模型请求
  // 格式: https://huggingface.co/Xenova/whisper-base/resolve/main/config.json
  const modelUrlPattern = /^https?:\/\/[^/]+\/(Xenova\/whisper-[^/]+\/resolve\/main\/.+)$/

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const match = url.match(modelUrlPattern)
    if (match) {
      const modelPath = match[1]
      const newUrl = `${normalizedLocal}${modelPath}`
      console.log(`[Whisper] Intercepted fetch: ${url} -> ${newUrl}`)
      if (typeof input === 'string') {
        return originalFetch.call(window, newUrl, init)
      }
      return originalFetch.call(window, new Request(newUrl, init), init)
    }
    return originalFetch.call(window, input, init)
  } as typeof window.fetch

  cleanupFetchInterceptor = () => {
    window.fetch = originalFetch
    cleanupFetchInterceptor = null
  }

  console.log(`[Whisper] Fetch interceptor installed, redirecting to: ${normalizedLocal}`)
}

export type WhisperDownloadProgress = {
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready'
  name?: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}

/**
 * Whisper 本地 ASR 提供商
 * 使用 @xenova/transformers 在浏览器中运行 Whisper 模型
 */
export class WhisperLocalProvider implements ASRProvider {
  private pipeline: any = null
  private modelSize: WhisperModelSize
  private isInitializing = false
  private initPromise: Promise<void> | null = null
  private remoteHost?: string
  private localModelPath?: string

  constructor(modelSize: WhisperModelSize = 'base', remoteHost?: string, localModelPath?: string) {
    this.modelSize = modelSize
    this.remoteHost = remoteHost
    this.localModelPath = localModelPath

    // 如果配置了本地模型路径，安装 fetch 拦截器
    if (localModelPath && localModelPath.startsWith('http')) {
      installFetchInterceptor(localModelPath)
    }

    // 仍然尝试设置 env（可能对某些情况有效）
    env.allowRemoteModels = true
    env.allowLocalModels = false
    env.useBrowserCache = true
    if (localModelPath && localModelPath.startsWith('http')) {
      env.remoteHost = localModelPath.endsWith('/') ? localModelPath : `${localModelPath}/`
    } else if (remoteHost) {
      env.remoteHost = remoteHost.endsWith('/') ? remoteHost : `${remoteHost}/`
    }

    console.log(`[Whisper] Provider initialized:`, { modelSize, remoteHost, localModelPath })
  }

  getName(): string {
    return 'Whisper Local'
  }

  async isAvailable(): Promise<boolean> {
    try {
      return typeof WebAssembly !== 'undefined' && 'indexedDB' in window
    } catch {
      return false
    }
  }

  async preload(onProgress?: (progress: WhisperDownloadProgress) => void): Promise<void> {
    return this.initialize(onProgress)
  }

  async downloadToLocal(
    targetPath: string,
    onProgress?: (progress: { file: string; loaded: number; total: number; percent: number }) => void
  ): Promise<void> {
    const modelName = `Xenova/whisper-${this.modelSize}`
    const remoteHost = this.remoteHost || 'https://huggingface.co'
    await window.electronAPI?.invoke('whisper:downloadModel', {
      modelName,
      remoteHost,
      targetPath,
      onProgress,
    })
  }

  private async initialize(onProgress?: (progress: WhisperDownloadProgress) => void): Promise<void> {
    if (this.pipeline) return
    if (this.isInitializing && this.initPromise) {
      return this.initPromise
    }

    this.isInitializing = true
    this.initPromise = (async () => {
      try {
        // 确保 fetch 拦截器已安装
        if (this.localModelPath && this.localModelPath.startsWith('http')) {
          installFetchInterceptor(this.localModelPath)
        }

        // 清除 transformers.js 的 Web Cache，防止缓存了错误的 HTML 响应
        if (typeof caches !== 'undefined') {
          const cacheNames = await caches.keys()
          for (const name of cacheNames) {
            if (name.includes('transformers') || name.includes('onnx')) {
              console.log(`[Whisper] Deleting cache: ${name}`)
              await caches.delete(name)
            }
          }
          // 也尝试清除默认缓存中的 whisper 相关条目
          for (const name of cacheNames) {
            try {
              const cache = await caches.open(name)
              const keys = await cache.keys()
              for (const req of keys) {
                if (req.url.includes('whisper') || req.url.includes('Xenova')) {
                  console.log(`[Whisper] Deleting cached entry: ${req.url}`)
                  await cache.delete(req)
                }
              }
            } catch {
              // ignore
            }
          }
        }

        const modelName = `Xenova/whisper-${this.modelSize}`
        console.log(`[Whisper] Loading model: ${modelName}`)

        this.pipeline = await pipeline('automatic-speech-recognition' as PipelineType, modelName, {
          progress_callback: onProgress,
        } as any)

        console.log('[Whisper] Model loaded successfully')
      } catch (error) {
        console.error('[Whisper] Failed to load model:', error)
        this.pipeline = null
        this.initPromise = null

        let errorMessage = error instanceof Error ? error.message : String(error)
        if (errorMessage.includes('<!DOCTYPE')) {
          errorMessage = '网络请求被拦截或返回了 HTML 页面。请检查：\n1. 本地模型服务器是否已启动\n2. 是否填写了正确的地址\n3. 网络是否可以访问该地址'
        }

        throw new ASRError(`无法加载 Whisper 模型: ${errorMessage}`, 'whisper-local', error instanceof Error ? error : undefined)
      } finally {
        this.isInitializing = false
      }
    })()

    return this.initPromise
  }

  private async blobToAudioData(blob: Blob): Promise<Float32Array> {
    const arrayBuffer = await blob.arrayBuffer()
    const audioContext = new AudioContext({ sampleRate: 16000 })
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const audioData = audioBuffer.getChannelData(0)
    await audioContext.close()
    return audioData
  }

  async transcribe(audioBlob: Blob, language?: string): Promise<string> {
    try {
      await this.initialize()

      if (!this.pipeline) {
        throw new ASRError('Whisper 模型未初始化', 'whisper-local')
      }

      const audioData = await this.blobToAudioData(audioBlob)

      const result = await this.pipeline(audioData, {
        language: language || 'chinese',
        task: 'transcribe',
        return_timestamps: false,
      })

      const text = result.text?.trim() || ''

      if (!text) {
        throw new ASRError('转录结果为空', 'whisper-local')
      }

      return text
    } catch (error) {
      if (error instanceof ASRError) {
        throw error
      }
      throw new ASRError(
        `Whisper 转录失败: ${error instanceof Error ? error.message : String(error)}`,
        'whisper-local',
        error instanceof Error ? error : undefined
      )
    }
  }

  async setModelSize(size: WhisperModelSize): Promise<void> {
    if (this.modelSize === size) return
    this.modelSize = size
    this.pipeline = null
    this.isInitializing = false
    this.initPromise = null
  }

  dispose(): void {
    this.pipeline = null
    this.isInitializing = false
    this.initPromise = null
    cleanupFetchInterceptor?.()
  }
}