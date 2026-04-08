import { useEffect, useState } from 'react'
import {
  getPlatformDiagnostics,
  getRuntimeDiagnostics,
  listenPlatformDiagnostics,
  startMicrophoneCapture,
  stopMicrophoneCapture,
  type PlatformDiagnostics,
  type RuntimeDiagnostics,
} from '../../lib/tauri'
import { getRuntimePhaseTone } from '../../lib/runtimePhase'
import { useRuntimeSnapshot } from './useRuntimeSnapshot'

export function RuntimeStatus() {
  const { phase, transcript, result, detail, error: runtimeError } = useRuntimeSnapshot()
  const [error, setError] = useState<string | null>(null)
  const [platformDiagnostics, setPlatformDiagnostics] =
    useState<PlatformDiagnostics | null>(null)
  const [runtimeDiagnostics, setRuntimeDiagnostics] =
    useState<RuntimeDiagnostics | null>(null)
  const phaseTone = getRuntimePhaseTone(phase)

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

    const unlistenPromise = listenPlatformDiagnostics((nextDiagnostics) => {
      if (!disposed) {
        setPlatformDiagnostics(nextDiagnostics)
      }
      void refreshRuntimeDiagnostics()
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

    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  async function runAction(action: () => Promise<unknown>) {
    try {
      setError(null)
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '更新运行时状态失败')
    }
  }

  const canStartCapture =
    platformDiagnostics?.supported !== false &&
    platformDiagnostics?.microphone_available !== false &&
    (phase === '待命中' || phase === '已完成' || phase === '识别失败')
  const canStopCapture = phase === '正在聆听'
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
      label: '平台支持',
      value:
        platformDiagnostics === null
          ? '加载中'
          : platformDiagnostics.supported
            ? '已支持'
            : '未支持',
    },
    {
      label: '麦克风',
      value:
        platformDiagnostics === null
          ? '加载中'
          : platformDiagnostics.microphone_available
            ? '可用'
            : '未检测到',
    },
    {
      label: '麦克风权限',
      value: platformDiagnostics?.microphone_permission_status ?? '加载中',
    },
    {
      label: '输入控制',
      value: platformDiagnostics?.input_control_permission_status ?? '加载中',
    },
    {
      label: '热键后端',
      value: platformDiagnostics?.hotkey_backend ?? '加载中',
    },
    {
      label: '开机自启动',
      value:
        platformDiagnostics === null
          ? '加载中'
          : platformDiagnostics.auto_launch_enabled
            ? '已开启'
            : '未开启',
    },
    {
      label: 'Deep Link',
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
    {
      label: 'MCP 工具',
      value: runtimeDiagnostics === null ? '加载中' : runtimeDiagnostics.tool_count,
    },
    {
      label: 'AngryMiao Runtime',
      value: runtimeDiagnostics === null ? '加载中' : angrymiaoStatus,
    },
  ]
  const runtimeNotices = [
    platformDiagnostics?.last_deep_link
      ? {
          label: '最近 Deep Link',
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

  return (
    <section className="panel runtime-panel">
      <div className="hero-strip runtime-home-strip">
        <div className="runtime-home-copy">
          <h2>首页</h2>
          <strong className="runtime-home-title">自然说话，直接完成识别与执行</strong>
          <small>{detail}</small>
        </div>
        <span className={`phase-chip phase-${phaseTone}`}>{phase}</span>
      </div>

      <div className="runtime-home-layout">
        <article className="runtime-primary-card">
          <span className="runtime-card-label">当前阶段</span>
          <strong className="runtime-primary-title">{phase}</strong>
          <p className="runtime-copy">{detail}</p>
          <div className="runtime-actions">
            <button
              disabled={!canStartCapture}
              type="button"
              onClick={() => void runAction(() => startMicrophoneCapture())}
            >
              开始录音
            </button>
            <button
              disabled={!canStopCapture}
              type="button"
              onClick={() => void runAction(() => stopMicrophoneCapture())}
            >
              结束录音
            </button>
          </div>
        </article>

        <div className="runtime-side-stack">
          <article className="runtime-summary-card runtime-summary-card-platform">
            <span className="runtime-card-label">平台</span>
            <div className="runtime-summary-grid">
              {platformCards.map((card) => (
                <div key={card.label} className="runtime-diagnostic-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="runtime-summary-card runtime-summary-card-runtime">
            <span className="runtime-card-label">MCP</span>
            <div className="runtime-summary-grid runtime-summary-grid-compact">
              {runtimeCards.map((card) => (
                <div key={card.label} className="runtime-diagnostic-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      </div>

      <div className="runtime-entry-grid">
        <article className="runtime-entry-card">
          <strong>历史</strong>
          <small>回看识别文本、结果和重试记录。</small>
        </article>
        <article className="runtime-entry-card runtime-entry-card-soft">
          <strong>设置</strong>
          <small>热键、模型、MCP 都在同一处维护。</small>
        </article>
        <article className="runtime-entry-card">
          <strong>日志</strong>
          <small>筛选运行事件，快速定位异常链路。</small>
        </article>
      </div>

      <div className="runtime-focus-grid">
        <div className="runtime-transcript runtime-focus-card">
          <span>实时文本</span>
          <strong>{transcript || '等待语音输入。'}</strong>
        </div>
        <div className="runtime-transcript runtime-focus-card">
          <span>任务结果</span>
          <strong>{result || '等待 LLM 输出。'}</strong>
        </div>
      </div>

      {runtimeNotices.length > 0 ? (
        <div className="runtime-note-grid">
          {runtimeNotices.map((notice) => (
            <div key={notice.label} className="runtime-transcript runtime-note-card">
              <span>{notice.label}</span>
              <strong>{notice.value}</strong>
            </div>
          ))}
        </div>
      ) : null}

      {platformDiagnostics?.permission_hint ? (
        <p className="runtime-hint">{platformDiagnostics.permission_hint}</p>
      ) : null}

      {runtimeDiagnostics ? (
        <>
          <div className="runtime-diagnostic-groups">
            <article className="runtime-detail-card">
              <div className="runtime-detail-header">
                <span>MCP Runtime</span>
                <strong>
                  已配置 {runtimeDiagnostics.configured_server_count} 个 server，当前活跃{' '}
                  {runtimeDiagnostics.active_server_count} 个。
                </strong>
              </div>
              {runtimeDiagnostics.skill_bundle_root ? (
                <p className="runtime-detail-copy">
                  Skill Bundle 根目录：{runtimeDiagnostics.skill_bundle_root}
                </p>
              ) : null}
              {runtimeDiagnostics.mcp_servers.length === 0 ? (
                <p className="runtime-detail-copy">当前没有启用中的 MCP server。</p>
              ) : (
                <ul className="runtime-detail-list">
                  {runtimeDiagnostics.mcp_servers.map((server) => (
                    <li key={server.id} className="runtime-detail-list-item">
                      <div>
                        <strong>{server.name}</strong>
                        <span>
                          {server.id} · {server.source === 'settings.json'
                            ? 'settings.json'
                            : '内置 skill bundle'}
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
                <span>AngryMiao System Control</span>
                <strong>{angrymiaoStatus}</strong>
              </div>
              <div className="runtime-detail-grid">
                <div>
                  <span>Bundle 安装</span>
                  <strong>
                    {runtimeDiagnostics.angrymiao.bundle_installed ? '已安装' : '未安装'}
                  </strong>
                </div>
                <div>
                  <span>当前平台</span>
                  <strong>
                    {runtimeDiagnostics.angrymiao.supported_on_current_platform
                      ? '已支持'
                      : '未支持'}
                  </strong>
                </div>
                <div>
                  <span>Runtime Entry</span>
                  <strong>
                    {runtimeDiagnostics.angrymiao.runtime_entry_exists ? '存在' : '缺失'}
                  </strong>
                </div>
                <div>
                  <span>键盘驱动</span>
                  <strong>
                    {runtimeDiagnostics.angrymiao.keyboard_driver_exists
                      ? '已就绪'
                      : '未就绪'}
                  </strong>
                </div>
              </div>
              {runtimeDiagnostics.angrymiao.keyboard_driver_path ? (
                <div className="runtime-detail-subsection">
                  <span>键盘驱动路径</span>
                  <strong>
                    {runtimeDiagnostics.angrymiao.keyboard_driver_source} ·{' '}
                    {runtimeDiagnostics.angrymiao.keyboard_driver_path}
                  </strong>
                </div>
              ) : null}
              {runtimeDiagnostics.angrymiao.missing_required_env.length > 0 ? (
                <div className="runtime-detail-subsection">
                  <span>缺少必填环境</span>
                  <strong>
                    {runtimeDiagnostics.angrymiao.missing_required_env.join('、')}
                  </strong>
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
        </>
      ) : null}
      {error ?? runtimeError ? (
        <p className="runtime-error" role="alert">
          {error ?? runtimeError}
        </p>
      ) : null}
    </section>
  )
}
