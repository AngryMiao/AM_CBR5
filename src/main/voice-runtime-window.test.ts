import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = []

    destroyed = false
    webContents = {
      once: vi.fn(),
    }
    loadURL = vi.fn()
    loadFile = vi.fn()
    on = vi.fn().mockReturnThis()
    destroy = vi.fn(() => {
      this.destroyed = true
    })

    constructor(public readonly options: Record<string, unknown>) {
      MockBrowserWindow.instances.push(this)
    }

    isDestroyed() {
      return this.destroyed
    }
  }

  return {
    MockBrowserWindow,
  }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.MockBrowserWindow,
}))

import {
  VOICE_RUNTIME_WINDOW_NAME,
  buildVoiceRuntimeWindowOptions,
  destroyVoiceRuntimeWindow,
  ensureVoiceRuntimeWindow,
} from './voice-runtime-window'

describe('voice runtime window', () => {
  beforeEach(() => {
    mocks.MockBrowserWindow.instances.length = 0
  })

  afterEach(() => {
    destroyVoiceRuntimeWindow()
    vi.clearAllMocks()
  })

  it('builds a hidden background window for voice runtime', () => {
    const options = buildVoiceRuntimeWindowOptions('E:/code/AM_CBR5/out/preload/index.js')

    expect(options.show).toBe(false)
    expect(options.skipTaskbar).toBe(true)
    expect(options.webPreferences?.backgroundThrottling).toBe(false)
    expect(options.title).toBe(VOICE_RUNTIME_WINDOW_NAME)
  })

  it('loads the renderer with the voice runtime search flag in development', () => {
    ensureVoiceRuntimeWindow({
      isPackaged: false,
      rendererURL: 'http://localhost:1212',
      preloadPath: 'E:/code/AM_CBR5/out/preload/index.js',
      rendererHtmlPath: 'E:/code/AM_CBR5/out/renderer/index.html',
    })

    const window = mocks.MockBrowserWindow.instances.at(-1)
    expect(window).toBeTruthy()
    expect(window?.loadURL).toHaveBeenCalledWith('http://localhost:1212?voice-runtime=1')
  })

  it('loads the renderer file with the voice runtime search flag in production', () => {
    ensureVoiceRuntimeWindow({
      isPackaged: true,
      preloadPath: 'E:/code/AM_CBR5/release/app/dist/preload/index.js',
      rendererHtmlPath: 'E:/code/AM_CBR5/release/app/dist/renderer/index.html',
    })

    const window = mocks.MockBrowserWindow.instances.at(-1)
    expect(window).toBeTruthy()
    expect(window?.loadFile).toHaveBeenCalledWith(
      'E:/code/AM_CBR5/release/app/dist/renderer/index.html',
      expect.objectContaining({
        search: '?voice-runtime=1',
      })
    )
  })
})
