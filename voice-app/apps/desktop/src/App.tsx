import { useLayoutEffect, useState } from 'react'
import { HistoryPanel } from './features/history/HistoryPanel'
import { LogsPanel } from './features/logs/LogsPanel'
import { OverlayWindow } from './features/runtime/OverlayWindow'
import { ResultWindow } from './features/runtime/ResultWindow'
import { RuntimeStatus } from './features/runtime/RuntimeStatus'
import { SettingsPanel } from './features/settings/SettingsPanel'
import {
  closeCurrentWindow,
  getCurrentWindowLabel,
  minimizeCurrentWindow,
  toggleCurrentWindowMaximize,
} from './lib/tauri'
import { Button } from '@/components/ui/button'
import {
  Home,
  History,
  Settings,
  FileText,
  Mic,
  Minus,
  Square,
  X
} from 'lucide-react'

type MainPanelKey = 'runtime' | 'history' | 'settings' | 'logs'

const MAIN_PANELS: Array<{
  key: MainPanelKey
  label: string
  title: string
  description: string
  icon: React.ReactNode
}> = [
  {
    key: 'runtime',
    label: '首页',
    title: '运行控制',
    description: '当前语音任务、系统状态与运行摘要。',
    icon: <Home className="w-4 h-4" />,
  },
  {
    key: 'settings',
    label: '设置',
    title: '设置中心',
    description: '管理热键、模型、设备和 MCP 配置。',
    icon: <Settings className="w-4 h-4" />,
  },
  {
    key: 'history',
    label: '历史记录',
    title: '任务历史',
    description: '查看识别结果、重试任务并预览输出。',
    icon: <History className="w-4 h-4" />,
  },
  {
    key: 'logs',
    label: '日志',
    title: '运行日志',
    description: '查看运行日志、筛选错误并导出记录。',
    icon: <FileText className="w-4 h-4" />,
  },
]

export default function App() {
  const windowLabel = getCurrentWindowLabel()
  const [activePanel, setActivePanel] = useState<MainPanelKey>('runtime')

  useLayoutEffect(() => {
    document.documentElement.dataset.window = windowLabel
    document.body.dataset.window = windowLabel

    return () => {
      delete document.documentElement.dataset.window
      delete document.body.dataset.window
    }
  }, [windowLabel])

  if (windowLabel === 'overlay') {
    return <OverlayWindow />
  }

  if (windowLabel === 'result') {
    return <ResultWindow />
  }

  return (
    <div className="desktop-shell">
      <header className="desktop-titlebar">
        <div
          aria-label="窗口拖拽区"
          className="desktop-titlebar-drag"
          data-tauri-drag-region
        />

        <div className="desktop-window-controls">
          <Button
            aria-label="最小化窗口"
            className="desktop-window-button"
            onClick={() => void minimizeCurrentWindow()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            aria-label="切换窗口最大化"
            className="desktop-window-button"
            onClick={() => void toggleCurrentWindowMaximize()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
          <Button
            aria-label="关闭窗口"
            className="desktop-window-button desktop-window-button-danger"
            onClick={() => void closeCurrentWindow()}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="desktop-workspace">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar-head">
            <div className="workspace-sidebar-heading">
              <span className="workspace-sidebar-brand-mark" aria-hidden="true">
                <Mic className="w-4 h-4" />
              </span>
              <strong>AngryMiao</strong>
            </div>
          </div>

          <nav aria-label="主导航" className="workspace-nav">
            {MAIN_PANELS.map((panel) => (
              <Button
                key={panel.key}
                aria-current={activePanel === panel.key ? 'page' : undefined}
                className={`workspace-nav-button ${activePanel === panel.key ? 'workspace-nav-button-active' : ''}`}
                onClick={() => setActivePanel(panel.key)}
                variant="ghost"
              >
                <span className="workspace-nav-icon">{panel.icon}</span>
                <span>{panel.label}</span>
              </Button>
            ))}
          </nav>
        </aside>

        <main className="workspace-main">
          {activePanel === 'settings' ? (
            <section className="workspace-panel animate-panel-fade-in" data-panel={activePanel} key="settings">
              <SettingsPanel />
            </section>
          ) : activePanel === 'history' ? (
            <section className="workspace-panel animate-panel-fade-in" data-panel={activePanel} key="history">
              <HistoryPanel />
            </section>
          ) : activePanel === 'logs' ? (
            <section className="workspace-panel animate-panel-fade-in" data-panel={activePanel} key="logs">
              <LogsPanel />
            </section>
          ) : activePanel === 'runtime' ? (
            <section className="workspace-panel animate-panel-fade-in" data-panel={activePanel} key="runtime">
              <RuntimeStatus />
            </section>
          ) : null}
        </main>
      </div>
    </div>
  )
}
