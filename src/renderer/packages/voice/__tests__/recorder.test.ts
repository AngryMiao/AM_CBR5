import { describe, it, expect, beforeEach, vi } from 'vitest'
import { VoiceRecorder } from '../recorder'

// Mock MediaDevices API
const mockMediaStream = {
  getTracks: vi.fn(() => [{ stop: vi.fn() }]),
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

global.navigator.mediaDevices = {
  getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
} as any

const getUserMediaMock = navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>

const MediaRecorderMock = vi.fn(function MediaRecorderMock() {
  return mockMediaRecorder
})

global.MediaRecorder = Object.assign(MediaRecorderMock, {
  isTypeSupported: vi.fn(() => true),
}) as any

global.AudioContext = vi.fn(() => ({
  createMediaStreamSource: vi.fn(() => ({
    connect: vi.fn(),
  })),
  createAnalyser: vi.fn(() => ({
    fftSize: 256,
    frequencyBinCount: 128,
    getByteFrequencyData: vi.fn(),
  })),
  close: vi.fn(),
})) as any

describe('VoiceRecorder', () => {
  let recorder: VoiceRecorder

  beforeEach(() => {
    recorder = new VoiceRecorder()
    vi.clearAllMocks()
    getUserMediaMock.mockReset()
    getUserMediaMock.mockResolvedValue(mockMediaStream)
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
    },
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
})
