import { BrowserWindow, type BrowserWindowConstructorOptions, screen } from 'electron'
import log from 'electron-log/main'

export type OverlayMode = 'listening' | 'processing' | 'executing' | 'inserting' | 'thinking' | 'success' | 'error'

export type OverlayState = {
  mode?: OverlayMode
  text?: string
}

const OVERLAY_WIDTH = 300
const OVERLAY_HEIGHT = 128

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

export function getOverlayHtml(): string {
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
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      body {
        overflow: hidden;
      }
      .overlay-shell {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        overflow: hidden;
      }
      .overlay-bar {
        width: min(100%, 340px);
        display: grid;
        gap: 14px;
        padding: 16px 18px;
        border-radius: 22px;
        background: rgba(9, 14, 20, 0.82);
        box-shadow: 0 22px 48px rgba(0, 0, 0, 0.22);
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(18px);
        user-select: none;
      }
      .overlay-bar-listening { border-color: rgba(34, 197, 94, 0.2); }
      .overlay-bar-processing { border-color: rgba(245, 158, 11, 0.22); }
      .overlay-bar-thinking { border-color: rgba(167, 139, 250, 0.22); }
      .overlay-bar-executing { border-color: rgba(96, 165, 250, 0.22); }
      .overlay-bar-inserting { border-color: rgba(56, 189, 248, 0.22); }
      .overlay-bar-done { border-color: rgba(34, 197, 94, 0.24); }
      .overlay-bar-error { border-color: rgba(248, 113, 113, 0.24); }
      .overlay-status {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .overlay-icon {
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
      .overlay-status-copy {
        display: grid;
        gap: 4px;
      }
      .overlay-status-copy strong {
        font-size: 15px;
        font-weight: 700;
        color: #f8fafc;
      }
      .overlay-eyebrow {
        margin: 0;
        color: #9fb0c3;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 12px;
      }
      .overlay-body {
        display: grid;
        gap: 6px;
      }
      .overlay-primary {
        margin: 0;
        color: #f8fafc;
        font-size: 15px;
        font-weight: 600;
        line-height: 1.45;
        word-break: break-word;
      }
      .overlay-secondary {
        margin: 0;
        color: #9fb0c3;
        font-size: 12px;
        line-height: 1.45;
      }
      .overlay-secondary-error {
        color: #fca5a5;
      }
    </style>
  </head>
  <body>
    <main class="overlay-shell">
      <section id="panel" class="overlay-bar overlay-bar-listening">
        <div class="overlay-status">
          <span id="icon" aria-hidden="true" class="overlay-icon">●</span>
          <div class="overlay-status-copy">
            <p class="overlay-eyebrow">实时识别</p>
            <strong id="phase">正在聆听</strong>
          </div>
        </div>
        <div class="overlay-body">
          <p id="primary" class="overlay-primary">等待语音输入</p>
          <p id="secondary" class="overlay-secondary">按住语音快捷键开始输入</p>
        </div>
      </section>
    </main>
    <script>
      const MODE_META = {
        listening: {
          tone: 'listening',
          icon: '●',
          phase: '正在聆听',
          primary: '等待语音输入',
          secondary: '按住语音快捷键开始输入'
        },
        processing: {
          tone: 'processing',
          icon: '⋯',
          phase: '正在识别',
          primary: '正在识别...',
          secondary: null
        },
        thinking: {
          tone: 'thinking',
          icon: '✦',
          phase: '正在生成',
          primary: '正在思考...',
          secondary: null
        },
        executing: {
          tone: 'executing',
          icon: '⌘',
          phase: '正在执行',
          primary: '正在执行...',
          secondary: null
        },
        inserting: {
          tone: 'inserting',
          icon: '⌨',
          phase: '正在输出',
          primary: '正在输出...',
          secondary: null
        },
        success: {
          tone: 'done',
          icon: '✓',
          phase: '已完成',
          primary: '任务已完成',
          secondary: null
        },
        error: {
          tone: 'error',
          icon: '!',
          phase: '识别失败',
          primary: '任务执行失败',
          secondary: null
        }
      };

      window.__setTypelessOverlayState = (payload) => {
        if (!payload || typeof payload !== 'object') return;
        const mode = payload.mode || 'listening';
        const text = typeof payload.text === 'string' ? payload.text.trim() : '';
        const meta = MODE_META[mode] || MODE_META.listening;

        const panel = document.getElementById('panel');
        const icon = document.getElementById('icon');
        const phaseNode = document.getElementById('phase');
        const primaryNode = document.getElementById('primary');
        const secondaryNode = document.getElementById('secondary');
        if (!panel || !icon || !phaseNode || !primaryNode || !secondaryNode) return;

        panel.className = 'overlay-bar overlay-bar-' + meta.tone;
        icon.textContent = meta.icon;
        phaseNode.textContent = meta.phase;
        primaryNode.textContent = text || meta.primary;

        if (meta.secondary) {
          secondaryNode.textContent = meta.secondary;
          secondaryNode.className = 'overlay-secondary';
          secondaryNode.style.display = '';
        } else {
          secondaryNode.textContent = '';
          secondaryNode.className = mode === 'error' ? 'overlay-secondary overlay-secondary-error' : 'overlay-secondary';
          secondaryNode.style.display = 'none';
        }
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
