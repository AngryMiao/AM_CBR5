import { BrowserWindow, type BrowserWindowConstructorOptions, screen } from 'electron'
import log from 'electron-log/main'

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
  onClosed: (callback: (payload: TypelessChatResultClosedPayload) => void) => () => void
  sendToMainWindow: (channel: 'typelessChatResult:closed', payload: TypelessChatResultClosedPayload) => void
}) {
  args.ipcMain.handle('typelessChatResult:show', (_event, payload) => {
    return args.show(payload as TypelessChatResultPayload)
  })

  args.ipcMain.handle('typelessChatResult:hide', () => {
    return args.hide()
  })

  return args.onClosed((payload) => {
    args.sendToMainWindow('typelessChatResult:closed', payload)
  })
}

const CHAT_RESULT_WIDTH = 720
const CHAT_RESULT_HEIGHT = 420

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
    },
  }
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
      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #card {
        width: 680px;
        max-height: 380px;
        box-sizing: border-box;
        border-radius: 24px;
        overflow: hidden;
        border: 0;
        background: #10161f;
        color: #f8fafc;
        box-shadow: none;
        padding: 22px 24px 20px;
      }
      #header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      #title {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.2px;
      }
      #close {
        width: 30px;
        height: 30px;
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        font-size: 16px;
        color: #e2e8f0;
        background: rgba(255, 255, 255, 0.12);
      }
      #content {
        display: grid;
        gap: 14px;
      }
      .section {
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.06);
        padding: 14px 16px;
      }
      .label {
        font-size: 12px;
        line-height: 1;
        color: #94a3b8;
        margin-bottom: 10px;
      }
      .text {
        font-size: 15px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <div id="card">
      <div id="header">
        <div id="title">Typeless</div>
        <button id="close" type="button" aria-label="关闭">×</button>
      </div>
      <div id="content">
        <div class="section">
          <div class="label">ASR 识别内容</div>
          <div id="asrText" class="text"></div>
        </div>
        <div class="section">
          <div class="label">AI 聊天回复</div>
          <div id="replyText" class="text"></div>
        </div>
      </div>
    </div>
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

    // 用户手动关闭中央结果窗时只隐藏结果层，不允许系统把“关闭当前窗口”的焦点回退语义
    // 传播成主窗口重新唤起。
    if (!mainWindowVisibleBeforeResult) {
      suppressMainWindowAutoShowOnNextActivate = true
    }
    chatResultWindow?.blur()
    chatResultWindow?.hide()
    setTimeout(() => {
      restoreMainWindowVisibilityAfterClose?.()
    }, 0)

    if (lastPayload?.userMessageId) {
      emitTypelessChatResultClosed({ userMessageId: lastPayload.userMessageId })
    }
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
