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
import {
  Activity,
  Server,
  Cpu,
  Settings,
  AlertCircle,
  CheckCircle,
  Mic,
  Globe,
  Link,
  Keyboard,
  Wrench,
} from 'lucide-react'

export function RuntimeStatus() {
  const { input_mode, detail, error: runtimeError } = useRuntimeSnapshot()
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
      ? '异常'
      : '正常'
    : '未启用'

  return (
    <section className="runtime-page">
      {/* Header section */}
      <header className="runtime-page-header">
        <div className="runtime-header-content">
          <div className="runtime-title-section">
            <div className="runtime-eyebrow">
              <Activity className="h-4 w-4" />
              <span>Runtime Workspace</span>
            </div>
            <h2 className="runtime-title">运行控制</h2>
            <p className="runtime-description">{detail || '管理运行状态、诊断和系统配置'}</p>
          </div>

          {/* Status cards row */}
          <div className="runtime-status-cards">
            <div className="runtime-status-card">
              <Activity className="runtime-status-icon" />
              <div className="runtime-status-info">
                <span className="runtime-status-label">输入模式</span>
                <span className="runtime-status-value">{getInputModeLabel(input_mode)}</span>
              </div>
            </div>
            <div className="runtime-status-card">
              <Mic className="runtime-status-icon" />
              <div className="runtime-status-info">
                <span className="runtime-status-label">麦克风</span>
                <span className="runtime-status-value">{selectedMicrophoneLabel}</span>
              </div>
            </div>
            <div className="runtime-status-card">
              <Globe className="runtime-status-icon" />
              <div className="runtime-status-info">
                <span className="runtime-status-label">平台</span>
                <span className="runtime-status-value">{platformDiagnostics?.platform_name ?? '加载中'}</span>
              </div>
            </div>
            <div className="runtime-status-card runtime-status-card-highlight">
              <Server className="runtime-status-icon" />
              <div className="runtime-status-info">
                <span className="runtime-status-label">MCP 服务</span>
                <span className="runtime-status-value">
                  {runtimeDiagnostics === null
                    ? '加载中'
                    : `${runtimeDiagnostics.active_server_count}/${runtimeDiagnostics.configured_server_count}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content area - all sections expanded */}
      <div className="runtime-content">
        <div className="runtime-sections">
          {/* Platform Diagnostics Section */}
          <div className="runtime-section-card">
            <div className="runtime-section-header">
              <Settings className="h-5 w-5 runtime-section-icon" />
              <span className="runtime-section-title">平台诊断</span>
            </div>
            <div className="runtime-detail-grid">
              <div className="runtime-detail-item">
                <Globe className="h-4 w-4 runtime-detail-icon" />
                <div className="runtime-detail-info">
                  <span className="runtime-detail-label">当前平台</span>
                  <span className="runtime-detail-value">{platformDiagnostics?.platform_name ?? '加载中'}</span>
                </div>
              </div>
              <div className="runtime-detail-item">
                <Mic className="h-4 w-4 runtime-detail-icon" />
                <div className="runtime-detail-info">
                  <span className="runtime-detail-label">麦克风权限</span>
                  <span className={`runtime-detail-value runtime-status-${getStatusClass(platformDiagnostics?.microphone_permission_status)}`}>
                    {platformDiagnostics?.microphone_permission_status ?? '加载中'}
                  </span>
                </div>
              </div>
              <div className="runtime-detail-item">
                <Keyboard className="h-4 w-4 runtime-detail-icon" />
                <div className="runtime-detail-info">
                  <span className="runtime-detail-label">输入控制权限</span>
                  <span className={`runtime-detail-value runtime-status-${getStatusClass(platformDiagnostics?.input_control_permission_status)}`}>
                    {platformDiagnostics?.input_control_permission_status ?? '加载中'}
                  </span>
                </div>
              </div>
              <div className="runtime-detail-item">
                <Activity className="h-4 w-4 runtime-detail-icon" />
                <div className="runtime-detail-info">
                  <span className="runtime-detail-label">热键后端</span>
                  <span className="runtime-detail-value">
                    {platformDiagnostics === null
                      ? '加载中'
                      : getHotkeyBackendLabel(platformDiagnostics.hotkey_backend)}
                  </span>
                </div>
              </div>
              <div className="runtime-detail-item">
                <Link className="h-4 w-4 runtime-detail-icon" />
                <div className="runtime-detail-info">
                  <span className="runtime-detail-label">深链</span>
                  <span className={`runtime-detail-value ${platformDiagnostics?.deep_link_registered ? 'runtime-status-success' : ''}`}>
                    {platformDiagnostics === null
                      ? '加载中'
                      : platformDiagnostics.deep_link_registered
                        ? `${platformDiagnostics.deep_link_scheme}:// 已注册`
                        : `${platformDiagnostics?.deep_link_scheme ?? 'voice-app'}:// 未注册`}
                  </span>
                </div>
              </div>
            </div>
            {platformDiagnostics?.permission_hint ? (
              <div className="runtime-alert runtime-alert-warning">
                <AlertCircle className="h-4 w-4" />
                <span>{platformDiagnostics.permission_hint}</span>
              </div>
            ) : null}
          </div>

          {/* MCP Runtime Section */}
          {runtimeDiagnostics ? (
            <div className="runtime-section-card">
              <div className="runtime-section-header">
                <Server className="h-5 w-5 runtime-section-icon" />
                <span className="runtime-section-title">MCP 运行时</span>
                <span className={`runtime-section-badge ${runtimeDiagnostics.active_server_count > 0 ? 'runtime-section-badge-success' : ''}`}>
                  {runtimeDiagnostics.active_server_count}/{runtimeDiagnostics.configured_server_count} 运行中
                </span>
              </div>
              <div className="runtime-server-section">
                <p className="runtime-section-desc">
                  已配置 {runtimeDiagnostics.configured_server_count} 个服务，当前活跃 {runtimeDiagnostics.active_server_count} 个
                </p>

                {runtimeDiagnostics.mcp_servers.length === 0 ? (
                  <div className="runtime-empty-hint">当前没有启用中的 MCP 服务</div>
                ) : (
                  <div className="runtime-server-list">
                    {runtimeDiagnostics.mcp_servers.map((server) => (
                      <div className={`runtime-server-item ${server.active_in_runtime ? 'runtime-server-active' : ''}`} key={server.id}>
                        <div className="runtime-server-info">
                          <span className="runtime-server-name">{server.name}</span>
                          <span className="runtime-server-id">{server.id}</span>
                        </div>
                        <span className={`runtime-server-status ${server.active_in_runtime ? 'runtime-status-active' : 'runtime-status-inactive'}`}>
                          {server.active_in_runtime ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5" />
                              运行中
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-3.5 w-3.5" />
                              未接通
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {runtimeDiagnostics.active_tools.length > 0 ? (
                  <div className="runtime-tools-section">
                    <span className="runtime-tools-label">
                      <Wrench className="h-4 w-4" />
                      已发现工具 ({runtimeDiagnostics.active_tools.length})
                    </span>
                    <div className="runtime-tools-list">
                      {runtimeDiagnostics.active_tools.map((tool) => (
                        <span className="runtime-tool-chip" key={tool.qualified_name}>
                          {tool.qualified_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {runtimeDiagnostics.mcp_last_sync_error ? (
                  <div className="runtime-alert runtime-alert-error">
                    <AlertCircle className="h-4 w-4" />
                    <span>MCP 运行时同步失败: {runtimeDiagnostics.mcp_last_sync_error}</span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* AngryMiao Runtime Section */}
          {runtimeDiagnostics ? (
            <div className="runtime-section-card">
              <div className="runtime-section-header">
                <Cpu className="h-5 w-5 runtime-section-icon" />
                <span className="runtime-section-title">AngryMiao 运行时</span>
                <span className={`runtime-section-badge ${angrymiaoStatus === '正常' ? 'runtime-section-badge-success' : angrymiaoStatus === '异常' ? 'runtime-section-badge-error' : ''}`}>
                  {angrymiaoStatus}
                </span>
              </div>
              <div className="runtime-diagnostic-grid">
                <div className={`runtime-diagnostic-item ${runtimeDiagnostics.angrymiao.bundle_installed ? 'runtime-diagnostic-success' : 'runtime-diagnostic-neutral'}`}>
                  <span className="runtime-diagnostic-label">技能包安装</span>
                  <span className="runtime-diagnostic-value">
                    {runtimeDiagnostics.angrymiao.bundle_installed ? '已安装' : '未安装'}
                  </span>
                </div>
                <div className={`runtime-diagnostic-item ${runtimeDiagnostics.angrymiao.supported_on_current_platform ? 'runtime-diagnostic-success' : 'runtime-diagnostic-neutral'}`}>
                  <span className="runtime-diagnostic-label">平台支持</span>
                  <span className="runtime-diagnostic-value">
                    {runtimeDiagnostics.angrymiao.supported_on_current_platform ? '已支持' : '未支持'}
                  </span>
                </div>
                <div className={`runtime-diagnostic-item ${runtimeDiagnostics.angrymiao.runtime_entry_exists ? 'runtime-diagnostic-success' : 'runtime-diagnostic-neutral'}`}>
                  <span className="runtime-diagnostic-label">运行入口</span>
                  <span className="runtime-diagnostic-value">
                    {runtimeDiagnostics.angrymiao.runtime_entry_exists ? '存在' : '缺失'}
                  </span>
                </div>
                <div className={`runtime-diagnostic-item ${runtimeDiagnostics.angrymiao.keyboard_driver_exists ? 'runtime-diagnostic-success' : 'runtime-diagnostic-neutral'}`}>
                  <span className="runtime-diagnostic-label">键盘驱动</span>
                  <span className="runtime-diagnostic-value">
                    {runtimeDiagnostics.angrymiao.keyboard_driver_exists ? '已就绪' : '未就绪'}
                  </span>
                </div>
              </div>

              {runtimeDiagnostics.angrymiao.keyboard_driver_source ? (
                <div className="runtime-driver-path">
                  <span className="runtime-driver-label">{getKeyboardDriverSourceLabel(runtimeDiagnostics.angrymiao.keyboard_driver_source)}</span>
                  <span className="runtime-driver-value">{runtimeDiagnostics.angrymiao.keyboard_driver_path ?? '未配置'}</span>
                </div>
              ) : null}

              {runtimeDiagnostics.angrymiao.missing_required_env.length > 0 ? (
                <div className="runtime-alert runtime-alert-warning">
                  <AlertCircle className="h-4 w-4" />
                  <span>缺少必填环境: {runtimeDiagnostics.angrymiao.missing_required_env.join('、')}</span>
                </div>
              ) : null}

              {runtimeDiagnostics.angrymiao.error ? (
                <div className="runtime-alert runtime-alert-error">
                  <AlertCircle className="h-4 w-4" />
                  <span>{runtimeDiagnostics.angrymiao.error}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Global error display */}
        {(error ?? runtimeError) ? (
          <div className="runtime-alert runtime-alert-error">
            <AlertCircle className="h-4 w-4" />
            <span>{error ?? runtimeError}</span>
          </div>
        ) : null}
      </div>
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

function getStatusClass(status: string | undefined): string {
  if (!status) return ''
  if (status.includes('已授权') || status.includes('granted')) return 'success'
  if (status.includes('未授权') || status.includes('denied')) return 'error'
  return ''
}