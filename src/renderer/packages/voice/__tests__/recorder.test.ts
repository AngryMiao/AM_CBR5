import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VoiceRecorder } from '../recorder'

const mockTrack = {
  stop: vi.fn(),
  label: 'Mock Mic',
  readyState: 'live',
  getSettings: vi.fn(() => ({ deviceId: 'mock-device', groupId: 'mock-group' })),
}

// Mock MediaDevices API
const mockMediaStream = {
  getTracks: vi.fn(() => [mockTrack]),
  getAudioTracks: vi.fn(() => [mockTrack]),
} as unknown as MediaStream

const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  state: 'inactive',
  ondataavailable: null,
  onstop: null,
  onerror: null,
} as unknown as MediaRecorder

Object.defineProperty(global.navigator, 'mediaDevices', {
  configurable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
    enumerateDevices: vi.fn().mockResolvedValue([
      {
        kind: 'audioinput',
        deviceId: 'mock-device',
        label: 'Mock Mic',
      },
    ]),
  },
})

const getUserMediaMock = navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>

const MediaRecorderMock = vi.fn(function MediaRecorderMock() {
  return mockMediaRecorder
})

global.MediaRecorder = Object.assign(MediaRecorderMock, {
  isTypeSupported: vi.fn(() => true),
}) as any

const audioProcessing = {
  processorNode: null as {
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    onaudioprocess: ((event: { inputBuffer: { getChannelData: (channel: number) => Float32Array } }) => void) | null
  } | null,
}

global.AudioContext = vi.fn(function MockAudioContext() {
  return {
    sampleRate: 48000,
    destination: {},
    createMediaStreamSource: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createAnalyser: vi.fn(() => ({
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createScriptProcessor: vi.fn(() => {
      audioProcessing.processorNode = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        onaudioprocess: null,
      }
      return audioProcessing.processorNode
    }),
    close: vi.fn(),
  }
}) as any

global.requestAnimationFrame = vi.fn(() => 1) as any
global.cancelAnimationFrame = vi.fn() as any

function emitAudioProcessFrame(sampleCount = 4800) {
  const samples = Float32Array.from({ length: sampleCount }, (_, index) => Math.sin(index / 8))
  audioProcessing.processorNode?.onaudioprocess?.({
    inputBuffer: {
      getChannelData: () => samples,
    },
  })
}

describe('VoiceRecorder', () => {
  let recorder: VoiceRecorder

  beforeEach(() => {
    recorder = new VoiceRecorder()
    vi.clearAllMocks()
    getUserMediaMock.mockReset()
    getUserMediaMock.mockResolvedValue(mockMediaStream)
    mockTrack.getSettings.mockReturnValue({ deviceId: 'mock-device', groupId: 'mock-group' })
    audioProcessing.processorNode = null
  })

  it('should start recording', async () => {
    await recorder.start()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    expect(mockMediaRecorder.start).toHaveBeenCalledWith(100)
  })

  it('should pass selected microphone deviceId to getUserMedia', async () => {
    await recorder.start({ microphoneDeviceId: 'mic-123' } as any)

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: { exact: 'mic-123' },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
  })

  it.each(['NotFoundError', 'OverconstrainedError'])(
    'should fallback to default microphone when selected device is unavailable: %s',
    async (errorName) => {
      getUserMediaMock.mockRejectedValueOnce(Object.assign(new Error('device unavailable'), { name: errorName }))
      getUserMediaMock.mockResolvedValueOnce(mockMediaStream)

      await recorder.start({ microphoneDeviceId: 'missing-device' } as any)

      expect(getUserMediaMock).toHaveBeenCalledTimes(2)
      expect(getUserMediaMock).toHaveBeenNthCalledWith(1, {
        audio: {
          deviceId: { exact: 'missing-device' },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      expect(getUserMediaMock).toHaveBeenNthCalledWith(2, {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    }
  )

  it('should reject immediately without fallback for non-fallback error', async () => {
    getUserMediaMock.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { name: 'NotAllowedError' }))

    await expect(recorder.start({ microphoneDeviceId: 'x' } as any)).rejects.toThrow('无法访问麦克风')

    expect(getUserMediaMock).toHaveBeenCalledTimes(1)
    expect(getUserMediaMock).toHaveBeenNthCalledWith(1, {
      audio: {
        deviceId: { exact: 'x' },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
  })

  it('should get supported mime type', () => {
    const mimeType = recorder['getSupportedMimeType']()
    expect(mimeType).toBeTruthy()
  })

  it('should get recording state', async () => {
    await recorder.start()
    const state = recorder.getState()
    expect(state).toBe('inactive')
  })

  it('emits pcm chunks when onAudioChunk is provided', async () => {
    const onAudioChunk = vi.fn()

    await recorder.start({ onAudioChunk } as any)
    expect(global.AudioContext).toHaveBeenCalled()
    expect(typeof (global.AudioContext as any).mock.results[0]?.value?.createScriptProcessor).toBe('function')
    expect(audioProcessing.processorNode).toBeTruthy()
    expect(typeof audioProcessing.processorNode?.onaudioprocess).toBe('function')
    emitAudioProcessFrame()

    expect(onAudioChunk).toHaveBeenCalled()
    expect(onAudioChunk.mock.calls[0][0]).toBeInstanceOf(Uint8Array)
    expect(onAudioChunk.mock.calls[0][0].length).toBeGreaterThan(0)
  })
})
