import { useLayoutEffect, useState } from 'react'
import { HistoryPanel } from './features/history/HistoryPanel'
import { LogsPanel } from './features/logs/LogsPanel'
import { OverlayWindow } from './features/runtime/OverlayWindow'
import { ResultWindow } from './features/runtime/ResultWindow'
import { RuntimeStatus } from './features/runtime/RuntimeStatus'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { getCurrentWindowLabel } from './lib/tauri'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Home, 
  History, 
  Settings, 
  FileText, 
  Mic,
  Cpu
} from 'lucide-react'

type MainPanelKey = 'runtime' | 'history' | 'settings' | 'logs'

const MAIN_PANELS: Array<{
  key: MainPanelKey
  label: string
  icon: React.ReactNode
}> = [
  {
    key: 'runtime',
    label: '首页',
    icon: <Home className="w-4 h-4" />,
  },
  {
    key: 'history',
    label: '历史记录',
    icon: <History className="w-4 h-4" />,
  },
  {
    key: 'settings',
    label: '设置',
    icon: <Settings className="w-4 h-4" />,
  },
  {
    key: 'logs',
    label: '日志',
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
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/50 bg-card/30 flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight">AngryMiao</h1>
              <p className="text-xs text-muted-foreground">Voice Control</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4">
          <div className="space-y-1">
            {MAIN_PANELS.map((panel) => (
              <Button
                key={panel.key}
                variant={activePanel === panel.key ? 'secondary' : 'ghost'}
                className={`w-full justify-start gap-3 h-11 ${activePanel === panel.key ? 'bg-secondary/80 text-foreground' : 'text-muted-foreground'}`}
                onClick={() => setActivePanel(panel.key)}
              >
                {panel.icon}
                <span>{panel.label}</span>
              </Button>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Cpu className="w-3 h-3" />
            <span>System Ready</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-screen">
          <div className="p-8 max-w-6xl">
            {activePanel === 'runtime' && <RuntimeStatus />}
            {activePanel === 'history' && <HistoryPanel />}
            {activePanel === 'settings' && <SettingsPanel />}
            {activePanel === 'logs' && <LogsPanel />}
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}
