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

global.MediaRecorder = vi.fn(() => mockMediaRecorder) as any

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
