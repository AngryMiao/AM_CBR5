import { describe, it, expect, vi } from 'vitest'
import { BrowserTTSProvider } from '../browser'

// Mock speechSynthesis API
const mockUtterance = {
  text: '',
  voice: null,
  rate: 1,
  pitch: 1,
  volume: 1,
  onend: null,
  onerror: null,
  onboundary: null,
}

global.SpeechSynthesisUtterance = vi.fn(() => mockUtterance) as any

global.speechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  speaking: false,
  paused: false,
  getVoices: vi.fn(() => [
    { name: 'Test Voice', lang: 'zh-CN', default: true } as SpeechSynthesisVoice,
  ]),
} as any

describe('BrowserTTSProvider', () => {
  it('should be available', async () => {
    const provider = new BrowserTTSProvider()
    const available = await provider.isAvailable()
    expect(available).toBe(true)
  })

  it('should get provider name', () => {
    const provider = new BrowserTTSProvider()
    expect(provider.getName()).toBe('Browser TTS')
  })

  it('should get voices', () => {
    const provider = new BrowserTTSProvider()
    const voices = provider.getVoices()
    expect(voices).toHaveLength(1)
    expect(voices[0].name).toBe('Test Voice')
  })

  it('should speak text', async () => {
    const provider = new BrowserTTSProvider()
    const speakPromise = provider.speak('Hello World')

    // Simulate speech end
    if (mockUtterance.onend) {
      mockUtterance.onend(new Event('end') as any)
    }

    await speakPromise
    expect(speechSynthesis.speak).toHaveBeenCalled()
  })

  it('should stop speaking', () => {
    const provider = new BrowserTTSProvider()
    provider.stop()
    expect(speechSynthesis.cancel).toHaveBeenCalled()
  })
})
