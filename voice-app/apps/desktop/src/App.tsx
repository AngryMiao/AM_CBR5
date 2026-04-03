import { HistoryPanel } from './features/history/HistoryPanel'
import { LogsPanel } from './features/logs/LogsPanel'
import { RuntimeStatus } from './features/runtime/RuntimeStatus'
import { SettingsPanel } from './features/settings/SettingsPanel'

export default function App() {
  return (
    <main className="app-shell">
      <header className="hero">
        <h1>Voice App</h1>
        <p>Background-first voice agent</p>
      </header>
      <RuntimeStatus />
      <HistoryPanel />
      <SettingsPanel />
      <LogsPanel />
    </main>
  )
}
