/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */

import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  session,
  shell,
  systemPreferences,
  Tray,
} from 'electron'
import electronDebug from 'electron-debug'
import log from 'electron-log/main'
import os from 'os'
import path from 'path'
import { spawn, type ChildProcess } from 'child_process'
// @ts-expect-error - source-map-support doesn't have type definitions
import * as sourceMapSupport from 'source-map-support'
import type { ShortcutSetting } from 'src/shared/types'
import { getDefaultFunASRLaunchCommand } from 'src/shared/types/voice'
import * as analystic from './analystic-node'
import * as autoLauncher from './autoLauncher'
import { handleDeepLink } from './deeplinks'
import { parseFile } from './file-parser'
import Locale from './locales'
import * as mcpIpc from './mcp/ipc-stdio-transport'
import MenuBuilder from './menu'
import * as proxy from './proxy'
import {
  listInstalledSkillBundles,
  readSkillBundleTextFile,
  resolveSkillBundleRuntimeServerConfig,
} from './skill-bundles'
import {
  delStoreBlob,
  getConfig,
  getSettings,
  getStoreBlob,
  listStoreBlobKeys,
  setStoreBlob,
  store,
} from './store-node'
import * as windowState from './window_state'

const knowledgeBaseInitPromise = import('./knowledge-base/index.js')
  .then((mod) => mod.getInitPromise())
  .catch((error) => {
    log.error('[KB] Failed to initialize knowledge base during bootstrap:', error)
  })

// 这行代码是解决 Windows 通知的标题和图标不正确的问题，标题会错误显示成 electron.app.Chatbox
// 参考：https://stackoverflow.com/questions/65859634/notification-from-electron-shows-electron-app-electron
if (process.platform === 'win32') {
  app.setAppUserModelId(app.name)
}

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets')

const getAssetPath = (...paths: string[]): string => {
  return path.join(RESOURCES_PATH, ...paths)
}

// 开发环境使用 chatbox-dev:// 协议，避免和正式版冲突
const PROTOCOL_SCHEME = process.defaultApp ? 'chatbox-dev' : 'chatbox'

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME)
}

console.log(`📱 URL Scheme registered: ${PROTOCOL_SCHEME}://`)

// --------- 全局变量 ---------

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let funasrProcess: ChildProcess | null = null
let funasrStarting = false
let funasrManagedBaseURL = ''

type FunASRLaunchConfig = {
  enabled: boolean
  asrProvider?: string
  baseURL: string
  autoStart: boolean
  launchCommand: string
  launchArgs: string
  launchCwd?: string
}

function parseLaunchArgs(args: string): string[] {
  if (!args.trim()) return []
  const matches = args.match(/"[^"]*"|'[^']*'|\S+/g) || []
  return matches.map((item) => item.replace(/^['"]|['"]$/g, ''))
}

function getFunASRLaunchConfig(): FunASRLaunchConfig {
  const settings = getSettings()
  const voiceSettings = settings.voice
  const funasrConfig = (voiceSettings?.asrConfig as any)?.funasrLocal || {}
  const defaultLaunchCommand = getDefaultFunASRLaunchCommand(process.platform)
  return {
    enabled: !!voiceSettings?.enabled,
    asrProvider: voiceSettings?.asrProvider,
    baseURL: String(funasrConfig.baseURL || 'http://127.0.0.1:10095'),
    autoStart: funasrConfig.autoStart !== false,
    launchCommand: String(funasrConfig.launchCommand || defaultLaunchCommand),
    launchArgs: String(funasrConfig.launchArgs || '-m funasr_server --port 10095'),
    launchCwd: funasrConfig.launchCwd ? String(funasrConfig.launchCwd) : undefined,
  }
}

function shouldManageFunASR(config: FunASRLaunchConfig): boolean {
  return config.enabled && config.asrProvider === 'funasr-local' && config.autoStart
}

function stopFunASRService(reason: string) {
  if (!funasrProcess) return
  const pid = funasrProcess.pid
  log.info(`[FunASR] stopping service (${reason}), pid=${pid}`)
  try {
    if (process.platform === 'win32' && pid) {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true })
      killer.on('error', (error) => {
        log.error('[FunASR] taskkill failed:', error)
      })
    } else {
      funasrProcess.kill('SIGTERM')
      setTimeout(() => {
        if (funasrProcess && !funasrProcess.killed) {
          funasrProcess.kill('SIGKILL')
        }
      }, 2000)
    }
  } catch (error) {
    log.error('[FunASR] stop failed:', error)
  } finally {
    funasrProcess = null
    funasrManagedBaseURL = ''
    funasrStarting = false
  }
}

function startFunASRService(config: FunASRLaunchConfig) {
  if (funasrProcess || funasrStarting) return
  if (!shouldManageFunASR(config)) return

  const command = config.launchCommand.trim()
  if (!command) {
    log.warn('[FunASR] skip start: launchCommand is empty')
    return
  }

  funasrStarting = true
  const args = parseLaunchArgs(config.launchArgs)
  const child = spawn(command, args, {
    cwd: config.launchCwd,
    env: process.env,
    windowsHide: true,
    detached: false,
    stdio: 'pipe',
  })

  funasrProcess = child
  funasrManagedBaseURL = config.baseURL
  log.info(`[FunASR] service started, pid=${child.pid}, cmd=${command} ${args.join(' ')}`)

  child.stdout?.on('data', (data) => {
    log.info(`[FunASR] ${String(data).trim()}`)
  })
  child.stderr?.on('data', (data) => {
    log.warn(`[FunASR][stderr] ${String(data).trim()}`)
  })
  child.on('error', (error) => {
    log.error('[FunASR] process error:', error)
  })
  child.on('exit', (code, signal) => {
    log.info(`[FunASR] process exited: code=${code}, signal=${signal}`)
    funasrProcess = null
    funasrStarting = false
    funasrManagedBaseURL = ''
  })
  child.on('spawn', () => {
    funasrStarting = false
  })
}

function ensureFunASRService() {
  const config = getFunASRLaunchConfig()
  const shouldRun = shouldManageFunASR(config)

  if (!shouldRun) {
    stopFunASRService('config disabled')
    return { running: false, managed: false, baseURL: config.baseURL }
  }

  if (funasrProcess) {
    if (funasrManagedBaseURL !== config.baseURL) {
      stopFunASRService('baseURL changed')
      startFunASRService(config)
    }
  } else {
    startFunASRService(config)
  }

  return {
    running: !!funasrProcess,
    starting: funasrStarting,
    managed: true,
    pid: funasrProcess?.pid,
    baseURL: config.baseURL,
    command: config.launchCommand,
    args: config.launchArgs,
  }
}

function getFunASRServiceStatus() {
  const config = getFunASRLaunchConfig()
  return {
    running: !!funasrProcess,
    starting: funasrStarting,
    managed: shouldManageFunASR(config),
    pid: funasrProcess?.pid,
    baseURL: config.baseURL,
    command: config.launchCommand,
    args: config.launchArgs,
  }
}

function restartFunASRService() {
  stopFunASRService('manual restart')
  return ensureFunASRService()
}

// --------- 快捷键 ---------

/**
 * 将渲染层的 shortcut 转化成 electron 支持的格式
 * react-hotkeys-hook 的快捷键格式参考： https://react-hotkeys-hook.vercel.app/docs/documentation/useHotkeys/basic-usage#modifiers--special-keys
 * Electron 的快捷键格式参考： https://www.electronjs.org/docs/latest/api/accelerator
 */
function normalizeShortcut(shortcut: string) {
  if (!shortcut) {
    return ''
  }
  let keys = shortcut.split('+')
  keys = keys.map((key) => {
    switch (key) {
      case 'mod':
        return 'CommandOrControl'
      case 'option':
        return 'Alt'
      case 'backquote':
        return '`'
      default:
        return key
    }
  })
  return keys.join('+')
}

const MODIFIER_KEYS = new Set([
  'mod', 'command', 'cmd', 'control', 'ctrl', 'commandorcontrol', 'cmdorctrl',
  'option', 'alt', 'altgr', 'shift', 'super', 'meta',
])

function isValidShortcut(shortcut: string): boolean {
  if (!shortcut) {
    return false
  }
  const keys = shortcut.split('+').map((k) => k.trim().toLowerCase())
  return keys.some((k) => !MODIFIER_KEYS.has(k))
}

function registerShortcuts(
  shortcutSetting?: ShortcutSetting,
  voiceOverride?: { enabled?: boolean; shortcut?: string }
) {
  log.info('registerShortcuts called')
  if (!shortcutSetting) {
    shortcutSetting = getSettings().shortcuts
  }
  if (!shortcutSetting) {
    log.warn('No shortcut settings found')
    return
  }
  try {
    const quickToggle = normalizeShortcut(shortcutSetting.quickToggle)
    if (isValidShortcut(quickToggle)) {
      globalShortcut.register(quickToggle, () => showOrHideWindow())
    }
  } catch (error) {
    log.error('Failed to register shortcut [windowQuickToggle]:', error)
  }

  // 注册语音控制快捷键
  try {
    const allSettings = getSettings()
    const voiceSettings = allSettings.voice

    const voiceEnabled = voiceOverride?.enabled ?? voiceSettings?.enabled
    const toggleVoiceRaw = voiceOverride?.shortcut || voiceSettings?.shortcuts?.toggleVoice
    const DEFAULT_VOICE_SHORTCUT = 'Ctrl+Shift+V'

    log.info('Voice registration:', { voiceEnabled, toggleVoiceRaw, hasOverride: !!voiceOverride })

    if (voiceEnabled && toggleVoiceRaw) {
      let toggleVoice = normalizeShortcut(toggleVoiceRaw)
      if (!isValidShortcut(toggleVoice)) {
        log.warn('Invalid voice shortcut:', toggleVoice, '- falling back to default:', DEFAULT_VOICE_SHORTCUT)
        toggleVoice = normalizeShortcut(DEFAULT_VOICE_SHORTCUT)
      }
      log.info('Registering voice shortcut:', toggleVoice)
      const success = globalShortcut.register(toggleVoice, () => {
        log.info('Voice shortcut triggered!')
        if (mainWindow) {
          mainWindow.webContents.send('voice:toggle')
        }
      })
      log.info('Voice shortcut registration result:', success)
    } else {
      log.info('Voice control not enabled or shortcut not configured')
    }
  } catch (error) {
    log.error('Failed to register shortcut [voiceToggle]:', error)
  }
}

function unregisterShortcuts() {
  return globalShortcut.unregisterAll()
}

// --------- Tray 图标 ---------

function createTray() {
  const locale = new Locale()
  const quitAccelerator = process.platform === 'darwin' ? 'Command+Q' : 'Ctrl+Q'
  let iconPath = getAssetPath('icon.png')
  if (process.platform === 'darwin') {
    // 生成 iconTemplate.png 的命令
    // gm convert -background none ./iconTemplateRawPreview.png -resize 130% -gravity center -extent 512x512 iconTemplateRaw.png
    // gm convert ./iconTemplateRaw.png -colorspace gray -negate -threshold 50% -resize 16x16 -units PixelsPerInch -density 72 iconTemplate.png
    // gm convert ./iconTemplateRaw.png -colorspace gray -negate -threshold 50% -resize 64x64 -units PixelsPerInch -density 144 iconTemplate@2x.png
    iconPath = getAssetPath('iconTemplate.png')
  } else if (process.platform === 'win32') {
    iconPath = getAssetPath('icon.ico')
  }
  tray = new Tray(iconPath)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: locale.t('Show/Hide'),
      click: showOrHideWindow,
      accelerator: getSettings().shortcuts.quickToggle,
    },
    {
      label: locale.t('Exit'),
      click: () => app.quit(),
      accelerator: quitAccelerator,
    },
  ])
  tray.setToolTip('Chatbox')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', showOrHideWindow)
  return tray
}

function ensureTray() {
  if (tray) {
    log.info('tray: already exists')
    return tray
  }
  try {
    createTray()
    log.info('tray: created')
  } catch (e) {
    log.error('tray: failed to create', e)
  }
}

function destroyTray() {
  if (!tray) {
    log.info('tray: skip destroy because it does not exist')
    return
  }
  try {
    tray.destroy()
    tray = null
    log.info('tray: destroyed')
  } catch (e) {
    log.error('tray: failed to destroy', e)
  }
}

// --------- 开发模式 ---------

if (process.env.NODE_ENV === 'production') {
  sourceMapSupport.install()
}

const isDebug = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true'

if (isDebug) {
  electronDebug()
}

// const installExtensions = async () => {
//     const installer = require('electron-devtools-installer')
//     const forceDownload = !!process.env.UPGRADE_EXTENSIONS
//     const extensions = ['REACT_DEVELOPER_TOOLS']

//     return installer
//         .default(
//             extensions.map((name) => installer[name]),
//             forceDownload
//         )
//         .catch(console.log)
// }

// --------- 窗口管理 ---------

async function createWindow() {
  if (isDebug) {
    // 不在安装 DEBUG 浏览器插件。可能不兼容，所以不如直接在网页里debug
    // await installExtensions()
  }

  const [state] = windowState.getState()

  mainWindow = new BrowserWindow({
    show: false,
    // remove the default titlebar
    titleBarStyle: 'hidden',
    // expose window controlls in Windows/Linux
    frame: false,
    trafficLightPosition: { x: 10, y: 16 },
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: windowState.minWidth,
    minHeight: windowState.minHeight,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      spellcheck: true,
      webSecurity: false, // 其中一个作用是解决跨域问题
      allowRunningInsecureContent: false,
      preload: app.isPackaged
        ? path.join(__dirname, '../preload/index.js')
        : path.join(__dirname, '../../out/preload/index.js'),
    },
  })

  // Load the local URL for development or the local
  // html file for production
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined')
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize()
    } else {
      if (state.mode === windowState.WindowMode.Maximized) {
        mainWindow.maximize()
      }
      if (state.mode === windowState.WindowMode.Fullscreen) {
        mainWindow.setFullScreen(true)
      }
      mainWindow.show()
    }
  })

  // 窗口关闭时保存窗口大小与位置
  mainWindow.on('close', () => {
    if (mainWindow) {
      windowState.saveState(mainWindow)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Send maximized state changes to renderer
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false)
  })

  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window:focused')
  })

  const menuBuilder = new MenuBuilder(mainWindow)
  menuBuilder.buildMenu()

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url)
    return { action: 'deny' }
  })

  // 隐藏 Windows, Linux 应用顶部的菜单栏
  // https://www.computerhope.com/jargon/m/menubar.htm
  mainWindow.setMenuBarVisibility(false)

  // 网络问题
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        // 'Content-Security-Policy': ['default-src \'self\'']
        // 'Content-Security-Policy': ['*'], // 为了支持代理
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Methods': ['GET, POST, PUT, DELETE, OPTIONS'],
        'Access-Control-Allow-Headers': ['*'],
      },
    })
  })

  // 允许访问 HuggingFace 和镜像站点（用于下载 Whisper 模型）
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url
    if (url.includes('huggingface.co') || url.includes('hf-mirror.com')) {
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          Origin: url,
        },
      })
    } else {
      callback({ requestHeaders: details.requestHeaders })
    }
  })

  // 监听系统主题更新
  nativeTheme.on('updated', () => {
    mainWindow?.webContents.send('system-theme-updated')
  })

  return mainWindow
}

async function showOrHideWindow() {
  if (!mainWindow) {
    await createWindow()
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
    mainWindow.focus()
    mainWindow.webContents.send('window-show')
  } else if (mainWindow?.isFocused()) {
    // 解决MacOS全屏下隐藏将黑屏的问题
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false)
    }
    mainWindow.hide()
    // mainWindow.minimize()
  } else {
    // 解决MacOS下无法聚焦的问题
    mainWindow.hide()
    mainWindow.show()
    mainWindow.focus()
    // 解决MacOS全屏下无法聚焦的问题
    mainWindow.webContents.send('window-show')
  }
}

// --------- 应用管理 ---------

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', async (event, commandLine, workingDirectory) => {
    // on windows and linux, the deep link is passed in the command line
    const url = commandLine.find((arg) => arg.startsWith('chatbox://') || arg.startsWith('chatbox-dev://'))

    if (url) {
      // Deep Link 场景：总是显示并聚焦窗口
      if (!mainWindow) {
        // 窗口未创建，立即创建
        await createWindow()
      }

      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore()
        }
        mainWindow.show()
        mainWindow.focus()

        // 确保窗口加载完成后再处理 Deep Link
        if (mainWindow.webContents.isLoading()) {
          mainWindow.webContents.once('did-finish-load', () => {
            if (mainWindow) {
              handleDeepLink(mainWindow, url)
            }
          })
        } else {
          handleDeepLink(mainWindow, url)
        }
      }
    } else {
      // 非 Deep Link 场景：切换显示/隐藏
      await showOrHideWindow()
    }
  })

  app.on('window-all-closed', () => {
    // Respect the OSX convention of having the application in memory even
    // after all windows have been closed
    // if (process.platform !== 'darwin') {
    //     app.quit()
    // }
  })

  app
    .whenReady()
    .then(async () => {
      await knowledgeBaseInitPromise
      await createWindow()
      ensureTray()

      // 处理启动时的 Deep Link (Windows/Linux)
      // macOS 会通过 open-url 事件处理，不需要在这里处理
      if (process.platform !== 'darwin') {
        const url = process.argv.find((arg) => arg.startsWith('chatbox://') || arg.startsWith('chatbox-dev://'))
        if (url && mainWindow) {
          // 确保窗口加载完成后再处理 Deep Link
          if (mainWindow.webContents.isLoading()) {
            mainWindow.webContents.once('did-finish-load', () => {
              if (mainWindow) {
                handleDeepLink(mainWindow, url)
              }
            })
          } else {
            handleDeepLink(mainWindow, url)
          }
        }
      }
      app.on('activate', () => {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) {
          createWindow()
        }
        if (mainWindow && !mainWindow.isVisible()) {
          mainWindow.show()
          mainWindow.focus()
        }
      })
      // 监听窗口大小位置变化的代码，很大程度参考了 VSCODE 的实现 /Users/benn/Documents/w/vscode/src/vs/platform/windows/electron-main/windowsStateHandler.ts
      // When a window looses focus, save all windows state. This allows to
      // prevent loss of window-state data when OS is restarted without properly
      // shutting down the application (https://github.com/microsoft/vscode/issues/87171)
      app.on('browser-window-blur', () => {
        if (mainWindow) {
          windowState.saveState(mainWindow)
        }
      })
      registerShortcuts()
      proxy.init()
      ensureFunASRService()
      app.on('will-quit', () => {
        try {
          unregisterShortcuts()
        } catch (e) {
          log.error('shortcut: failed to unregister', e)
        }
        stopFunASRService('app will quit')
        mcpIpc.closeAllTransports()
        destroyTray()
      })
      app.on('before-quit', () => {
        destroyTray()
      })
    })
    .catch(console.log)
}

// macos uses this event to handle deep links
app.on('open-url', async (_event, url) => {
  if (!mainWindow) {
    // 窗口未创建，立即创建
    await createWindow()
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()

    // 确保窗口加载完成后再处理 Deep Link
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => {
        if (mainWindow) {
          handleDeepLink(mainWindow, url)
        }
      })
    } else {
      handleDeepLink(mainWindow, url)
    }
  }
})

// --------- IPC 监听 ---------

ipcMain.handle('getStoreValue', (event, key) => {
  return store.get(key)
})
ipcMain.handle('setStoreValue', (event, key, dataJson) => {
  // 仅在传输层用 JSON 序列化，存储层用原生数据，避免存储层 JSON 损坏后无法自动处理的情况
  const data = JSON.parse(dataJson)
  return store.set(key, data)
})
ipcMain.handle('delStoreValue', (event, key) => {
  return store.delete(key)
})
ipcMain.handle('getAllStoreValues', (event) => {
  return JSON.stringify(store.store)
})
ipcMain.handle('getAllStoreKeys', (event) => {
  return Object.keys(store.store)
})
ipcMain.handle('setAllStoreValues', (event, dataJson) => {
  const data = JSON.parse(dataJson)
  store.store = { ...store.store, ...data }
})

ipcMain.handle('getStoreBlob', async (event, key) => {
  return getStoreBlob(key)
})
ipcMain.handle('setStoreBlob', async (event, key, value: string) => {
  return setStoreBlob(key, value)
})
ipcMain.handle('delStoreBlob', async (event, key) => {
  return delStoreBlob(key)
})
ipcMain.handle('listStoreBlobKeys', async (event) => {
  return listStoreBlobKeys()
})

ipcMain.handle('getVersion', () => {
  return app.getVersion()
})
ipcMain.handle('getPlatform', () => {
  return process.platform
})
ipcMain.handle('listInstalledSkillBundles', () => {
  return listInstalledSkillBundles()
})
ipcMain.handle('readSkillBundleTextFile', (_event, bundleId: string, relativePath: string) => {
  return readSkillBundleTextFile(bundleId, relativePath)
})
ipcMain.handle('resolveSkillBundleRuntimeServerConfig', (_event, bundleId: string, runtimeId: string, settings) => {
  return resolveSkillBundleRuntimeServerConfig(bundleId, runtimeId, settings)
})
ipcMain.handle('ensureAccessibilityPermission', async () => {
  if (process.platform !== 'darwin') return true

  // 1. 检查并请求辅助功能权限
  const accessibilityGranted = systemPreferences.isTrustedAccessibilityClient(true)

  // 2. 测试自动化权限（向 System Events 发送无害命令）
  const { execFile } = await import('child_process')
  const automationGranted = await new Promise<boolean>((resolve) => {
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to return name of first process'],
      { timeout: 10000 },
      (error) => {
        resolve(!error)
      }
    )
  })

  // 3. 如果权限缺失，弹对话框引导用户去系统设置
  if (!accessibilityGranted || !automationGranted) {
    const missing: string[] = []
    if (!accessibilityGranted) missing.push('辅助功能 (Accessibility)')
    if (!automationGranted) missing.push('自动化 → System Events (Automation)')

    const { response } = await dialog.showMessageBox({
      type: 'warning',
      title: '需要系统权限',
      message: '语音控制需要以下 macOS 权限才能正常工作：',
      detail: missing.join('\n') + '\n\n请在系统设置中授权后重启 Chatbox。',
      buttons: ['打开系统设置', '稍后再说'],
      defaultId: 0,
    })
    if (response === 0) {
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Automation')
    }
    return false
  }

  return true
})
ipcMain.handle('getArch', () => {
  return process.arch
})
ipcMain.handle('getHostname', () => {
  return os.hostname()
})
ipcMain.handle('getDeviceName', () => {
  if (process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process')
      const computerName = execSync('scutil --get ComputerName', { encoding: 'utf8' }).trim()
      return computerName || os.hostname()
    } catch (error) {
      return os.hostname()
    }
  } else if (process.platform === 'win32') {
    return process.env.COMPUTERNAME || os.hostname()
  } else {
    return os.hostname()
  }
})
ipcMain.handle('getLocale', () => {
  try {
    return app.getLocale()
  } catch (e: any) {
    return ''
  }
})
ipcMain.handle('openLink', (event, link) => {
  return shell.openExternal(link)
})
ipcMain.handle('ensureShortcutConfig', (event, json) => {
  const config: ShortcutSetting = JSON.parse(json)
  unregisterShortcuts()
  registerShortcuts(config)
})

ipcMain.handle('ensureVoiceShortcut', (event, voiceOverride?: { enabled?: boolean; shortcut?: string }) => {
  log.info('ensureVoiceShortcut called with:', voiceOverride)
  unregisterShortcuts()
  registerShortcuts(undefined, voiceOverride)
})

ipcMain.handle('ensureFunASRService', () => {
  return ensureFunASRService()
})

ipcMain.handle('getFunASRServiceStatus', () => {
  return getFunASRServiceStatus()
})

ipcMain.handle('restartFunASRService', () => {
  return restartFunASRService()
})

ipcMain.handle('shouldUseDarkColors', () => nativeTheme.shouldUseDarkColors)

ipcMain.handle('dialog:openDirectory', async () => {
  const { dialog } = require('electron')
  return await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
})

ipcMain.handle('dialog:openFile', async (_event, options) => {
  const { dialog } = require('electron')
  return await dialog.showOpenDialog(mainWindow!, {
    filters: options?.filters,
    properties: options?.properties || ['openFile'],
  })
})

ipcMain.handle('ensureProxy', (event, json) => {
  const config: { proxy?: string } = JSON.parse(json)
  proxy.ensure(config.proxy)
})

ipcMain.handle('relaunch', () => {
  app.relaunch()
  app.quit()
})

ipcMain.handle('analysticTrackingEvent', (event, dataJson) => {
  const data = JSON.parse(dataJson)
  analystic.event(data.name, data.params).catch((e) => {
    log.error('analystic_tracking_event', e)
  })
})

ipcMain.handle('getConfig', (event) => {
  return getConfig()
})

ipcMain.handle('getSettings', (event) => {
  return getSettings()
})

ipcMain.handle('shouldShowAboutDialogWhenStartUp', (event) => {
  const currentVersion = app.getVersion()
  if (store.get('lastShownAboutDialogVersion', '') === currentVersion) {
    return false
  }
  store.set('lastShownAboutDialogVersion', currentVersion)
  return true
})

ipcMain.handle('appLog', (event, dataJson) => {
  const data: { level: string; message: string } = JSON.parse(dataJson)
  data.message = 'APP_LOG: ' + data.message
  switch (data.level) {
    case 'info':
      log.info(data.message)
      break
    case 'error':
      log.error(data.message)
      break
    default:
      log.info(data.message)
  }
})

ipcMain.handle('exportLogs', async () => {
  try {
    const fs = await import('fs/promises')
    const logPath = log.transports.file.getFile()?.path
    if (!logPath) {
      return ''
    }
    const content = await fs.readFile(logPath, 'utf-8')
    return content
  } catch (error) {
    log.error('Failed to export logs:', error)
    return ''
  }
})

ipcMain.handle('clearLogs', async () => {
  try {
    const fs = await import('fs/promises')
    const logPath = log.transports.file.getFile()?.path
    if (logPath) {
      await fs.writeFile(logPath, '', 'utf-8')
    }
  } catch (error) {
    log.error('Failed to clear logs:', error)
  }
})

ipcMain.handle('ensureAutoLaunch', (event, enable: boolean) => {
  if (isDebug) {
    log.info('ensureAutoLaunch: skip by debug mode')
    return
  }
  return autoLauncher.ensure(enable)
})

ipcMain.handle('parseFileLocally', async (event, dataJSON: string) => {
  const params: { filePath: string } = JSON.parse(dataJSON)
  try {
    const data = await parseFile(params.filePath)
    return JSON.stringify({ text: data, isSupported: true })
  } catch (e) {
    return JSON.stringify({ isSupported: false })
  }
})

ipcMain.handle('parseUrl', async (event, url: string) => {
  // const result = await readability(url, { maxLength: 1000 })
  // const key = 'parseUrl-' + uuidv4()
  // await setStoreBlob(key, result.text)
  // return JSON.stringify({ key, title: result.title })
  return JSON.stringify({ key: '', title: '' })
})

ipcMain.handle('isFullscreen', () => {
  return mainWindow?.isFullScreen() || false
})

ipcMain.handle('setFullscreen', (event, enable: boolean) => {
  if (!mainWindow) {
    return
  }
  if (enable) {
    mainWindow.setFullScreen(true)
  } else {
    // 解决MacOS全屏下隐藏将黑屏的问题
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false)
    }
    mainWindow.hide()
  }
})

ipcMain.handle('switch-theme', (event, theme: 'dark' | 'light') => {
  if (!mainWindow || process.platform !== 'darwin' || typeof mainWindow.setTitleBarOverlay !== 'function') {
    return
  }
  mainWindow.setTitleBarOverlay({
    color: theme === 'dark' ? '#282828' : 'white',
    symbolColor: theme === 'dark' ? 'white' : 'black',
  })
})

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:maximize', () => {
  mainWindow?.maximize()
})

ipcMain.handle('window:unmaximize', () => {
  mainWindow?.unmaximize()
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

ipcMain.handle('window:is-maximized', () => {
  return mainWindow?.isMaximized()
})
