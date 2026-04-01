import type { DoubaoASRSessionConfig, DoubaoASRSessionEvent } from '@shared/electron-types'
import type { ASRProvider, StreamingASRProvider, StreamingASRSession, StreamingASRSessionEvent } from './index'
import { ASRError } from './index'

type DoubaoASRConfig = DoubaoASRSessionConfig

function mapSessionEvent(event: DoubaoASRSessionEvent): StreamingASRSessionEvent {
  if (event.type === 'error') {
    return {
      type: 'error',
      message: event.message || '豆包实时识别失败',
    }
  }

  return {
    type: event.type,
    text: event.text || '',
  }
}

export class DoubaoASRProvider implements ASRProvider, StreamingASRProvider {
  private appId: string
  private accessKey: string
  private resourceId: string
  private model: string
  private baseURL: string

  constructor(config: DoubaoASRConfig) {
    this.appId = config.appId?.trim() || ''
    this.accessKey = config.accessKey?.trim() || config.apiKey?.trim() || ''
    this.resourceId = config.resourceId?.trim() || 'volc.bigasr.sauc.duration'
    this.model = config.model?.trim() || 'bigmodel'
    this.baseURL = config.baseURL?.trim() || 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'
  }

  getName(): string {
    return 'Doubao Streaming ASR'
  }

  async isAvailable(): Promise<boolean> {
    return !!this.appId && !!this.accessKey && !!this.model
  }

  async transcribe(): Promise<string> {
    throw new ASRError('Doubao ASR 仅支持流式录音会话', 'doubao')
  }

  async createStreamingSession(options: {
    onEvent: (event: StreamingASRSessionEvent) => void
  }): Promise<StreamingASRSession> {
    if (!window.electronAPI) {
      throw new ASRError('当前环境不支持豆包实时语音识别', 'doubao')
    }

    if (!this.appId || !this.accessKey) {
      throw new ASRError('豆包 App Key / Access Key 未配置', 'doubao')
    }

    const { sessionId } = await window.electronAPI.createDoubaoASRSession({
      appId: this.appId,
      accessKey: this.accessKey,
      resourceId: this.resourceId,
      model: this.model,
      baseURL: this.baseURL,
    })

    const unsubscribe = window.electronAPI.onDoubaoASREvent((event) => {
      if (event.sessionId !== sessionId) {
        return
      }
      options.onEvent(mapSessionEvent(event))
    })

    let closed = false

    return {
      appendAudio: async (chunk: Uint8Array) => {
        if (closed) {
          return
        }
        await window.electronAPI.appendDoubaoASRAudio(sessionId, chunk)
      },
      commit: async () => {
        if (closed) {
          return
        }
        await window.electronAPI.commitDoubaoASRSession(sessionId)
      },
      close: async () => {
        if (closed) {
          return
        }
        closed = true
        unsubscribe()
        await window.electronAPI.closeDoubaoASRSession(sessionId)
      },
    }
  }
}
