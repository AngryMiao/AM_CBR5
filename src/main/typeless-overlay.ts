import { BrowserWindow, type BrowserWindowConstructorOptions, screen } from 'electron'
import log from 'electron-log/main'

export type OverlayMode = 'listening' | 'processing' | 'executing' | 'inserting' | 'thinking' | 'success' | 'error'

export type OverlayState = {
  mode?: OverlayMode
  text?: string
}

const OVERLAY_WIDTH = 300
const OVERLAY_HEIGHT = 58

let overlayWindow: BrowserWindow | null = null
let overlayReady = false
let autoHideTimer: ReturnType<typeof setTimeout> | null = null
let lastState: Required<OverlayState> = {
  mode: 'listening',
  text: '正在聆听...',
}

export function buildTypelessOverlayWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      // 该窗口只承载极简悬浮 UI，显式禁用 DevTools，避免开发环境或 popup 调试偏好污染显示内容。
      devTools: false,
    },
  }
}

function clearAutoHideTimer() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer)
    autoHideTimer = null
  }
}

function scheduleAutoHide(mode: OverlayMode) {
  clearAutoHideTimer()
  if (mode === 'processing') {
    autoHideTimer = setTimeout(() => {
      hideTypelessOverlay()
    }, 4500)
    return
  }

  if (mode === 'success' || mode === 'error') {
    autoHideTimer = setTimeout(() => {
      hideTypelessOverlay()
    }, 1200)
  }
}

function getOverlayHtml(): string {
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
        background: transparent;
        overflow: hidden;
        font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      }
      #root {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #panel {
        min-width: 196px;
        max-width: 280px;
        height: 42px;
        border-radius: 14px;
        display: inline-flex;
        align-items: center;
        gap: 9px;
        padding: 0 12px;
        color: #f8fafc;
        background: rgba(15, 18, 24, 0.92);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.38);
        backdrop-filter: blur(10px) saturate(140%);
        user-select: none;
        white-space: nowrap;
      }
      #icon {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        flex-shrink: 0;
        color: var(--icon-color, #ffffff);
        background: var(--icon-bg, rgba(255, 255, 255, 0.14));
      }
      #text {
        font-size: 12px;
        letter-spacing: 0.2px;
        line-height: 1;
        max-width: 226px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .listening { --icon-bg: rgba(34, 197, 94, 0.24); --icon-color: #bbf7d0; }
      .processing { --icon-bg: rgba(245, 158, 11, 0.24); --icon-color: #fde68a; }
      .executing { --icon-bg: rgba(96, 165, 250, 0.24); --icon-color: #bfdbfe; }
      .inserting { --icon-bg: rgba(56, 189, 248, 0.24); --icon-color: #bae6fd; }
      .thinking { --icon-bg: rgba(167, 139, 250, 0.24); --icon-color: #ddd6fe; }
      .success { --icon-bg: rgba(74, 222, 128, 0.24); --icon-color: #bbf7d0; }
      .error { --icon-bg: rgba(248, 113, 113, 0.24); --icon-color: #fecaca; }
    </style>
  </head>
  <body>
    <div id="root">
      <div id="panel" class="listening">
        <span id="icon">🎤</span>
        <span id="text">正在聆听...</span>
      </div>
    </div>
    <script>
      const MODE_META = {
        listening: { icon: '●' },
        processing: { icon: '⋯' },
        executing: { icon: '⌘' },
        inserting: { icon: '⌨' },
        thinking: { icon: '✦' },
        success: { icon: '✓' },
        error: { icon: '!' }
      };

      window.__setTypelessOverlayState = (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const mode = payload.mode || 'listening';
        const text = payload.text || '正在聆听...';

        const panel = document.getElementById('panel');
        const icon = document.getElementById('icon');
        const textNode = document.getElementById('text');
        if (!panel || !icon || !textNode) return;

        panel.className = mode;
        icon.textContent = (MODE_META[mode] && MODE_META[mode].icon) || '●';
        textNode.textContent = text;
      };
    </script>
  </body>
</html>`
}

function positionOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return
  }

  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const { x, y, width, height } = display.workArea
  const left = x + Math.round((width - OVERLAY_WIDTH) / 2)
  const top = y + height - OVERLAY_HEIGHT - 30

  overlayWindow.setBounds({
    x: left,
    y: top,
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
  })
}

function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow
  }

  overlayReady = false
  overlayWindow = new BrowserWindow(buildTypelessOverlayWindowOptions())

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  positionOverlayWindow()

  overlayWindow.on('closed', () => {
    overlayWindow = null
    overlayReady = false
  })

  overlayWindow.webContents.once('did-finish-load', () => {
    overlayReady = true
    void pushOverlayState(lastState)
  })

  const html = getOverlayHtml()
  const url = `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`
  void overlayWindow.loadURL(url)
  return overlayWindow
}

async function pushOverlayState(state: Required<OverlayState>) {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayReady) {
    return
  }

  const payload = JSON.stringify(state)
  const script = `window.__setTypelessOverlayState(${payload});`
  try {
    await overlayWindow.webContents.executeJavaScript(script)
  } catch (error) {
    log.error('Failed to update typeless overlay:', error)
  }
}

function normalizeOverlayState(state?: OverlayState): Required<OverlayState> {
  return {
    mode: state?.mode ?? lastState.mode,
    text: state?.text ?? lastState.text,
  }
}

export function showTypelessOverlay(state?: OverlayState) {
  ensureOverlayWindow()
  lastState = normalizeOverlayState(state)
  void pushOverlayState(lastState)
  scheduleAutoHide(lastState.mode)
  positionOverlayWindow()
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive()
  }
}

export function updateTypelessOverlay(state: OverlayState) {
  ensureOverlayWindow()
  lastState = normalizeOverlayState(state)
  void pushOverlayState(lastState)
  scheduleAutoHide(lastState.mode)
}

export function hideTypelessOverlay() {
  clearAutoHideTimer()
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide()
  }
}

export function destroyTypelessOverlay() {
  clearAutoHideTimer()
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy()
  }
  overlayWindow = null
  overlayReady = false
}
