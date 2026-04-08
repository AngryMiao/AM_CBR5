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
  footer: string
}> = [
  {
    key: 'runtime',
    label: '首页',
    footer: 'Desktop shell',
  },
  {
    key: 'history',
    label: '历史记录',
    footer: 'List-first',
  },
  {
    key: 'settings',
    label: '设置',
    footer: 'Modal-style',
  },
  {
    key: 'logs',
    label: '日志',
    footer: 'Trace',
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
          <div className="workspace-brand">
            <strong>Voice App</strong>
            <small>Desktop</small>
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
              </button>
            ))}
          </nav>
          <div className="workspace-sidebar-spacer" />
          <div className="workspace-sidebar-footer">
            <span aria-live="polite" className="workspace-ready-badge">
              Ready
            </span>
            <small className="workspace-ready-note">{currentPanel.footer}</small>
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
