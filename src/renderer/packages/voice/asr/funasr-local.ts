import type { ASRProvider } from './index'
import { ASRError } from './index'

type FunASRResponse =
  | string
  | {
      text?: string
      result?: string
      data?: { text?: string; result?: string }
      [key: string]: unknown
    }

type FunASRLocalConfig = {
  baseURL?: string
  model?: string
  language?: string
  healthPaths?: string[]
  transcribePaths?: string[]
  responseTextPaths?: string[]
  requestTemplate?: {
    fileField?: string
    modelField?: string
    languageField?: string
    vadField?: string
    punctuationField?: string
    hotwordsField?: string
  }
  enableVAD?: boolean
  enablePunctuation?: boolean
  hotwords?: string[]
  timeoutMs?: number
}

/**
 * FunASR 本地服务 ASR 提供商
 * 约定服务提供 /transcribe 或 /asr 接口（multipart/form-data）。
 */
export class FunASRLocalProvider implements ASRProvider {
  private baseURL: string
  private model: string
  private language: string
  private healthPaths: string[]
  private transcribePaths: string[]
  private responseTextPaths: string[]
  private requestTemplate: Required<NonNullable<FunASRLocalConfig['requestTemplate']>>
  private enableVAD: boolean
  private enablePunctuation: boolean
  private hotwords: string[]
  private timeoutMs: number

  constructor(config?: FunASRLocalConfig) {
    this.baseURL = (config?.baseURL || 'http://127.0.0.1:10095').replace(/\/$/, '')
    this.model = config?.model || 'paraformer-zh-streaming'
    this.language = config?.language || 'zh'
    this.healthPaths = this.normalizePaths(config?.healthPaths || ['/health', '/status'])
    this.transcribePaths = this.normalizePaths(config?.transcribePaths || ['/transcribe', '/asr'])
    this.responseTextPaths = config?.responseTextPaths?.length
      ? config.responseTextPaths
      : ['text', 'result', 'data.text', 'data.result']
    this.requestTemplate = {
      fileField: config?.requestTemplate?.fileField || 'file',
      modelField: config?.requestTemplate?.modelField || 'model',
      languageField: config?.requestTemplate?.languageField || 'language',
      vadField: config?.requestTemplate?.vadField || 'enable_vad',
      punctuationField: config?.requestTemplate?.punctuationField || 'enable_punctuation',
      hotwordsField: config?.requestTemplate?.hotwordsField || 'hotwords',
    }
    this.enableVAD = config?.enableVAD ?? true
    this.enablePunctuation = config?.enablePunctuation ?? true
    this.hotwords = config?.hotwords || []
    this.timeoutMs = config?.timeoutMs ?? 30000
  }

  getName(): string {
    return 'FunASR Local'
  }

  async isAvailable(): Promise<boolean> {
    for (const endpoint of this.healthPaths) {
      try {
        const response = await fetch(`${this.baseURL}${endpoint}`, { method: 'GET' })
        if (response.ok) return true
      } catch {
        // ignore and try next endpoint
      }
    }
    return false
  }

  async transcribe(audioBlob: Blob, language?: string): Promise<string> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const formData = new FormData()
      formData.append(this.requestTemplate.fileField, audioBlob, 'audio.webm')
      formData.append(this.requestTemplate.modelField, this.model)
      formData.append(this.requestTemplate.languageField, language || this.language)
      formData.append(this.requestTemplate.vadField, String(this.enableVAD))
      formData.append(this.requestTemplate.punctuationField, String(this.enablePunctuation))
      if (this.hotwords.length > 0) {
        formData.append(this.requestTemplate.hotwordsField, this.hotwords.join(','))
      }

      let lastError = ''

      for (const endpoint of this.transcribePaths) {
        try {
          const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          })

          if (!response.ok) {
            const errorText = await response.text().catch(() => '')
            lastError = `HTTP ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`
            continue
          }

          const contentType = response.headers.get('content-type') || ''
          const data: FunASRResponse = contentType.includes('application/json')
            ? ((await response.json()) as FunASRResponse)
            : await response.text()

          const text = this.extractText(data)
          if (!text) {
            throw new ASRError('转录结果为空', 'funasr-local')
          }
          return text
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error)
        }
      }

      throw new Error(lastError || 'FunASR 接口不可用')
    } catch (error) {
      if (error instanceof ASRError) {
        throw error
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ASRError(`FunASR 请求超时（>${this.timeoutMs}ms）`, 'funasr-local', error)
      }
      throw new ASRError(
        `FunASR 转录失败: ${error instanceof Error ? error.message : String(error)}`,
        'funasr-local',
        error instanceof Error ? error : undefined
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  private extractText(data: FunASRResponse): string {
    if (typeof data === 'string') {
      return data.trim()
    }
    for (const path of this.responseTextPaths) {
      const value = this.getByPath(data, path)
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
    return ''
  }

  private normalizePaths(paths: string[]): string[] {
    return paths
      .map((path) => path.trim())
      .filter(Boolean)
      .map((path) => (path.startsWith('/') ? path : `/${path}`))
  }

  private getByPath(obj: unknown, path: string): unknown {
    const parts = path.split('.').map((part) => part.trim()).filter(Boolean)
    let current: any = obj
    for (const part of parts) {
      if (current == null) return undefined
      current = current[part]
    }
    return current
  }
}
