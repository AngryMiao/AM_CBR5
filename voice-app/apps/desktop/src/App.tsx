import { useLayoutEffect, useState } from 'react'
import { HistoryPanel } from './features/history/HistoryPanel'
import { LogsPanel } from './features/logs/LogsPanel'
import { OverlayWindow } from './features/runtime/OverlayWindow'
import { ResultWindow } from './features/runtime/ResultWindow'
import { RuntimeStatus } from './features/runtime/RuntimeStatus'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { getCurrentWindowLabel } from './lib/tauri'

type MainPanelKey = 'runtime' | 'history' | 'settings' | 'logs'

const MAIN_PANELS: Array<{
  key: MainPanelKey
  label: string
  eyebrow: string
  summary: string
}> = [
  {
    key: 'runtime',
    label: '运行状态',
    eyebrow: 'Runtime',
    summary: '查看当前热键链路、平台诊断和实时语音状态。',
  },
  {
    key: 'history',
    label: '历史记录',
    eyebrow: 'History',
    summary: '回看识别文本、任务结果和重试记录。',
  },
  {
    key: 'settings',
    label: '设置',
    eyebrow: 'Settings',
    summary: '编辑 `settings.json` 中的热键、豆包 ASR、LLM 和 MCP 配置。',
  },
  {
    key: 'logs',
    label: '日志',
    eyebrow: 'Logs',
    summary: '查看运行日志、筛选诊断信息并导出本地日志。',
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

  const currentPanel =
    MAIN_PANELS.find((panel) => panel.key === activePanel) ?? MAIN_PANELS[0]

  return (
    <main className="app-shell">
      <section className="workspace-shell">
        <aside className="workspace-sidebar">
          <div className="hero">
            <p className="hero-eyebrow">Voice Agent</p>
            <h1>Voice App</h1>
            <p>Rust + Tauri 后台语音代理控制台</p>
          </div>
          <nav aria-label="主导航" className="workspace-menu">
            {MAIN_PANELS.map((panel) => (
              <button
                key={panel.key}
                aria-label={panel.label}
                aria-pressed={panel.key === activePanel}
                className="workspace-menu-item"
                data-active={panel.key === activePanel ? 'true' : 'false'}
                type="button"
                onClick={() => setActivePanel(panel.key)}
              >
                <span>{panel.label}</span>
                <small>{panel.eyebrow}</small>
              </button>
            ))}
          </nav>
          <div className="workspace-summary">
            <span>{currentPanel.eyebrow}</span>
            <strong>{currentPanel.label}</strong>
            <p>{currentPanel.summary}</p>
          </div>
        </aside>

        <section className="workspace-content">
          {activePanel === 'runtime' ? <RuntimeStatus /> : null}
          {activePanel === 'history' ? <HistoryPanel /> : null}
          {activePanel === 'settings' ? <SettingsPanel /> : null}
          {activePanel === 'logs' ? <LogsPanel /> : null}
        </section>
      </section>
    </main>
  )
}
