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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Mic, 
  Activity, 
  Server, 
  Cpu, 
  Settings,
  CheckCircle2,
  XCircle,
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">运行状态</h2>
          <p className="text-muted-foreground mt-1">{detail}</p>
        </div>
        <Badge variant={input_mode === 'agent' ? 'default' : 'secondary'} className="h-8 px-3 text-sm">
          <Activity className="w-3 h-3 mr-1" />
          {getInputModeLabel(input_mode)}
        </Badge>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-card border-glow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Mic className="w-4 h-4" />
              输入模式
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{getInputModeLabel(input_mode)}</div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              当前麦克风
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold truncate">{selectedMicrophoneLabel}</div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Settings className="w-4 h-4" />
              当前平台
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{platformDiagnostics?.platform_name ?? '加载中'}</div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Server className="w-4 h-4" />
              MCP 服务
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {runtimeDiagnostics === null
                ? '加载中'
                : `${runtimeDiagnostics.active_server_count}/${runtimeDiagnostics.configured_server_count}`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Task Result */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            任务结果
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg bg-secondary/30 border border-border/50">
            <p className="text-sm text-muted-foreground mb-1">识别结果</p>
            <p className="text-lg font-medium">{result || '等待 LLM 输出...'}</p>
          </div>
          
          {runtimeNotices.map((notice) => (
            <div key={notice.label} className="flex items-start gap-2 text-sm">
              <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <span className="text-muted-foreground">{notice.label}:</span>
                <span className="ml-1">{notice.value}</span>
              </div>
            </div>
          ))}
          
          {platformDiagnostics?.permission_hint && (
            <div className="flex items-start gap-2 text-sm text-amber-500">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{platformDiagnostics.permission_hint}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnostics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MCP Runtime */}
        {runtimeDiagnostics && (
          <Card className="glass-card lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                MCP 运行时
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {runtimeDiagnostics.active_server_count} / {runtimeDiagnostics.configured_server_count} 活跃
                </Badge>
                {runtimeDiagnostics.skill_bundle_root && (
                  <span className="text-xs text-muted-foreground">
                    根目录: {runtimeDiagnostics.skill_bundle_root}
                  </span>
                )}
              </div>

              {runtimeDiagnostics.mcp_servers.length === 0 ? (
                <p className="text-sm text-muted-foreground">当前没有启用中的 MCP 服务。</p>
              ) : (
                <div className="space-y-2">
                  {runtimeDiagnostics.mcp_servers.map((server) => (
                    <div key={server.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/30">
                      <div className="flex items-center gap-3">
                        {server.active_in_runtime ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive" />
                        )}
                        <div>
                          <p className="font-medium text-sm">{server.name}</p>
                          <p className="text-xs text-muted-foreground">{server.id}</p>
                        </div>
                      </div>
                      <Badge variant={server.active_in_runtime ? 'default' : 'secondary'} className="text-xs">
                        {server.active_in_runtime ? '运行中' : '未接通'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {runtimeDiagnostics.active_tools.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-2">已发现工具</p>
                    <div className="flex flex-wrap gap-2">
                      {runtimeDiagnostics.active_tools.map((tool) => (
                        <Badge key={tool.qualified_name} variant="secondary" className="text-xs">
                          {tool.qualified_name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {runtimeDiagnostics.mcp_last_sync_error && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  MCP 运行时同步失败: {runtimeDiagnostics.mcp_last_sync_error}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* System Summary */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              系统摘要
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {platformCards.map((card) => (
              <div key={card.label} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-sm text-muted-foreground">{card.label}</span>
                <span className="text-sm font-medium">{card.value}</span>
              </div>
            ))}
            {runtimeCards.map((card) => (
              <div key={card.label} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                <span className="text-sm text-muted-foreground">{card.label}</span>
                <span className="text-sm font-medium">{card.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">AngryMiao</span>
              <Badge variant={angrymiaoStatus.includes('异常') || angrymiaoStatus === '未启用' ? 'secondary' : 'default'} className="text-xs">
                {angrymiaoStatus}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AngryMiao Runtime */}
      {runtimeDiagnostics && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cpu className="w-5 h-5 text-primary" />
              AngryMiao 运行时
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-secondary/20 border border-border/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">技能包安装</p>
                <Badge variant={runtimeDiagnostics.angrymiao.bundle_installed ? 'default' : 'destructive'}>
                  {runtimeDiagnostics.angrymiao.bundle_installed ? '已安装' : '未安装'}
                </Badge>
              </div>
              <div className="p-4 rounded-lg bg-secondary/20 border border-border/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">当前平台</p>
                <Badge variant={runtimeDiagnostics.angrymiao.supported_on_current_platform ? 'default' : 'secondary'}>
                  {runtimeDiagnostics.angrymiao.supported_on_current_platform ? '已支持' : '未支持'}
                </Badge>
              </div>
              <div className="p-4 rounded-lg bg-secondary/20 border border-border/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">运行入口</p>
                <Badge variant={runtimeDiagnostics.angrymiao.runtime_entry_exists ? 'default' : 'destructive'}>
                  {runtimeDiagnostics.angrymiao.runtime_entry_exists ? '存在' : '缺失'}
                </Badge>
              </div>
              <div className="p-4 rounded-lg bg-secondary/20 border border-border/30 text-center">
                <p className="text-xs text-muted-foreground mb-1">键盘驱动</p>
                <Badge variant={runtimeDiagnostics.angrymiao.keyboard_driver_exists ? 'default' : 'secondary'}>
                  {runtimeDiagnostics.angrymiao.keyboard_driver_exists ? '已就绪' : '未就绪'}
                </Badge>
              </div>
            </div>

            {runtimeDiagnostics.angrymiao.keyboard_driver_path && (
              <div className="mt-4 p-3 rounded-lg bg-secondary/20 border border-border/30">
                <span className="text-xs text-muted-foreground">键盘驱动路径: </span>
                <span className="text-sm font-mono">{runtimeDiagnostics.angrymiao.keyboard_driver_path}</span>
              </div>
            )}

            {runtimeDiagnostics.angrymiao.missing_required_env.length > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500">
                <span className="text-sm">缺少必填环境: {runtimeDiagnostics.angrymiao.missing_required_env.join('、')}</span>
              </div>
            )}

            {runtimeDiagnostics.angrymiao.error && (
              <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
                <span className="text-sm">{runtimeDiagnostics.angrymiao.error}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {(error ?? runtimeError) && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error ?? runtimeError}
        </div>
      )}
    </div>
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
