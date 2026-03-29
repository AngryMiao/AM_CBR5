import {
  type ASRProvider,
  getDefaultFunASRLaunchCommand,
  type TTSProvider,
  type VoiceWorkMode,
  type WhisperModelSize,
} from '@shared/types/voice'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DefaultMicrophoneSelect } from '@/components/voice/DefaultMicrophoneSelect'
import { KeyboardControlSettings } from '@/components/voice/KeyboardControlSettings'
import { VoiceHotkeyRecorder } from '@/components/voice/VoiceHotkeyRecorder'
import { useVoiceSettings } from '@/hooks/useVoiceSettings'
import {
  AliyunASRProvider,
  AzureASRProvider,
  FunASRLocalProvider,
  GoogleASRProvider,
  OpenAIASRProvider,
  WhisperLocalProvider,
} from '@/packages/voice/asr'
import type { WhisperDownloadProgress } from '@/packages/voice/asr/whisper-local'
import { AzureTTSProvider, BrowserTTSProvider, ElevenLabsTTSProvider, OpenAITTSProvider } from '@/packages/voice/tts'
import platform from '@/platform'
import { useSettingsStore } from '@/stores/settingsStore'

export const Route = createFileRoute('/settings/voice')({
  component: RouteComponent,
  errorComponent: ({ error }) => {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <h2 className="text-xl font-bold text-red-600 mb-4">Failed to load Voice Control settings</h2>
        <p className="text-gray-600 mb-4">{error?.message || 'Unknown error'}</p>
        <button
          onClick={() => {
            window.location.reload()
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Reload
        </button>
      </div>
    )
  },
})

export function RouteComponent() {
  const { t } = useTranslation()
  const { settings, setSettings } = useVoiceSettings()
  const appShortcuts = useSettingsStore((state) => state.shortcuts)
  const defaultFunASRLaunchCommand = getDefaultFunASRLaunchCommand()
  const [testingASR, setTestingASR] = useState(false)
  const [testingTTS, setTestingTTS] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [whisperDownloading, setWhisperDownloading] = useState(false)
  const [whisperProgress, setWhisperProgress] = useState<WhisperDownloadProgress | null>(null)
  const [funasrServiceStatus, setFunasrServiceStatus] = useState<any>(null)
  const [funasrServiceLoading, setFunasrServiceLoading] = useState(false)
  const [funasrServiceActionLoading, setFunasrServiceActionLoading] = useState(false)
  const whisperProviderRef = useRef<WhisperLocalProvider | null>(null)

  const parseCsv = (value: string): string[] =>
    value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean)

  const joinCsv = (value?: string[]): string => (value || []).join(', ')
  const funasrLocalConfig = (settings.asrConfig.funasrLocal || {}) as any
  const funasrRequestTemplateConfig = (settings.asrConfig.funasrLocal?.requestTemplate || {}) as any
  const whisperLocalConfig = (settings.asrConfig.whisperLocal || {}) as any
  const aliyunConfig = (settings.asrConfig.aliyun || {}) as any

  const refreshFunASRServiceStatus = useCallback(async () => {
    if (settings.asrProvider !== 'funasr-local') return
    setFunasrServiceLoading(true)
    try {
      const status = await window.electronAPI?.invoke('getFunASRServiceStatus')
      setFunasrServiceStatus(status)
    } catch (err) {
      setFunasrServiceStatus({
        running: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setFunasrServiceLoading(false)
    }
  }, [settings.asrProvider])

  const restartFunASRService = useCallback(async () => {
    setFunasrServiceActionLoading(true)
    try {
      await window.electronAPI?.invoke('restartFunASRService')
      await refreshFunASRServiceStatus()
      alert(t('FunASR 服务已重启'))
    } catch (err) {
      alert(t('重启 FunASR 服务失败: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
    } finally {
      setFunasrServiceActionLoading(false)
    }
  }, [refreshFunASRServiceStatus, t])

  useEffect(() => {
    if (settings.asrProvider !== 'funasr-local') return
    refreshFunASRServiceStatus()
  }, [settings.asrProvider, refreshFunASRServiceStatus])

  useEffect(() => {
    if (settings.asrProvider !== 'funasr-local') return
    const timer = setTimeout(() => {
      refreshFunASRServiceStatus()
    }, 300)
    return () => clearTimeout(timer)
  }, [settings.asrProvider, settings.asrConfig.funasrLocal, refreshFunASRServiceStatus])

  const downloadWhisperModel = async () => {
    setWhisperDownloading(true)
    setWhisperProgress(null)
    try {
      // 先测试网络连接
      const testUrl = settings.asrConfig.whisperLocal?.remoteHost
        ? `${settings.asrConfig.whisperLocal.remoteHost}/Xenova/whisper-base/resolve/main/config.json`
        : 'https://huggingface.co/Xenova/whisper-base/resolve/main/config.json'

      console.log('[Whisper] Testing network access to:', testUrl)

      try {
        const testResponse = await fetch(testUrl, { method: 'HEAD' })
        console.log('[Whisper] Network test result:', testResponse.status, testResponse.statusText)
        if (!testResponse.ok) {
          throw new Error(`无法访问模型服务器 (${testResponse.status})`)
        }
      } catch (fetchError) {
        console.error('[Whisper] Network test failed:', fetchError)
        throw new Error(`网络连接失败: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`)
      }

      const provider = new WhisperLocalProvider(
        settings.asrConfig.whisperLocal?.modelSize || 'base',
        settings.asrConfig.whisperLocal?.remoteHost,
        settings.asrConfig.whisperLocal?.localModelPath
      )
      whisperProviderRef.current = provider
      await provider.preload((progress) => {
        setWhisperProgress(progress)
      })
      setWhisperProgress({ status: 'ready' })
    } catch (err) {
      alert(t('模型下载失败: {{error}}', { error: err instanceof Error ? err.message : String(err) }))
      setWhisperProgress(null)
    } finally {
      setWhisperDownloading(false)
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  const testASR = async () => {
    setTestingASR(true)
    try {
      // 创建 ASR 提供商实例
      let asrProvider: any
      switch (settings.asrProvider) {
        case 'whisper-local':
          asrProvider = new WhisperLocalProvider(
            settings.asrConfig.whisperLocal?.modelSize || 'base',
            settings.asrConfig.whisperLocal?.remoteHost,
            settings.asrConfig.whisperLocal?.localModelPath
          )
          break
        case 'funasr-local':
          asrProvider = new FunASRLocalProvider(settings.asrConfig.funasrLocal)
          break
        case 'openai':
          if (!settings.asrConfig.openai?.apiKey) {
            alert(t('请先配置 OpenAI API Key'))
            return
          }
          asrProvider = new OpenAIASRProvider(settings.asrConfig.openai)
          break
        case 'aliyun':
          if (!settings.asrConfig.aliyun?.apiKey) {
            alert(t('请先配置阿里云 API Key'))
            return
          }
          asrProvider = new AliyunASRProvider(settings.asrConfig.aliyun)
          break
        case 'azure':
          if (!settings.asrConfig.azure) {
            alert(t('请先配置 Azure 设置'))
            return
          }
          asrProvider = new AzureASRProvider(settings.asrConfig.azure)
          break
        case 'google':
          if (!settings.asrConfig.google?.apiKey) {
            alert(t('请先配置 Google API Key'))
            return
          }
          asrProvider = new GoogleASRProvider(settings.asrConfig.google)
          break
      }

      // 检查是否可用
      const available = await asrProvider.isAvailable()
      if (!available) {
        alert(t('ASR 提供商不可用'))
        return
      }

      alert(
        t('ASR 提供商配置正确！\n\n请使用快捷键 {{shortcut}} 开始语音输入测试。', {
          shortcut: settings.shortcuts.toggleVoice,
        })
      )
    } catch (error) {
      alert(
        t('ASR 测试失败: {{error}}', {
          error: error instanceof Error ? error.message : String(error),
        })
      )
    } finally {
      setTestingASR(false)
    }
  }

  const testTTS = async () => {
    setTestingTTS(true)
    try {
      // 创建 TTS 提供商实例
      let ttsProvider: any
      switch (settings.ttsProvider) {
        case 'browser':
          ttsProvider = new BrowserTTSProvider(settings.ttsConfig.browser)
          break
        case 'openai':
          if (!settings.ttsConfig.openai?.apiKey) {
            alert(t('请先配置 OpenAI API Key'))
            return
          }
          ttsProvider = new OpenAITTSProvider(settings.ttsConfig.openai)
          break
        case 'azure':
          if (!settings.ttsConfig.azure) {
            alert(t('请先配置 Azure 设置'))
            return
          }
          ttsProvider = new AzureTTSProvider(settings.ttsConfig.azure)
          break
        case 'elevenlabs':
          if (!settings.ttsConfig.elevenlabs) {
            alert(t('请先配置 ElevenLabs 设置'))
            return
          }
          ttsProvider = new ElevenLabsTTSProvider(settings.ttsConfig.elevenlabs)
          break
      }

      // 检查是否可用
      const available = await ttsProvider.isAvailable()
      if (!available) {
        alert(t('TTS 提供商不可用'))
        return
      }

      // 播放测试语音
      await ttsProvider.speak(t('你好，这是语音合成测试。'))
      alert(t('TTS 测试成功！'))
    } catch (error) {
      alert(
        t('TTS 测试失败: {{error}}', {
          error: error instanceof Error ? error.message : String(error),
        })
      )
    } finally {
      setTestingTTS(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('语音控制')}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('配置语音输入和输出设置')}</p>
      </div>

      {/* 启用语音控制 */}
      <div className="flex items-center justify-between">
        <div>
          <label className="font-medium">{t('启用语音控制')}</label>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('通过快捷键激活语音输入')}</p>
        </div>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          className="w-5 h-5"
        />
      </div>

      {/* 工作模式 */}
      <div className="flex items-center justify-between">
        <div>
          <label className="font-medium">{t('工作模式')}</label>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('Chat 模式：语音发送到 AI 对话；Typeless 模式：语音转文字直接插入到当前应用')}
          </p>
        </div>
        <select
          value={settings.workMode}
          onChange={(e) => setSettings({ ...settings, workMode: e.target.value as VoiceWorkMode })}
          className="w-36 p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="chat">{t('Chat 模式')}</option>
          <option value="typeless">{t('Typeless 模式')}</option>
        </select>
      </div>

      {/* 默认麦克风 */}
      <div className="space-y-3">
        <div>
          <label className="font-medium">{t('默认麦克风')}</label>
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('未选择时跟随系统默认设备。')}</p>
        </div>
        <DefaultMicrophoneSelect
          value={settings.microphoneDeviceId}
          onChange={(microphoneDeviceId) => setSettings({ ...settings, microphoneDeviceId })}
        />
      </div>

      {/* ASR 提供商 */}
      <div className="space-y-3">
        <label className="font-medium">{t('语音识别提供商 (ASR)')}</label>
        <select
          value={settings.asrProvider}
          onChange={(e) => setSettings({ ...settings, asrProvider: e.target.value as ASRProvider })}
          className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="whisper-local">{t('Whisper 本地模型')}</option>
          <option value="funasr-local">{t('FunASR 本地服务')}</option>
          <option value="openai">{t('OpenAI Whisper API')}</option>
          <option value="aliyun">{t('阿里云 Qwen ASR')}</option>
          <option value="azure">{t('Azure Speech Services')}</option>
          <option value="google">{t('Google Cloud Speech')}</option>
        </select>

        {/* FunASR Local 配置 */}
        {settings.asrProvider === 'funasr-local' && (
          <div className="pl-4 space-y-3 border-l-2 border-gray-300 dark:border-gray-700">
            <div>
              <label className="text-sm font-medium">{t('服务地址')}</label>
              <input
                type="text"
                value={settings.asrConfig.funasrLocal?.baseURL || 'http://127.0.0.1:10095'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        baseURL: e.target.value,
                      },
                    },
                  })
                }
                placeholder="http://127.0.0.1:10095"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div className="p-3 border rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('服务状态')}</span>
                <span className={`text-xs ${funasrServiceStatus?.running ? 'text-green-600' : 'text-gray-500'}`}>
                  {funasrServiceLoading ? t('检查中...') : funasrServiceStatus?.running ? t('运行中') : t('未运行')}
                </span>
              </div>
              {funasrServiceStatus?.pid && (
                <div className="text-xs text-gray-500">
                  {t('PID')}: {funasrServiceStatus.pid}
                </div>
              )}
              {funasrServiceStatus?.error && <div className="text-xs text-red-600">{funasrServiceStatus.error}</div>}
              <div className="flex gap-2">
                <button
                  onClick={refreshFunASRServiceStatus}
                  disabled={funasrServiceLoading || funasrServiceActionLoading}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
                >
                  {t('刷新状态')}
                </button>
                <button
                  onClick={restartFunASRService}
                  disabled={funasrServiceActionLoading}
                  className="px-3 py-1 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  {funasrServiceActionLoading ? t('重启中...') : t('重启服务')}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{t('模型名称')}</label>
              <input
                type="text"
                value={settings.asrConfig.funasrLocal?.model || 'paraformer-zh-streaming'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        model: e.target.value,
                      },
                    },
                  })
                }
                placeholder="paraformer-zh-streaming / SenseVoiceSmall"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.asrConfig.funasrLocal?.autoStart ?? true}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        autoStart: e.target.checked,
                      },
                    },
                  })
                }
                className="w-4 h-4"
              />
              <span>{t('随 App 自动启动 FunASR 服务')}</span>
            </label>
            <div>
              <label className="text-sm font-medium">{t('启动命令')}</label>
              <input
                type="text"
                value={settings.asrConfig.funasrLocal?.launchCommand || defaultFunASRLaunchCommand}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        launchCommand: e.target.value,
                      },
                    },
                  })
                }
                placeholder={defaultFunASRLaunchCommand}
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('启动参数')}</label>
              <input
                type="text"
                value={settings.asrConfig.funasrLocal?.launchArgs || '-m funasr_server --port 10095'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        launchArgs: e.target.value,
                      },
                    },
                  })
                }
                placeholder="-m funasr_server --port 10095"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('工作目录（可选）')}</label>
              <input
                type="text"
                value={settings.asrConfig.funasrLocal?.launchCwd || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        launchCwd: e.target.value || undefined,
                      },
                    },
                  })
                }
                placeholder="/path/to/funasr-runtime"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('识别语言')}</label>
              <input
                type="text"
                value={settings.asrConfig.funasrLocal?.language || 'zh'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        language: e.target.value,
                      },
                    },
                  })
                }
                placeholder="zh / en / auto"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('健康检查路径模板（逗号分隔）')}</label>
              <input
                type="text"
                value={joinCsv(settings.asrConfig.funasrLocal?.healthPaths || ['/health', '/status'])}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        healthPaths: parseCsv(e.target.value),
                      },
                    },
                  })
                }
                placeholder="/health, /status"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('识别接口路径模板（逗号分隔）')}</label>
              <input
                type="text"
                value={joinCsv(settings.asrConfig.funasrLocal?.transcribePaths || ['/transcribe', '/asr'])}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        transcribePaths: parseCsv(e.target.value),
                      },
                    },
                  })
                }
                placeholder="/transcribe, /asr"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('返回文本字段路径模板（逗号分隔）')}</label>
              <input
                type="text"
                value={joinCsv(
                  settings.asrConfig.funasrLocal?.responseTextPaths || ['text', 'result', 'data.text', 'data.result']
                )}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        responseTextPaths: parseCsv(e.target.value),
                      },
                    },
                  })
                }
                placeholder="text, result, data.text"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">{t('请求文件字段')}</label>
                <input
                  type="text"
                  value={settings.asrConfig.funasrLocal?.requestTemplate?.fileField || 'file'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      asrConfig: {
                        ...settings.asrConfig,
                        funasrLocal: {
                          ...funasrLocalConfig,
                          requestTemplate: {
                            ...funasrRequestTemplateConfig,
                            fileField: e.target.value,
                          },
                        },
                      },
                    })
                  }
                  className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('请求模型字段')}</label>
                <input
                  type="text"
                  value={settings.asrConfig.funasrLocal?.requestTemplate?.modelField || 'model'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      asrConfig: {
                        ...settings.asrConfig,
                        funasrLocal: {
                          ...funasrLocalConfig,
                          requestTemplate: {
                            ...funasrRequestTemplateConfig,
                            modelField: e.target.value,
                          },
                        },
                      },
                    })
                  }
                  className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('请求语言字段')}</label>
                <input
                  type="text"
                  value={settings.asrConfig.funasrLocal?.requestTemplate?.languageField || 'language'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      asrConfig: {
                        ...settings.asrConfig,
                        funasrLocal: {
                          ...funasrLocalConfig,
                          requestTemplate: {
                            ...funasrRequestTemplateConfig,
                            languageField: e.target.value,
                          },
                        },
                      },
                    })
                  }
                  className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('请求热词字段')}</label>
                <input
                  type="text"
                  value={settings.asrConfig.funasrLocal?.requestTemplate?.hotwordsField || 'hotwords'}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      asrConfig: {
                        ...settings.asrConfig,
                        funasrLocal: {
                          ...funasrLocalConfig,
                          requestTemplate: {
                            ...funasrRequestTemplateConfig,
                            hotwordsField: e.target.value,
                          },
                        },
                      },
                    })
                  }
                  className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.asrConfig.funasrLocal?.enableVAD ?? true}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      asrConfig: {
                        ...settings.asrConfig,
                        funasrLocal: {
                          ...funasrLocalConfig,
                          enableVAD: e.target.checked,
                        },
                      },
                    })
                  }
                  className="w-4 h-4"
                />
                <span>{t('启用 VAD')}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.asrConfig.funasrLocal?.enablePunctuation ?? true}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      asrConfig: {
                        ...settings.asrConfig,
                        funasrLocal: {
                          ...funasrLocalConfig,
                          enablePunctuation: e.target.checked,
                        },
                      },
                    })
                  }
                  className="w-4 h-4"
                />
                <span>{t('启用标点')}</span>
              </label>
            </div>
            <div>
              <label className="text-sm font-medium">{t('热词（逗号分隔，可选）')}</label>
              <input
                type="text"
                value={(settings.asrConfig.funasrLocal?.hotwords || []).join(', ')}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        hotwords: e.target.value
                          .split(/[,，]/)
                          .map((item) => item.trim())
                          .filter(Boolean),
                      },
                    },
                  })
                }
                placeholder="angrymiao, chatbox, 截图"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('请求超时（毫秒）')}</label>
              <input
                type="number"
                min={1000}
                max={120000}
                value={settings.asrConfig.funasrLocal?.timeoutMs || 30000}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...funasrLocalConfig,
                        timeoutMs: Number(e.target.value || 30000),
                      },
                    },
                  })
                }
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <p className="text-xs text-gray-500">
              {t('支持通过模板自定义健康检查路径、识别接口路径和返回文本字段路径。')}
            </p>
          </div>
        )}

        {/* Whisper Local 配置 */}
        {settings.asrProvider === 'whisper-local' && (
          <div className="pl-4 space-y-3 border-l-2 border-gray-300 dark:border-gray-700">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium mb-2">
                ❌ {t('本地 Whisper 模型在当前环境下无法使用')}
              </p>
              <p className="text-xs text-red-700 dark:text-red-300">
                {t('由于 Electron + Vite 开发环境的网络限制，@xenova/transformers 无法正常下载模型。')}
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-2">
                {t('建议：切换到 OpenAI Whisper API（下方），或等待生产版本打包后再使用本地模型。')}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">{t('模型大小')}</label>
              <select
                value={settings.asrConfig.whisperLocal?.modelSize || 'base'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      whisperLocal: {
                        ...whisperLocalConfig,
                        modelSize: e.target.value as WhisperModelSize,
                      },
                    },
                  })
                }
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              >
                <option value="tiny">Tiny (~75MB, 快速)</option>
                <option value="base">Base (~150MB, 推荐)</option>
                <option value="small">Small (~500MB, 准确)</option>
                <option value="medium">Medium (~1.5GB, 最准确)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t('模型下载镜像')}</label>
              <input
                type="text"
                value={settings.asrConfig.whisperLocal?.remoteHost || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      whisperLocal: {
                        ...whisperLocalConfig,
                        remoteHost: e.target.value || undefined,
                      },
                    },
                  })
                }
                placeholder="https://hf-mirror.com（国内可用）"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('留空使用 huggingface.co，国内网络可填 https://hf-mirror.com')}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">{t('本地模型路径（可选）')}</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={settings.asrConfig.whisperLocal?.localModelPath || ''}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      asrConfig: {
                        ...settings.asrConfig,
                        whisperLocal: {
                          ...whisperLocalConfig,
                          localModelPath: e.target.value || undefined,
                        },
                      },
                    })
                  }
                  placeholder="http://localhost:8765"
                  className="flex-1 p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {t('浏览器无法直接访问本地文件。请使用脚本启动本地服务器：')}
                <br />
                <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                  node scripts/serve-whisper-models.js ~/whisper-models
                </code>
                <br />
                {t('然后填入: http://localhost:8765')}
              </p>
            </div>
            <div>
              <button
                onClick={downloadWhisperModel}
                disabled={whisperDownloading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {whisperDownloading ? t('下载中...') : t('预下载模型')}
              </button>
              {whisperProgress && (
                <div className="mt-2 text-sm">
                  {whisperProgress.status === 'ready' ? (
                    <p className="text-green-600">✓ {t('模型已就绪')}</p>
                  ) : whisperProgress.status === 'progress' && whisperProgress.progress !== undefined ? (
                    <div>
                      <p className="text-gray-600">
                        {whisperProgress.file} — {whisperProgress.progress.toFixed(1)}%
                      </p>
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                        <div
                          className="bg-blue-600 h-1.5 rounded-full transition-all"
                          style={{ width: `${whisperProgress.progress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">{whisperProgress.status}...</p>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">{t('预下载后首次使用无需等待，模型缓存在浏览器中')}</p>
            </div>
          </div>
        )}

        {/* OpenAI 配置 */}
        {settings.asrProvider === 'openai' && (
          <div className="pl-4 space-y-3 border-l-2 border-gray-300 dark:border-gray-700">
            <div>
              <label className="text-sm font-medium">{t('API Key')}</label>
              <input
                type="password"
                value={settings.asrConfig.openai?.apiKey || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      openai: { ...settings.asrConfig.openai, apiKey: e.target.value, model: 'whisper-1' },
                    },
                  })
                }
                placeholder="sk-..."
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('Base URL (可选)')}</label>
              <input
                type="text"
                value={settings.asrConfig.openai?.baseURL || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      openai: { ...settings.asrConfig.openai!, baseURL: e.target.value },
                    },
                  })
                }
                placeholder="https://api.openai.com/v1"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
          </div>
        )}

        {/* Aliyun 配置 */}
        {settings.asrProvider === 'aliyun' && (
          <div className="pl-4 space-y-3 border-l-2 border-gray-300 dark:border-gray-700">
            <div>
              <label className="text-sm font-medium">{t('API Key')}</label>
              <input
                type="password"
                value={settings.asrConfig.aliyun?.apiKey || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      aliyun: {
                        ...aliyunConfig,
                        apiKey: e.target.value,
                        model: settings.asrConfig.aliyun?.model || 'qwen3-asr-flash',
                        baseURL:
                          settings.asrConfig.aliyun?.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                      },
                    },
                  })
                }
                placeholder="sk-..."
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('模型名称')}</label>
              <input
                type="text"
                value={settings.asrConfig.aliyun?.model || 'qwen3-asr-flash'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      aliyun: {
                        ...aliyunConfig,
                        apiKey: settings.asrConfig.aliyun?.apiKey || '',
                        model: e.target.value,
                        baseURL:
                          settings.asrConfig.aliyun?.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                      },
                    },
                  })
                }
                placeholder="qwen3-asr-flash"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('Base URL')}</label>
              <input
                type="text"
                value={settings.asrConfig.aliyun?.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      aliyun: {
                        ...aliyunConfig,
                        apiKey: settings.asrConfig.aliyun?.apiKey || '',
                        model: settings.asrConfig.aliyun?.model || 'qwen3-asr-flash',
                        baseURL: e.target.value,
                      },
                    },
                  })
                }
                placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('中国内地可用 dashscope.aliyuncs.com，新加坡地域可替换为 dashscope-intl.aliyuncs.com')}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">{t('语言代码（可选）')}</label>
              <input
                type="text"
                value={settings.asrConfig.aliyun?.language || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      aliyun: {
                        ...aliyunConfig,
                        apiKey: settings.asrConfig.aliyun?.apiKey || '',
                        model: settings.asrConfig.aliyun?.model || 'qwen3-asr-flash',
                        baseURL:
                          settings.asrConfig.aliyun?.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                        language: e.target.value,
                      },
                    },
                  })
                }
                placeholder="zh"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">{t('留空时自动识别，可填 zh、en、ja 等')}</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium">{t('启用 ITN')}</label>
                <p className="text-xs text-gray-500 mt-1">{t('将口语数字等内容标准化，仅适用于中文和英文音频')}</p>
              </div>
              <input
                type="checkbox"
                checked={settings.asrConfig.aliyun?.enableITN || false}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      aliyun: {
                        ...aliyunConfig,
                        apiKey: settings.asrConfig.aliyun?.apiKey || '',
                        model: settings.asrConfig.aliyun?.model || 'qwen3-asr-flash',
                        baseURL:
                          settings.asrConfig.aliyun?.baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
                        enableITN: e.target.checked,
                      },
                    },
                  })
                }
                className="w-5 h-5"
              />
            </div>
          </div>
        )}

        {/* Azure 配置 */}
        {settings.asrProvider === 'azure' && (
          <div className="pl-4 space-y-3 border-l-2 border-gray-300 dark:border-gray-700">
            <div>
              <label className="text-sm font-medium">{t('API Key')}</label>
              <input
                type="password"
                value={settings.asrConfig.azure?.apiKey || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      azure: { ...settings.asrConfig.azure!, apiKey: e.target.value },
                    },
                  })
                }
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('Endpoint')}</label>
              <input
                type="text"
                value={settings.asrConfig.azure?.endpoint || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      azure: { ...settings.asrConfig.azure!, endpoint: e.target.value },
                    },
                  })
                }
                placeholder="https://your-resource.cognitiveservices.azure.com"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('Region')}</label>
              <input
                type="text"
                value={settings.asrConfig.azure?.region || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      azure: { ...settings.asrConfig.azure!, region: e.target.value },
                    },
                  })
                }
                placeholder="eastus"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
          </div>
        )}

        <button
          onClick={testASR}
          disabled={testingASR}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {testingASR ? t('测试中...') : t('测试 ASR')}
        </button>
      </div>

      {/* TTS 提供商 */}
      <div className="space-y-3">
        <label className="font-medium">{t('语音合成提供商 (TTS)')}</label>
        <select
          value={settings.ttsProvider}
          onChange={(e) => setSettings({ ...settings, ttsProvider: e.target.value as TTSProvider })}
          className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="browser">{t('浏览器原生 TTS')}</option>
          <option value="openai">{t('OpenAI TTS')}</option>
          <option value="azure">{t('Azure TTS')}</option>
          <option value="elevenlabs">{t('ElevenLabs TTS')}</option>
        </select>

        {/* Browser TTS 配置 */}
        {settings.ttsProvider === 'browser' && (
          <div className="pl-4 space-y-3 border-l-2 border-gray-300 dark:border-gray-700">
            <div>
              <label className="text-sm font-medium">{t('语速')}</label>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.1"
                value={settings.ttsConfig.browser?.rate || 1}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ttsConfig: {
                      ...settings.ttsConfig,
                      browser: { ...settings.ttsConfig.browser, rate: parseFloat(e.target.value), pitch: 1, volume: 1 },
                    },
                  })
                }
                className="w-full"
              />
              <div className="text-sm text-gray-600">{settings.ttsConfig.browser?.rate || 1}x</div>
            </div>
          </div>
        )}

        {/* OpenAI TTS 配置 */}
        {settings.ttsProvider === 'openai' && (
          <div className="pl-4 space-y-3 border-l-2 border-gray-300 dark:border-gray-700">
            <div>
              <label className="text-sm font-medium">{t('API Key')}</label>
              <input
                type="password"
                value={settings.ttsConfig.openai?.apiKey || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ttsConfig: {
                      ...settings.ttsConfig,
                      openai: {
                        ...settings.ttsConfig.openai,
                        apiKey: e.target.value,
                        model: 'tts-1',
                        voice: 'alloy',
                        speed: 1.0,
                      },
                    },
                  })
                }
                placeholder="sk-..."
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t('语音')}</label>
              <select
                value={settings.ttsConfig.openai?.voice || 'alloy'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    ttsConfig: {
                      ...settings.ttsConfig,
                      openai: { ...settings.ttsConfig.openai!, voice: e.target.value as any },
                    },
                  })
                }
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              >
                <option value="alloy">Alloy</option>
                <option value="echo">Echo</option>
                <option value="fable">Fable</option>
                <option value="onyx">Onyx</option>
                <option value="nova">Nova</option>
                <option value="shimmer">Shimmer</option>
              </select>
            </div>
          </div>
        )}

        <button
          onClick={testTTS}
          disabled={testingTTS}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {testingTTS ? t('测试中...') : t('测试 TTS')}
        </button>
      </div>

      {/* 快捷键配置 */}
      <div className="space-y-3">
        <label className="font-medium">{t('快捷键')}</label>
        <div>
          <label className="text-sm font-medium">{t('语音快捷键')}</label>
          <div className="mt-1">
            <VoiceHotkeyRecorder
              value={settings.shortcuts.toggleVoice}
              shortcuts={appShortcuts}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  shortcuts: { ...settings.shortcuts, toggleVoice: v },
                })
              }
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">{t('长按快捷键开始录音，松开后发送识别内容。')}</p>
        </div>
      </div>

      <KeyboardControlSettings
        keyboardDriverPath={settings.keyboardDriverPath}
        keyboardShortcuts={settings.keyboardShortcuts}
        onKeyboardDriverPathChange={(keyboardDriverPath) => setSettings({ ...settings, keyboardDriverPath })}
        onKeyboardShortcutsChange={(keyboardShortcuts) => setSettings({ ...settings, keyboardShortcuts })}
      />

      {/* 高级选项 */}
      <div className="space-y-3">
        <label className="font-medium">{t('高级选项')}</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.autoStopRecording}
              onChange={(e) => setSettings({ ...settings, autoStopRecording: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm">{t('检测到静音后自动停止录音')}</span>
          </label>
          {settings.autoStopRecording && (
            <div className="ml-6 space-y-3">
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">
                  {t('静音判定时长')}: {(settings.silenceDuration / 1000).toFixed(1)}s
                </label>
                <input
                  type="range"
                  min={500}
                  max={10000}
                  step={500}
                  value={settings.silenceDuration}
                  onChange={(e) => setSettings({ ...settings, silenceDuration: Number(e.target.value) })}
                  className="w-full mt-1"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0.5s</span>
                  <span>10s</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">
                  {t('静音灵敏度')}: {(settings.silenceThreshold * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={0.2}
                  step={0.005}
                  value={settings.silenceThreshold}
                  onChange={(e) => setSettings({ ...settings, silenceThreshold: Number(e.target.value) })}
                  className="w-full mt-1"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{t('低（更易停止）')}</span>
                  <span>{t('高（更难停止）')}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-600 dark:text-gray-400">
                  {t('最大录音时长')}: {(settings.maxRecordingDuration / 1000).toFixed(0)}s
                </label>
                <input
                  type="range"
                  min={10000}
                  max={300000}
                  step={10000}
                  value={settings.maxRecordingDuration}
                  onChange={(e) => setSettings({ ...settings, maxRecordingDuration: Number(e.target.value) })}
                  className="w-full mt-1"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>10s</span>
                  <span>300s</span>
                </div>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.autoPlayResponse}
              onChange={(e) => setSettings({ ...settings, autoPlayResponse: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm">{t('自动播放 AI 响应')}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.showTranscript}
              onChange={(e) => setSettings({ ...settings, showTranscript: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="text-sm">{t('显示实时转录文本')}</span>
          </label>
        </div>
      </div>
    </div>
  )
}
