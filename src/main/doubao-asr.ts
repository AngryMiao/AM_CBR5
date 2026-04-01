import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { gunzipSync, gzipSync } from 'node:zlib'
import log from 'electron-log/main'
import type { DoubaoASRSessionConfig, DoubaoASRSessionEvent, DoubaoASRSessionHandle } from 'src/shared/electron-types'
import type WebSocketClientType from 'ws'

type SessionEmitter = (event: DoubaoASRSessionEvent) => void

type ActiveSession = {
  emit: SessionEmitter
  readyPromise: Promise<void>
  ws: WebSocketClientType
  closedByClient: boolean
  completed: boolean
}

type ParsedFrame = {
  flags: number
  messageType: number
  payload: unknown
  sequence?: number
  errorCode?: number
}

type TranscriptSegment = {
  definite: boolean
  text: string
}

const DEFAULT_BASE_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'
const DEFAULT_MODEL = 'bigmodel'
const DEFAULT_RESOURCE_ID = 'volc.bigasr.sauc.duration'
const SUCCESS_CODE = 20000000

const PROTOCOL_VERSION = 0x1
const HEADER_SIZE_WORDS = 0x1
const SERIALIZATION_NONE = 0x0
const SERIALIZATION_JSON = 0x1
const COMPRESSION_GZIP = 0x1
const MESSAGE_TYPE_FULL_CLIENT_REQUEST = 0x1
const MESSAGE_TYPE_AUDIO_ONLY_REQUEST = 0x2
const MESSAGE_TYPE_FULL_SERVER_RESPONSE = 0x9
const MESSAGE_TYPE_ERROR_RESPONSE = 0xf
const MESSAGE_FLAG_NONE = 0x0
const MESSAGE_FLAG_HAS_POSITIVE_SEQUENCE = 0x1
const MESSAGE_FLAG_LAST_PACKAGE = 0x2
const MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE = 0x3

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()
const require = createRequire(__filename)
const WebSocket = require('ws') as typeof WebSocketClientType

function writeInt32BE(target: Uint8Array, value: number, offset: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setInt32(offset, value, false)
}

function writeUInt32BE(target: Uint8Array, value: number, offset: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, false)
}

function readInt32BE(target: Uint8Array, offset: number) {
  return new DataView(target.buffer, target.byteOffset, target.byteLength).getInt32(offset, false)
}

function readUInt32BE(target: Uint8Array, offset: number) {
  return new DataView(target.buffer, target.byteOffset, target.byteLength).getUint32(offset, false)
}

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }

  return result
}

function buildHeader(messageType: number, flags: number, serialization: number, compression: number) {
  return Uint8Array.from([
    (PROTOCOL_VERSION << 4) | HEADER_SIZE_WORDS,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0x00,
  ])
}

function buildFrame(options: {
  compression: number
  flags: number
  messageType: number
  payload: Uint8Array
  sequence?: number
  serialization: number
}) {
  const header = buildHeader(options.messageType, options.flags, options.serialization, options.compression)
  const body = options.compression === COMPRESSION_GZIP ? new Uint8Array(gzipSync(options.payload)) : options.payload
  const sizeBuffer = new Uint8Array(4)
  writeUInt32BE(sizeBuffer, body.byteLength, 0)

  const parts: Uint8Array[] = [header]
  if (options.sequence !== undefined) {
    const sequenceValue = new Uint8Array(4)
    writeInt32BE(sequenceValue, options.sequence, 0)
    parts.push(sequenceValue)
  }
  parts.push(sizeBuffer, body)
  return concatBytes(parts)
}

function buildSessionStartFrame(sessionId: string, model: string) {
  const payload = textEncoder.encode(
    JSON.stringify({
      audio: {
        bits: 16,
        channel: 1,
        codec: 'raw',
        format: 'pcm',
        rate: 16000,
      },
      request: {
        enable_ddc: true,
        enable_itn: true,
        enable_nonstream: true,
        enable_punc: true,
        end_window_size: 800,
        model_name: model,
        reqid: sessionId,
        result_type: 'single',
        sequence: 1,
        show_utterances: true,
      },
      user: {
        uid: sessionId,
      },
    })
  )

  return buildFrame({
    compression: COMPRESSION_GZIP,
    flags: MESSAGE_FLAG_NONE,
    messageType: MESSAGE_TYPE_FULL_CLIENT_REQUEST,
    payload,
    serialization: SERIALIZATION_JSON,
  })
}

function buildAudioFrame(chunk: Uint8Array, isLastPacket: boolean) {
  return buildFrame({
    compression: COMPRESSION_GZIP,
    flags: isLastPacket ? MESSAGE_FLAG_LAST_PACKAGE : MESSAGE_FLAG_NONE,
    messageType: MESSAGE_TYPE_AUDIO_ONLY_REQUEST,
    payload: chunk,
    serialization: SERIALIZATION_NONE,
  })
}

function decodePayload(buffer: Uint8Array, serialization: number, compression: number): unknown {
  if (!buffer.byteLength) {
    return serialization === SERIALIZATION_JSON ? {} : buffer
  }

  const payloadBuffer = compression === COMPRESSION_GZIP ? new Uint8Array(gunzipSync(buffer)) : buffer

  if (serialization === SERIALIZATION_JSON) {
    const text = textDecoder.decode(payloadBuffer).trim()
    return text ? (JSON.parse(text) as Record<string, unknown>) : {}
  }

  return payloadBuffer
}

function parseFrame(buffer: Uint8Array): ParsedFrame {
  if (buffer.byteLength < 8) {
    throw new Error('豆包 ASR 响应帧长度不足')
  }

  const headerSizeWords = buffer[0] & 0x0f
  const messageType = (buffer[1] >> 4) & 0x0f
  const flags = buffer[1] & 0x0f
  const serialization = (buffer[2] >> 4) & 0x0f
  const compression = buffer[2] & 0x0f

  let offset = headerSizeWords * 4
  let sequence: number | undefined

  if (flags === MESSAGE_FLAG_HAS_POSITIVE_SEQUENCE || flags === MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE) {
    if (buffer.byteLength < offset + 4) {
      throw new Error('豆包 ASR 响应帧缺少 sequence 数据')
    }
    sequence = readInt32BE(buffer, offset)
    offset += 4
  }

  let errorCode: number | undefined
  if (messageType === MESSAGE_TYPE_ERROR_RESPONSE) {
    if (buffer.byteLength < offset + 4) {
      throw new Error('豆包 ASR 错误响应缺少错误码')
    }
    errorCode = readUInt32BE(buffer, offset)
    offset += 4
  }

  if (buffer.byteLength < offset + 4) {
    throw new Error('豆包 ASR 响应帧缺少 payload 长度')
  }

  const payloadSize = readUInt32BE(buffer, offset)
  offset += 4

  if (buffer.byteLength < offset + payloadSize) {
    throw new Error('豆包 ASR 响应帧 payload 长度不完整')
  }

  const payload = decodePayload(buffer.subarray(offset, offset + payloadSize), serialization, compression)

  return {
    errorCode,
    flags,
    messageType,
    payload,
    sequence,
  }
}

async function messageEventToBuffer(data: unknown) {
  if (typeof data === 'string') {
    return textEncoder.encode(data)
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }

  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }

  return new Uint8Array(0)
}

function collectTranscriptSegments(payload: Record<string, unknown>) {
  const result = payload.result
  const items = Array.isArray(result) ? result : result && typeof result === 'object' ? [result] : []
  const segments: TranscriptSegment[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Record<string, unknown>
    if (typeof record.text === 'string' && record.text.trim()) {
      segments.push({ definite: false, text: record.text.trim() })
    }

    const utterances = Array.isArray(record.utterances) ? record.utterances : []
    for (const utterance of utterances) {
      if (!utterance || typeof utterance !== 'object') {
        continue
      }
      const entry = utterance as Record<string, unknown>
      if (typeof entry.text === 'string' && entry.text.trim()) {
        segments.push({
          definite: entry.definite === true,
          text: entry.text.trim(),
        })
      }
    }
  }

  if (!segments.length && typeof payload.text === 'string' && payload.text.trim()) {
    segments.push({ definite: false, text: payload.text.trim() })
  }

  return segments
}

function extractTranscriptText(payload: Record<string, unknown>) {
  const result = payload.result
  if (Array.isArray(result)) {
    const firstResult = result.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined
    if (typeof firstResult?.text === 'string' && firstResult.text.trim()) {
      return firstResult.text.trim()
    }
  } else if (result && typeof result === 'object') {
    const resultRecord = result as Record<string, unknown>
    if (typeof resultRecord.text === 'string' && resultRecord.text.trim()) {
      return resultRecord.text.trim()
    }
  }

  const segments = collectTranscriptSegments(payload)
  if (!segments.length) {
    return ''
  }

  const definiteText = segments
    .filter((segment) => segment.definite)
    .map((segment) => segment.text)
    .join('')
    .trim()
  if (definiteText) {
    return definiteText
  }

  return segments
    .map((segment) => segment.text)
    .join('')
    .trim()
}

function extractErrorMessage(payload: unknown, errorCode?: number) {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim()
    }
    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim()
    }
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }

  return errorCode ? `豆包流式识别失败，错误码 ${errorCode}` : '豆包流式识别失败'
}

function isSuccessfulPayload(payload: Record<string, unknown>) {
  const code = payload.code
  return typeof code !== 'number' || code === SUCCESS_CODE
}

function isCompletedResponse(frame: ParsedFrame) {
  return (
    frame.flags === MESSAGE_FLAG_HAS_NEGATIVE_SEQUENCE ||
    frame.flags === MESSAGE_FLAG_LAST_PACKAGE ||
    (typeof frame.sequence === 'number' && frame.sequence < 0)
  )
}

export function createDoubaoASRManager() {
  const sessions = new Map<string, ActiveSession>()

  function getSession(sessionId: string) {
    const session = sessions.get(sessionId)
    if (!session) {
      throw new Error(`豆包 ASR 会话不存在: ${sessionId}`)
    }
    return session
  }

  async function createSession(config: DoubaoASRSessionConfig, emit: SessionEmitter): Promise<DoubaoASRSessionHandle> {
    const appId = config.appId?.trim()
    const accessKey = config.accessKey?.trim() || config.apiKey?.trim()
    const resourceId = config.resourceId?.trim() || DEFAULT_RESOURCE_ID
    const model = config.model?.trim() || DEFAULT_MODEL
    const baseURL = config.baseURL?.trim() || DEFAULT_BASE_URL

    if (!appId) {
      throw new Error('豆包 App Key 未配置')
    }

    if (!accessKey) {
      throw new Error('豆包 Access Key 未配置')
    }

    const sessionId = randomUUID()
    const connectId = randomUUID()
    const ws = new WebSocket(baseURL, [], {
      headers: {
        'X-Api-Access-Key': accessKey,
        'X-Api-App-Key': appId,
        'X-Api-Connect-Id': connectId,
        'X-Api-Resource-Id': resourceId,
      },
    })

    const readyPromise = new Promise<void>((resolve, reject) => {
      let settled = false

      ws.onopen = () => {
        try {
          ws.send(buildSessionStartFrame(sessionId, model))
          settled = true
          resolve()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          emit({ sessionId, type: 'error', message })
          settled = true
          reject(new Error(message))
        }
      }

      ws.onerror = () => {
        if (!settled) {
          settled = true
          reject(new Error('豆包双向流式识别连接失败'))
        }
      }
    })

    const handleMessage = async (data: unknown) => {
      const messageBuffer = await messageEventToBuffer(data)
      if (!messageBuffer.byteLength) {
        return
      }

      try {
        const frame = parseFrame(messageBuffer)
        const session = sessions.get(sessionId)
        if (!session) {
          return
        }

        if (frame.messageType === MESSAGE_TYPE_ERROR_RESPONSE) {
          emit({
            sessionId,
            type: 'error',
            message: extractErrorMessage(frame.payload, frame.errorCode),
          })
          return
        }

        if (
          frame.messageType !== MESSAGE_TYPE_FULL_SERVER_RESPONSE ||
          !frame.payload ||
          typeof frame.payload !== 'object'
        ) {
          return
        }

        const payload = frame.payload as Record<string, unknown>
        if (!isSuccessfulPayload(payload)) {
          emit({
            sessionId,
            type: 'error',
            message: extractErrorMessage(payload, typeof payload.code === 'number' ? payload.code : undefined),
          })
          return
        }

        const text = extractTranscriptText(payload)
        const completed = isCompletedResponse(frame)
        if (completed) {
          session.completed = true
          emit({ sessionId, type: 'completed', text })
          return
        }

        if (text) {
          emit({ sessionId, type: 'partial', text })
        }
      } catch (error) {
        log.warn('[DoubaoASR] Failed to parse websocket message', error)
      }
    }

    ws.onmessage = (event) => {
      void handleMessage(event.data)
    }

    ws.onclose = () => {
      const session = sessions.get(sessionId)
      sessions.delete(sessionId)
      if (session && !session.closedByClient && !session.completed) {
        emit({
          sessionId,
          type: 'error',
          message: '豆包双向流式识别连接已关闭',
        })
      }
    }

    sessions.set(sessionId, {
      closedByClient: false,
      completed: false,
      emit,
      readyPromise,
      ws,
    })

    try {
      await readyPromise
      return { sessionId }
    } catch (error) {
      sessions.delete(sessionId)
      try {
        ws.close()
      } catch {
        // noop
      }
      throw error
    }
  }

  async function appendAudio(sessionId: string, chunk: Uint8Array) {
    const session = getSession(sessionId)
    await session.readyPromise
    if (!chunk.byteLength) {
      return true
    }

    session.ws.send(buildAudioFrame(chunk, false))
    return true
  }

  async function commitSession(sessionId: string) {
    const session = getSession(sessionId)
    await session.readyPromise
    session.ws.send(buildAudioFrame(new Uint8Array(0), true))
    return true
  }

  function closeSession(sessionId: string) {
    const session = sessions.get(sessionId)
    if (!session) {
      return true
    }

    session.closedByClient = true
    sessions.delete(sessionId)
    try {
      session.ws.close()
    } catch (error) {
      log.warn('[DoubaoASR] Failed to close websocket session', error)
    }
    return true
  }

  async function destroy() {
    const sessionIds = [...sessions.keys()]
    await Promise.all(sessionIds.map((sessionId) => closeSession(sessionId)))
  }

  return {
    appendAudio,
    closeSession,
    commitSession,
    createSession,
    destroy,
  }
}
