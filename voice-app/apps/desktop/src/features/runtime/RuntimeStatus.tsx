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
    <section className="panel runtime-panel">
      <h2 className="sr-only">首页</h2>

      <section className="runtime-strip runtime-strip-band">
        <div className="runtime-strip-header">
          <div className="runtime-strip-copy">
            <h3>运行控制</h3>
            <p className="runtime-copy">{detail}</p>
          </div>
        </div>

        <div className="runtime-status-grid">
          {topStatusItems.map((item) => (
            <div key={item.label} className="runtime-status-item">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="runtime-content-grid">
        <div className="runtime-main-column">
          <section className="runtime-group">
            <div className="runtime-group-header">
              <h3>任务结果</h3>
            </div>
            <div className="runtime-entry">
              <span>任务结果</span>
              <strong>{result || '等待 LLM 输出。'}</strong>
            </div>
            {runtimeNotices.map((notice) => (
              <div key={notice.label} className="runtime-entry">
                <span>{notice.label}</span>
                <strong>{notice.value}</strong>
              </div>
            ))}
            {platformDiagnostics?.permission_hint ? (
              <div className="runtime-entry">
                <span>权限提示</span>
                <strong>{platformDiagnostics.permission_hint}</strong>
              </div>
            ) : null}
          </section>

          {runtimeDiagnostics ? (
            <section className="runtime-group">
              <div className="runtime-group-header">
                <span className="runtime-section-label">运行时详情</span>
                <h3>运行时详情</h3>
              </div>
              <div className="runtime-diagnostic-groups">
                <article className="runtime-detail-card">
                  <div className="runtime-detail-header">
                    <span>MCP 运行时</span>
                    <strong>
                      已配置 {runtimeDiagnostics.configured_server_count} 个服务，当前活跃{' '}
                      {runtimeDiagnostics.active_server_count} 个。
                    </strong>
                  </div>
                  {runtimeDiagnostics.skill_bundle_root ? (
                    <p className="runtime-detail-copy">技能包根目录：{runtimeDiagnostics.skill_bundle_root}</p>
                  ) : null}
                  {runtimeDiagnostics.mcp_servers.length === 0 ? (
                    <p className="runtime-detail-copy">当前没有启用中的 MCP 服务。</p>
                  ) : (
                    <ul className="runtime-detail-list">
                      {runtimeDiagnostics.mcp_servers.map((server) => (
                        <li key={server.id} className="runtime-detail-list-item">
                          <div>
                            <strong>{server.name}</strong>
                            <span>
                              {server.id} · {server.source === 'settings.json' ? 'settings.json' : '内置技能包'}
                            </span>
                          </div>
                          <em>{server.active_in_runtime ? '运行中' : '未接通'}</em>
                          <small>
                            {server.command}
                            {server.args.length > 0 ? ` ${server.args.join(' ')}` : ''}
                          </small>
                        </li>
                      ))}
                    </ul>
                  )}
                  {runtimeDiagnostics.active_tools.length > 0 ? (
                    <div className="runtime-detail-subsection">
                      <span>当前已发现工具</span>
                      <div className="runtime-tool-chips">
                        {runtimeDiagnostics.active_tools.map((tool) => (
                          <strong key={tool.qualified_name}>{tool.qualified_name}</strong>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>

                <article className="runtime-detail-card">
                  <div className="runtime-detail-header">
                    <span>AngryMiao 运行时</span>
                    <strong>{angrymiaoStatus}</strong>
                  </div>
                  <div className="runtime-detail-grid">
                    <div>
                      <span>技能包安装</span>
                      <strong>{runtimeDiagnostics.angrymiao.bundle_installed ? '已安装' : '未安装'}</strong>
                    </div>
                    <div>
                      <span>当前平台</span>
                      <strong>{runtimeDiagnostics.angrymiao.supported_on_current_platform ? '已支持' : '未支持'}</strong>
                    </div>
                    <div>
                      <span>运行入口</span>
                      <strong>{runtimeDiagnostics.angrymiao.runtime_entry_exists ? '存在' : '缺失'}</strong>
                    </div>
                    <div>
                      <span>键盘驱动</span>
                      <strong>{runtimeDiagnostics.angrymiao.keyboard_driver_exists ? '已就绪' : '未就绪'}</strong>
                    </div>
                  </div>
                  {runtimeDiagnostics.angrymiao.keyboard_driver_path ? (
                    <div className="runtime-detail-subsection">
                      <span>键盘驱动路径</span>
                      <strong>
                        {getKeyboardDriverSourceLabel(runtimeDiagnostics.angrymiao.keyboard_driver_source)} ·{' '}
                        {runtimeDiagnostics.angrymiao.keyboard_driver_path}
                      </strong>
                    </div>
                  ) : null}
                  {runtimeDiagnostics.angrymiao.missing_required_env.length > 0 ? (
                    <div className="runtime-detail-subsection">
                      <span>缺少必填环境</span>
                      <strong>{runtimeDiagnostics.angrymiao.missing_required_env.join('、')}</strong>
                    </div>
                  ) : null}
                  {runtimeDiagnostics.angrymiao.error ? (
                    <p className="runtime-error">{runtimeDiagnostics.angrymiao.error}</p>
                  ) : null}
                </article>
              </div>
              {runtimeDiagnostics.mcp_last_sync_error ? (
                <p className="runtime-error" role="alert">
                  MCP 运行时同步失败：{runtimeDiagnostics.mcp_last_sync_error}
                </p>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="runtime-side-column">
          <section className="runtime-group">
            <div className="runtime-group-header">
              <span className="runtime-section-label">系统摘要</span>
              <h3>系统摘要</h3>
            </div>
            <div className="runtime-summary-grid">
              {platformCards.map((card) => (
                <div key={card.label} className="runtime-summary-row">
                  <div className="runtime-summary-copy">
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                  </div>
                </div>
              ))}
              {runtimeCards.map((card) => (
                <div key={card.label} className="runtime-summary-row">
                  <div className="runtime-summary-copy">
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                  </div>
                </div>
              ))}
              <div className="runtime-summary-row">
                <div className="runtime-summary-copy">
                  <span>AngryMiao</span>
                  <strong>{angrymiaoStatus}</strong>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </section>

      {(error ?? runtimeError) ? (
        <p className="runtime-error" role="alert">
          {error ?? runtimeError}
        </p>
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
