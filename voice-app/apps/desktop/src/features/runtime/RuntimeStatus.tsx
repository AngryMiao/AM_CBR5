import { useEffect, useState } from 'react'
import {
  getEditableSettings,
  getPlatformDiagnostics,
  getRuntimeDiagnostics,
  listMicrophoneInputs,
  listenPlatformDiagnostics,
  type EditableVoiceSettings,
  type MicrophoneInputDevice,
  type PlatformDiagnostics,
  type RuntimeDiagnostics,
} from '../../lib/tauri'
import { useRuntimeSnapshot } from './useRuntimeSnapshot'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Activity, 
  Server, 
  Cpu, 
  Settings,
  AlertCircle,
  Zap
} from 'lucide-react'

export function RuntimeStatus() {
  const { input_mode, result, detail, error: runtimeError } = useRuntimeSnapshot()
  const [error, setError] = useState<string | null>(null)
  const [platformDiagnostics, setPlatformDiagnostics] = useState<PlatformDiagnostics | null>(null)
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<RuntimeDiagnostics | null>(null)
  const [selectedMicrophoneLabel, setSelectedMicrophoneLabel] = useState('加载中')

  useEffect(() => {
    let disposed = false

    async function refreshRuntimeDiagnostics() {
      try {
        const nextDiagnostics = await getRuntimeDiagnostics()
        if (!disposed) {
          setRuntimeDiagnostics(nextDiagnostics)
        }
      } catch (cause: unknown) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : '加载运行时诊断失败')
        }
      }
    }

    async function refreshMicrophoneSelection() {
      const [settingsResult, microphonesResult] = await Promise.allSettled([
        getEditableSettings(),
        listMicrophoneInputs(),
      ])

      if (disposed) {
        return
      }

      const nextSettings = settingsResult.status === 'fulfilled' ? settingsResult.value : null
      const nextMicrophones = microphonesResult.status === 'fulfilled' ? microphonesResult.value : []

      setSelectedMicrophoneLabel(resolveMicrophoneLabel(nextSettings, nextMicrophones))
    }

    const unlistenPromise = listenPlatformDiagnostics((nextDiagnostics) => {
      if (!disposed) {
        setPlatformDiagnostics(nextDiagnostics)
      }
      void refreshRuntimeDiagnostics()
      void refreshMicrophoneSelection()
    }).catch(() => () => {})

    void Promise.all([getPlatformDiagnostics(), getRuntimeDiagnostics()])
      .then(([nextPlatformDiagnostics, nextRuntimeDiagnostics]) => {
        if (disposed) {
          return
        }

        setPlatformDiagnostics(nextPlatformDiagnostics)
        setRuntimeDiagnostics(nextRuntimeDiagnostics)
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : '加载平台诊断失败')
        }
      })

    void refreshMicrophoneSelection()

    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  const angrymiaoStatus = runtimeDiagnostics?.angrymiao.enabled_in_settings
    ? runtimeDiagnostics.angrymiao.error
      ? '已启用但异常'
      : '已启用'
    : '未启用'
  const platformCards = [
    {
      label: '当前平台',
      value: platformDiagnostics?.platform_name ?? '加载中',
    },
    {
      label: '麦克风权限',
      value: platformDiagnostics?.microphone_permission_status ?? '加载中',
    },
    {
      label: '输入控制权限',
      value: platformDiagnostics?.input_control_permission_status ?? '加载中',
    },
    {
      label: '热键后端',
      value:
        platformDiagnostics === null
          ? '加载中'
          : getHotkeyBackendLabel(platformDiagnostics.hotkey_backend),
    },
    {
      label: '深链',
      value:
        platformDiagnostics === null
          ? '加载中'
          : platformDiagnostics.deep_link_registered
            ? `${platformDiagnostics.deep_link_scheme}:// 已注册`
            : `${platformDiagnostics?.deep_link_scheme ?? 'voice-app'}:// 未注册`,
    },
  ]
  const runtimeCards = [
    {
      label: 'MCP 服务',
      value:
        runtimeDiagnostics === null
          ? '加载中'
          : `${runtimeDiagnostics.active_server_count}/${runtimeDiagnostics.configured_server_count}`,
    },
  ]
  const runtimeNotices = [
    platformDiagnostics?.last_deep_link
      ? {
          label: '最近深链',
          value: platformDiagnostics.last_deep_link,
        }
      : null,
    platformDiagnostics?.hotkey_backend_error
      ? {
          label: '热键错误',
          value: platformDiagnostics.hotkey_backend_error,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>
  const topStatusItems = [
    {
      label: '输入模式',
      value: getInputModeLabel(input_mode),
    },
    {
      label: '当前麦克风',
      value: selectedMicrophoneLabel,
    },
    {
      label: '当前平台',
      value: platformDiagnostics?.platform_name ?? '加载中',
    },
    {
      label: 'MCP 服务',
      value:
        runtimeDiagnostics === null
          ? '加载中'
          : `${runtimeDiagnostics.active_server_count}/${runtimeDiagnostics.configured_server_count}`,
    },
  ]

  return (
    <section className="runtime-panel">
      {/* Header section */}
      <header className="runtime-header">
        <div className="runtime-eyebrow">
          <span className="runtime-label">RUNTIME WORKSPACE</span>
          <Badge variant="secondary">
            <Activity className="mr-1 h-3 w-3" />
            {getInputModeLabel(input_mode)}
          </Badge>
        </div>
        <h1 className="runtime-title">运行控制</h1>
        <p className="runtime-description">{detail}</p>
      </header>

      {/* Status row - inline items */}
      <div className="runtime-status-row">
        {topStatusItems.map((item, index) => (
          <div
            className={`runtime-status-item ${index === 3 ? 'runtime-status-item-success' : ''}`}
            key={item.label}
          >
            <div className="runtime-status-item-label">{item.label}</div>
            <div className="runtime-status-item-value">{item.value}</div>
          </div>
        ))}
      </div>

      <Separator />

      {/* Main two-column layout */}
      <div className="runtime-columns">
        {/* Left column - main content */}
        <div className="runtime-main-column">
          {/* Task result section */}
          <section className="runtime-section-new">
            <div className="runtime-section-header-new">
              <Zap className="h-4 w-4 runtime-section-header-icon" />
              <span>任务结果</span>
            </div>
            <div className="runtime-detail-row-new">
              <span className="runtime-detail-label-new runtime-entry-label">识别结果</span>
            </div>
            <p className="runtime-entry-value">{result || '等待 LLM 输出...'}</p>
            {runtimeNotices.map((notice) => (
              <div className="runtime-detail-row-new" key={notice.label}>
                <span className="runtime-detail-label-new">{notice.label}</span>
                <strong className="runtime-detail-value-new">{notice.value}</strong>
              </div>
            ))}
            {platformDiagnostics?.permission_hint ? (
              <div className="runtime-alert runtime-alert-warning">
                <AlertCircle className="h-4 w-4" />
                <span>{platformDiagnostics.permission_hint}</span>
              </div>
            ) : null}
          </section>

          {/* Real-time summary section */}
          <section className="runtime-section-new">
            <div className="runtime-section-header-new">
              <Activity className="h-4 w-4 runtime-section-header-icon" />
              <span>实时摘要</span>
            </div>
            {platformCards.map((card) => (
              <div className="runtime-detail-row-new" key={card.label}>
                <span className="runtime-detail-label-new">{card.label}</span>
                <strong className="runtime-detail-value-new">{card.value}</strong>
              </div>
            ))}
            {runtimeCards.map((card) => (
              <div className="runtime-detail-row-new" key={card.label}>
                <span className="runtime-detail-label-new">{card.label}</span>
                <strong className="runtime-detail-value-new">{card.value}</strong>
              </div>
            ))}
          </section>
        </div>

        {/* Right column - side info */}
        <div className="runtime-side-column-new">
          {/* System status section */}
          <section className="runtime-section-new">
            <div className="runtime-section-header-new">
              <Settings className="h-4 w-4 runtime-section-header-icon" />
              <span>系统状态</span>
            </div>
            {platformCards.map((card) => (
              <div className="runtime-detail-row-new" key={`side-${card.label}`}>
                <span className="runtime-detail-label-new">{card.label}</span>
                <strong className="runtime-detail-value-new">{card.value}</strong>
              </div>
            ))}
            <div className="runtime-detail-row-new">
              <span className="runtime-detail-label-new">AngryMiao</span>
              <Badge
                variant={
                  angrymiaoStatus.includes('异常') || angrymiaoStatus === '未启用'
                    ? 'secondary'
                    : 'default'
                }
              >
                {angrymiaoStatus}
              </Badge>
            </div>
          </section>

          {/* MCP Runtime section */}
          {runtimeDiagnostics ? (
            <section className="runtime-section-new">
              <div className="runtime-section-header-new">
                <Server className="h-4 w-4 runtime-section-header-icon" />
                <span>MCP 运行时</span>
                <Badge variant="outline">
                  {runtimeDiagnostics.active_server_count}/{runtimeDiagnostics.configured_server_count}
                </Badge>
              </div>
              <p className="runtime-supporting-copy-new">
                已配置 {runtimeDiagnostics.configured_server_count} 个服务，当前活跃 {runtimeDiagnostics.active_server_count} 个。
              </p>
              {runtimeDiagnostics.skill_bundle_root ? (
                <p className="runtime-supporting-copy-new">内置技能包根目录：{runtimeDiagnostics.skill_bundle_root}</p>
              ) : null}
              {runtimeDiagnostics.mcp_servers.length === 0 ? (
                <p className="runtime-supporting-copy-new">当前没有启用中的 MCP 服务。</p>
              ) : (
                <div className="runtime-server-list-new">
                  {runtimeDiagnostics.mcp_servers.map((server) => (
                    <div className="runtime-server-item" key={server.id}>
                      <div className="runtime-server-info">
                        <strong className="runtime-server-name">{server.name}</strong>
                        <span className="runtime-server-id">{server.id}</span>
                      </div>
                      <Badge variant={server.active_in_runtime ? 'default' : 'secondary'}>
                        {server.active_in_runtime ? '运行中' : '未接通'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {runtimeDiagnostics.active_tools.length > 0 ? (
                <>
                  <Separator />
                  <div>
                    <span className="runtime-entry-label runtime-detail-label-new">已发现工具</span>
                    <div className="runtime-tool-chips">
                      {runtimeDiagnostics.active_tools.map((tool) => (
                        <span className="runtime-tool-chip" key={tool.qualified_name}>
                          {tool.qualified_name}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              {runtimeDiagnostics.mcp_last_sync_error ? (
                <div className="runtime-alert runtime-alert-danger">
                  <AlertCircle className="h-4 w-4" />
                  <span>MCP 运行时同步失败: {runtimeDiagnostics.mcp_last_sync_error}</span>
                </div>
              ) : null}
            </section>
          ) : null}

          {/* AngryMiao Runtime section */}
          {runtimeDiagnostics ? (
            <section className="runtime-section-new">
              <div className="runtime-section-header-new">
                <Cpu className="h-4 w-4 runtime-section-header-icon" />
                <span>AngryMiao 运行时</span>
              </div>
              <div className="runtime-diagnostic-grid">
                <div className="runtime-diagnostic-stat">
                  <span>技能包安装</span>
                  <strong>{runtimeDiagnostics.angrymiao.bundle_installed ? '已安装' : '未安装'}</strong>
                </div>
                <div className="runtime-diagnostic-stat">
                  <span>当前平台</span>
                  <strong>{runtimeDiagnostics.angrymiao.supported_on_current_platform ? '已支持' : '未支持'}</strong>
                </div>
                <div className="runtime-diagnostic-stat">
                  <span>运行入口</span>
                  <strong>{runtimeDiagnostics.angrymiao.runtime_entry_exists ? '存在' : '缺失'}</strong>
                </div>
                <div className="runtime-diagnostic-stat">
                  <span>键盘驱动</span>
                  <strong>{runtimeDiagnostics.angrymiao.keyboard_driver_exists ? '已就绪' : '未就绪'}</strong>
                </div>
              </div>

              {runtimeDiagnostics.angrymiao.keyboard_driver_source ? (
                <div className="runtime-detail-row-new">
                  <span className="runtime-detail-label-new">{getKeyboardDriverSourceLabel(runtimeDiagnostics.angrymiao.keyboard_driver_source)}</span>
                  <strong className="runtime-detail-value-new">{runtimeDiagnostics.angrymiao.keyboard_driver_path ?? '未配置'}</strong>
                </div>
              ) : null}

              {runtimeDiagnostics.angrymiao.missing_required_env.length > 0 ? (
                <div className="runtime-alert runtime-alert-warning">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    缺少必填环境: {runtimeDiagnostics.angrymiao.missing_required_env.join('、')}
                  </span>
                </div>
              ) : null}

              {runtimeDiagnostics.angrymiao.error ? (
                <div className="runtime-alert runtime-alert-danger">
                  <AlertCircle className="h-4 w-4" />
                  <span>{runtimeDiagnostics.angrymiao.error}</span>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {/* Error display */}
      {(error ?? runtimeError) ? (
        <div className="runtime-alert runtime-alert-danger">
          <AlertCircle className="h-4 w-4" />
          <span>{error ?? runtimeError}</span>
        </div>
      ) : null}
    </section>
  )
}

function resolveMicrophoneLabel(
  settings: EditableVoiceSettings | null,
  devices: MicrophoneInputDevice[],
) {
  const defaultDevice = devices.find((device) => device.is_default)
  const selectedDeviceId = settings?.microphone_device_id.trim() ?? ''

  if (!selectedDeviceId) {
    return defaultDevice?.label ?? '系统默认麦克风'
  }

  const selectedDevice = devices.find((device) => device.id === selectedDeviceId)
  return selectedDevice?.label ?? '已保存设备不可用'
}

function getHotkeyBackendLabel(backend: string) {
  if (backend === '原生键盘 Hook') {
    return '原生键盘钩子'
  }

  return backend
}

function getKeyboardDriverSourceLabel(source: string) {
  if (source === 'bundle 默认路径') {
    return '技能包默认路径'
  }

  return source
}

function getInputModeLabel(inputMode: string) {
  if (inputMode === 'transcription') {
    return '转录模式'
  }

  if (inputMode === 'agent') {
    return '指令模式'
  }

  return '待命'
}
