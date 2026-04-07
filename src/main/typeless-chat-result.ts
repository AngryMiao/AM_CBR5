import { app, BrowserWindow, type BrowserWindowConstructorOptions, screen } from 'electron'
import log from 'electron-log/main'
import path from 'node:path'

export type TypelessChatResultPayload = {
  userMessageId: string
  asrText: string
  replyText: string
}

export type TypelessChatResultClosedPayload = {
  userMessageId: string
}

export function registerTypelessChatResultIpc(args: {
  ipcMain: {
    handle: (channel: string, listener: (event: unknown, payload?: unknown) => unknown) => void
  }
  show: (payload: TypelessChatResultPayload) => unknown
  hide: () => unknown
  close: () => unknown
  onClosed: (callback: (payload: TypelessChatResultClosedPayload) => void) => () => void
  sendToMainWindow: (channel: 'typelessChatResult:closed', payload: TypelessChatResultClosedPayload) => void
}) {
  args.ipcMain.handle('typelessChatResult:show', (_event, payload) => {
    return args.show(payload as TypelessChatResultPayload)
  })

  args.ipcMain.handle('typelessChatResult:hide', () => {
    return args.hide()
  })

  args.ipcMain.handle('typelessChatResult:close', () => {
    return args.close()
  })

  return args.onClosed((payload) => {
    args.sendToMainWindow('typelessChatResult:closed', payload)
  })
}

const CHAT_RESULT_WIDTH = 720
const CHAT_RESULT_HEIGHT = 520

let chatResultWindow: BrowserWindow | null = null
let chatResultReady = false
let lastPayload: TypelessChatResultPayload | null = null
let suppressNextClosedEvent = false
let mainWindowVisibleBeforeResult = true
let suppressMainWindowAutoShowOnNextActivate = false
let restoreMainWindowVisibilityAfterClose: (() => void) | null = null
const closeListeners = new Set<(payload: TypelessChatResultClosedPayload) => void>()

export function consumeSuppressMainWindowAutoShowOnActivate() {
  const shouldSuppress = suppressMainWindowAutoShowOnNextActivate
  suppressMainWindowAutoShowOnNextActivate = false
  return shouldSuppress
}

export function buildTypelessChatResultWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: CHAT_RESULT_WIDTH,
    height: CHAT_RESULT_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      devTools: false,
      preload: getTypelessChatResultPreloadPath(),
    },
  }
}

function getTypelessChatResultPreloadPath() {
  return app.isPackaged ? path.join(__dirname, '../preload/index.js') : path.join(__dirname, '../../out/preload/index.js')
}

export function getTypelessChatResultDisplayBounds(workArea: {
  x: number
  y: number
  width: number
  height: number
}) {
  return {
    x: workArea.x + Math.round((workArea.width - CHAT_RESULT_WIDTH) / 2),
    y: workArea.y + Math.round((workArea.height - CHAT_RESULT_HEIGHT) / 2),
    width: CHAT_RESULT_WIDTH,
    height: CHAT_RESULT_HEIGHT,
  }
}

export function getTypelessChatResultHtml() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .result-shell {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        overflow: hidden;
      }
      .result-card {
        width: min(100%, 680px);
        max-height: 100%;
        display: grid;
        gap: 16px;
        border-radius: 28px;
        padding: 22px 24px;
        background: rgba(12, 18, 25, 0.94);
        color: #f8fafc;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(18px);
      }
      .result-topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .result-topline-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .result-eyebrow {
        margin: 0;
        color: #9fb0c3;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 12px;
      }
      .phase-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(34, 197, 94, 0.16);
        color: #bbf7d0;
        font-size: 12px;
        font-weight: 600;
      }
      .result-close {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
        color: #edf2f7;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
      }
      .result-close:hover {
        background: rgba(255, 255, 255, 0.18);
      }
      .result-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }
      .result-header-copy {
        display: grid;
        gap: 10px;
      }
      .result-header h1 {
        margin: 0;
        font-size: 30px;
        line-height: 1;
      }
      .result-copy {
        margin: 0;
        color: #d5dee8;
        line-height: 1.5;
      }
      .result-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
        color: #f8fafc;
        font-size: 16px;
        font-weight: 700;
      }
      .result-grid {
        display: grid;
        gap: 12px;
        margin: 0;
      }
      .result-block {
        display: grid;
        gap: 6px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.04);
      }
      .result-block dt {
        margin: 0;
        color: #9fb0c3;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .result-block dd {
        margin: 0;
        font-size: 15px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .result-hint {
        margin: 0;
        color: #9fb0c3;
        font-size: 13px;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <main class="result-shell">
      <section class="result-card result-card-done">
        <div class="result-topline">
          <p class="result-eyebrow">Voice App</p>
          <div class="result-topline-actions">
            <span class="phase-chip phase-done">已完成</span>
            <button id="close" aria-label="关闭结果窗口" class="result-close" type="button">×</button>
          </div>
        </div>
        <div class="result-header">
          <div class="result-header-copy">
            <h1>任务结果</h1>
            <p class="result-copy">语音对话已完成，下面是本轮识别与回复结果。</p>
          </div>
          <span aria-hidden="true" class="result-icon">✓</span>
        </div>
        <dl class="result-grid">
          <div class="result-block">
            <dt>识别内容</dt>
            <dd id="asrText">暂无识别文本。</dd>
          </div>
          <div class="result-block">
            <dt>执行结果</dt>
            <dd id="replyText">暂无结果。</dd>
          </div>
        </dl>
        <p class="result-hint">结果会自动写入历史记录，供后续预览和重试。</p>
      </section>
    </main>
    <script>
      window.__setTypelessChatResultState = (payload) => {
        if (!payload || typeof payload !== 'object') {
          return;
        }

        const asrNode = document.getElementById('asrText');
        const replyNode = document.getElementById('replyText');
        if (!asrNode || !replyNode) {
          return;
        }

        asrNode.textContent = payload.asrText || '';
        replyNode.textContent = payload.replyText || '';
      };

      const closeButton = document.getElementById('close');
      if (closeButton) {
        closeButton.addEventListener('click', () => {
          if (window.electronAPI && typeof window.electronAPI.closeTypelessChatResult === 'function') {
            window.electronAPI.closeTypelessChatResult();
            return;
          }
          window.close();
        });
      }
    </script>
  </body>
</html>`
}

function positionTypelessChatResultWindow() {
  if (!chatResultWindow || chatResultWindow.isDestroyed()) {
    return
  }

  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  chatResultWindow.setBounds(getTypelessChatResultDisplayBounds(display.workArea))
}

function emitTypelessChatResultClosed(payload: TypelessChatResultClosedPayload) {
  for (const listener of closeListeners) {
    listener(payload)
  }
}

function requestTypelessChatResultClose() {
  if (!chatResultWindow || chatResultWindow.isDestroyed()) {
    return false
  }

  if (!mainWindowVisibleBeforeResult) {
    suppressMainWindowAutoShowOnNextActivate = true
  }

  chatResultWindow.blur()
  chatResultWindow.hide()
  setTimeout(() => {
    restoreMainWindowVisibilityAfterClose?.()
  }, 0)

  if (lastPayload?.userMessageId) {
    emitTypelessChatResultClosed({ userMessageId: lastPayload.userMessageId })
  }

  return true
}

function ensureTypelessChatResultWindow() {
  if (chatResultWindow && !chatResultWindow.isDestroyed()) {
    return chatResultWindow
  }

  chatResultReady = false
  chatResultWindow = new BrowserWindow(buildTypelessChatResultWindowOptions())
  chatResultWindow.setAlwaysOnTop(true, 'screen-saver')
  chatResultWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  positionTypelessChatResultWindow()

  chatResultWindow.on('close', (event) => {
    if (suppressNextClosedEvent) {
      return
    }

    event.preventDefault()
    requestTypelessChatResultClose()
  })

  chatResultWindow.on('closed', () => {
    const closedPayload = lastPayload
    const shouldEmitClosedEvent = !suppressNextClosedEvent

    chatResultWindow = null
    chatResultReady = false
    suppressNextClosedEvent = false

    if (shouldEmitClosedEvent && closedPayload?.userMessageId) {
      emitTypelessChatResultClosed({ userMessageId: closedPayload.userMessageId })
    }
  })

  chatResultWindow.webContents.once('did-finish-load', () => {
    chatResultReady = true
    if (lastPayload) {
      void pushTypelessChatResultState(lastPayload)
    }
  })

  const url = `data:text/html;charset=UTF-8,${encodeURIComponent(getTypelessChatResultHtml())}`
  void chatResultWindow.loadURL(url)
  return chatResultWindow
}

async function pushTypelessChatResultState(payload: TypelessChatResultPayload) {
  if (!chatResultWindow || chatResultWindow.isDestroyed() || !chatResultReady) {
    return
  }

  try {
    const script = `window.__setTypelessChatResultState(${JSON.stringify(payload)});`
    await chatResultWindow.webContents.executeJavaScript(script)
  } catch (error) {
    log.error('Failed to update typeless chat result window:', error)
  }
}

export function onTypelessChatResultClosed(callback: (payload: TypelessChatResultClosedPayload) => void) {
  closeListeners.add(callback)
  return () => {
    closeListeners.delete(callback)
  }
}

export async function showTypelessChatResult(
  payload: TypelessChatResultPayload,
  options?: { mainWindowVisible?: boolean; restoreMainWindowVisibility?: () => void }
) {
  lastPayload = payload
  mainWindowVisibleBeforeResult = options?.mainWindowVisible ?? true
  restoreMainWindowVisibilityAfterClose = options?.restoreMainWindowVisibility ?? null
  const hadReadyWindow = !!chatResultWindow && !chatResultWindow.isDestroyed() && chatResultReady
  const window = ensureTypelessChatResultWindow()

  positionTypelessChatResultWindow()
  if (hadReadyWindow) {
    await pushTypelessChatResultState(payload)
  }

  window.showInactive()
}

export function hideTypelessChatResult() {
  if (chatResultWindow && !chatResultWindow.isDestroyed()) {
    chatResultWindow.hide()
  }
}

export function closeTypelessChatResult() {
  return requestTypelessChatResultClose()
}

export function destroyTypelessChatResult() {
  if (!chatResultWindow || chatResultWindow.isDestroyed()) {
    chatResultWindow = null
    chatResultReady = false
    suppressNextClosedEvent = false
    restoreMainWindowVisibilityAfterClose = null
    return
  }

  suppressNextClosedEvent = true
  chatResultWindow.destroy()
  chatResultWindow = null
  chatResultReady = false
  restoreMainWindowVisibilityAfterClose = null
}
