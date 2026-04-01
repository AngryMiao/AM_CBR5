/**
 * @vitest-environment jsdom
 */
import { defaultVoiceSettings } from '@shared/defaults'
import type { VoiceSettings } from '@shared/types/voice'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

function createVoiceSettings() {
  return defaultVoiceSettings()
}

const mocks = vi.hoisted(() => ({
  voice: {
    enabled: true,
    workMode: 'chat',
    triggerMode: 'toggle',
    asrProvider: 'aliyun',
    ttsProvider: 'browser',
    asrConfig: {
      openai: {
        apiKey: 'test-key',
        model: 'whisper-1',
        baseURL: 'https://example.com',
      },
      aliyun: {
        apiKey: 'test-key',
        model: 'qwen3-asr-flash',
        baseURL: 'https://example.com',
        enableITN: true,
      },
    },
    ttsConfig: {},
    shortcuts: {
      toggleVoice: 'RightAlt',
    },
    microphoneDeviceId: undefined,
    keyboardShortcuts: [],
    autoStopRecording: true,
    silenceThreshold: 0.01,
    silenceDuration: 1500,
    maxRecordingDuration: 60000,
    autoPlayResponse: true,
    showTranscript: true,
  } as VoiceSettings,
  setSettings: vi.fn(),
  getPlatform: vi.fn(async () => 'win32'),
}))

vi.mock('@/platform', () => ({
  default: {
    type: 'web',
    getPlatform: mocks.getPlatform,
  },
}))

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (
    selector: (state: { voice: typeof mocks.voice; setSettings: typeof mocks.setSettings }) => unknown
  ) =>
    selector({
      voice: mocks.voice,
      setSettings: mocks.setSettings,
    }),
}))

import { useVoiceSettings } from './useVoiceSettings'

describe('useVoiceSettings', () => {
  afterEach(() => {
    mocks.voice = createVoiceSettings()
    mocks.setSettings.mockReset()
    mocks.getPlatform.mockClear()
  })

  it('does not auto-populate legacy keyboard shortcuts when none are configured', async () => {
    mocks.voice = {
      ...createVoiceSettings(),
      keyboardShortcuts: [],
    }

    renderHook(() => useVoiceSettings())
    await Promise.resolve()

    expect(mocks.getPlatform).not.toHaveBeenCalled()
    expect(mocks.setSettings).not.toHaveBeenCalled()
  })
})
