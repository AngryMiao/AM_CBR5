import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { VOICE_RUNTIME_SEARCH } from '@shared/runtime-mode'

export const VOICE_RUNTIME_WINDOW_NAME = 'angrymiao-voice-runtime'

export type EnsureVoiceRuntimeWindowArgs = {
  isPackaged: boolean
  preloadPath: string
  rendererHtmlPath: string
  rendererURL?: string
}

let voiceRuntimeWindow: BrowserWindow | null = null

export function getVoiceRuntimeWindow() {
  return voiceRuntimeWindow
}

export function collectVoiceRuntimeNotificationWindows(mainWindow: BrowserWindow | null | undefined) {
  const candidates = [mainWindow, voiceRuntimeWindow]
  const windows: BrowserWindow[] = []

  for (const window of candidates) {
    if (!window || window.isDestroyed() || windows.includes(window)) {
      continue
    }
    windows.push(window)
  }

  return windows
}

export function buildVoiceRuntimeWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    title: VOICE_RUNTIME_WINDOW_NAME,
    show: false,
    skipTaskbar: true,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    webPreferences: {
      spellcheck: false,
      webSecurity: false,
      allowRunningInsecureContent: false,
      backgroundThrottling: false,
      preload: preloadPath,
    },
  }
}

function buildVoiceRuntimeSearch() {
  return `?${VOICE_RUNTIME_SEARCH}`
}

export function ensureVoiceRuntimeWindow(args: EnsureVoiceRuntimeWindowArgs) {
  if (voiceRuntimeWindow && !voiceRuntimeWindow.isDestroyed()) {
    return voiceRuntimeWindow
  }

  voiceRuntimeWindow = new BrowserWindow(buildVoiceRuntimeWindowOptions(args.preloadPath))
  voiceRuntimeWindow.on('closed', () => {
    voiceRuntimeWindow = null
  })

  if (!args.isPackaged && args.rendererURL) {
    void voiceRuntimeWindow.loadURL(`${args.rendererURL}${buildVoiceRuntimeSearch()}`)
  } else {
    void voiceRuntimeWindow.loadFile(args.rendererHtmlPath, {
      search: buildVoiceRuntimeSearch(),
    })
  }

  return voiceRuntimeWindow
}

export function destroyVoiceRuntimeWindow() {
  if (!voiceRuntimeWindow || voiceRuntimeWindow.isDestroyed()) {
    voiceRuntimeWindow = null
    return
  }

  voiceRuntimeWindow.destroy()
  voiceRuntimeWindow = null
}
