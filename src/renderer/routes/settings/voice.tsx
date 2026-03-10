import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useVoiceSettings } from '@/hooks/useVoiceSettings'
import type { ASRProvider, TTSProvider, WhisperModelSize, KeyboardShortcut } from '@shared/types/voice'
import { WhisperLocalProvider, FunASRLocalProvider, OpenAIASRProvider, AzureASRProvider, GoogleASRProvider } from '@/packages/voice/asr'
import type { WhisperDownloadProgress } from '@/packages/voice/asr/whisper-local'
import { BrowserTTSProvider, OpenAITTSProvider, AzureTTSProvider, ElevenLabsTTSProvider } from '@/packages/voice/tts'
import { getDefaultKeyboardShortcuts, buildKeyCodes, KEY_CATEGORIES } from '@shared/defaults/keyboard-shortcuts'
import platform from '@/platform'

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

  const handleDriverPathSelect = async () => {
    // 使用 Electron 的文件选择对话框
    const result = await window.electronAPI?.invoke('dialog:openFile', {
      filters: [{ name: 'Executable', extensions: ['exe'] }],
      properties: ['openFile'],
    })

    if (result && !result.canceled && result.filePaths[0]) {
      setSettings((prev) => ({
        ...prev,
        keyboardDriverPath: result.filePaths[0],
      }))
    }
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

      alert(t('ASR 提供商配置正确！\n\n请使用快捷键 {{shortcut}} 开始语音输入测试。', {
        shortcut: settings.shortcuts.toggleVoice
      }))
    } catch (error) {
      alert(t('ASR 测试失败: {{error}}', {
        error: error instanceof Error ? error.message : String(error)
      }))
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
      alert(t('TTS 测试失败: {{error}}', {
        error: error instanceof Error ? error.message : String(error)
      }))
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
                        ...settings.asrConfig.funasrLocal,
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
                <div className="text-xs text-gray-500">{t('PID')}: {funasrServiceStatus.pid}</div>
              )}
              {funasrServiceStatus?.error && (
                <div className="text-xs text-red-600">{funasrServiceStatus.error}</div>
              )}
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
                        ...settings.asrConfig.funasrLocal,
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
                        ...settings.asrConfig.funasrLocal,
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
                value={settings.asrConfig.funasrLocal?.launchCommand || 'python3'}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...settings.asrConfig.funasrLocal,
                        launchCommand: e.target.value,
                      },
                    },
                  })
                }
                placeholder="python3"
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
                        ...settings.asrConfig.funasrLocal,
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
                        ...settings.asrConfig.funasrLocal,
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
                        ...settings.asrConfig.funasrLocal,
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
                        ...settings.asrConfig.funasrLocal,
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
                        ...settings.asrConfig.funasrLocal,
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
                value={joinCsv(settings.asrConfig.funasrLocal?.responseTextPaths || ['text', 'result', 'data.text', 'data.result'])}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    asrConfig: {
                      ...settings.asrConfig,
                      funasrLocal: {
                        ...settings.asrConfig.funasrLocal,
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
                          ...settings.asrConfig.funasrLocal,
                          requestTemplate: {
                            ...settings.asrConfig.funasrLocal?.requestTemplate,
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
                          ...settings.asrConfig.funasrLocal,
                          requestTemplate: {
                            ...settings.asrConfig.funasrLocal?.requestTemplate,
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
                          ...settings.asrConfig.funasrLocal,
                          requestTemplate: {
                            ...settings.asrConfig.funasrLocal?.requestTemplate,
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
                          ...settings.asrConfig.funasrLocal,
                          requestTemplate: {
                            ...settings.asrConfig.funasrLocal?.requestTemplate,
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
                          ...settings.asrConfig.funasrLocal,
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
                          ...settings.asrConfig.funasrLocal,
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
                        ...settings.asrConfig.funasrLocal,
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
                        ...settings.asrConfig.funasrLocal,
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
                        ...settings.asrConfig.whisperLocal,
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
                        ...settings.asrConfig.whisperLocal,
                        remoteHost: e.target.value || undefined,
                      },
                    },
                  })
                }
                placeholder="https://hf-mirror.com（国内可用）"
                className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">{t('留空使用 huggingface.co，国内网络可填 https://hf-mirror.com')}</p>
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
                          ...settings.asrConfig.whisperLocal,
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
                      <p className="text-gray-600">{whisperProgress.file} — {whisperProgress.progress.toFixed(1)}%</p>
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
          <label className="text-sm font-medium">{t('切换语音模式')}</label>
          <div className="mt-1">
            <HotkeyPicker
              value={settings.shortcuts.toggleVoice}
              onChange={(v) =>
                setSettings({
                  ...settings,
                  shortcuts: { ...settings.shortcuts, toggleVoice: v },
                })
              }
            />
          </div>
        </div>
      </div>

      {/* 键盘驱动路径 */}
      <div className="space-y-3">
        <label className="font-medium">{t('键盘控制驱动')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={settings.keyboardDriverPath || ''}
            readOnly
            placeholder={t('选择 driver.exe 文件') || ''}
            className="flex-1 p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
          />
          <button
            onClick={handleDriverPathSelect}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            {t('浏览...')}
          </button>
        </div>
      </div>

      {/* 键盘快捷键映射 */}
      <KeyboardShortcutsSection settings={settings} setSettings={setSettings} />

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

// ─── Key display helpers ──────────────────────────────────────────────────────

const HID_KEY_DISPLAY: Record<string, string> = {
  CtrlLeft: 'Ctrl', CmdLeft: 'Cmd/Win', ShiftLeft: 'Shift', AltLeft: 'Alt',
  Num0: '0', Num1: '1', Num2: '2', Num3: '3', Num4: '4',
  Num5: '5', Num6: '6', Num7: '7', Num8: '8', Num9: '9',
  Up: '↑', Down: '↓', Left: '←', Right: '→',
  PageUp: 'PgUp', PageDown: 'PgDn', PrintScreen: 'PrtScr',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Apostrophe: "'", Grave: '`',
  Comma: ',', Period: '.', Slash: '/', Minus: '-', Equal: '=',
}

const HID_CATEGORY_NAMES: Record<string, string> = {
  modifiers: '修饰键', letters: '字母', numbers: '数字',
  function: 'F键', arrows: '方向', special: '特殊', punctuation: '标点',
}

function getHIDKeyLabel(key: string): string {
  return HID_KEY_DISPLAY[key] || key
}

const MAX_COMBO_KEYS = 7

// ─── KeyComboBuilder ──────────────────────────────────────────────────────────

function KeyComboBuilder({ slots, onChange }: { slots: string[]; onChange: (s: string[]) => void }) {
  const [showPicker, setShowPicker] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('modifiers')
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const toggleKey = (key: string) => {
    if (slots.includes(key)) {
      onChange(slots.filter((k) => k !== key))
    } else if (slots.length < MAX_COMBO_KEYS) {
      onChange([...slots, key])
    }
  }

  return (
    <div className="relative space-y-1.5">
      <div className="flex flex-wrap gap-1 items-center">
        {slots.map((key, idx) => (
          <span
            key={idx}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded border border-blue-300 dark:border-blue-700"
          >
            {getHIDKeyLabel(key)}
            <button
              type="button"
              onClick={() => onChange(slots.filter((_, i) => i !== idx))}
              className="ml-0.5 hover:text-red-600"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={slots.length >= MAX_COMBO_KEYS}
          onClick={() => setShowPicker(!showPicker)}
          className="px-2 py-0.5 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + 添加键
        </button>
        {slots.length >= MAX_COMBO_KEYS && (
          <span className="text-xs text-gray-400">最多 {MAX_COMBO_KEYS} 个键</span>
        )}
      </div>
      {slots.length > 0 && (
        <p className="text-xs text-gray-400">{buildKeyCodes(slots).join(', ')}</p>
      )}
      {showPicker && (
        <div
          ref={pickerRef}
          className="absolute left-0 top-full mt-1 z-50 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg min-w-64"
        >
          <div className="flex flex-wrap gap-1 mb-2">
            {(Object.keys(KEY_CATEGORIES) as Array<keyof typeof KEY_CATEGORIES>).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-0.5 text-xs rounded ${activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
              >
                {HID_CATEGORY_NAMES[cat] || cat}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 max-w-72">
            {KEY_CATEGORIES[activeCategory as keyof typeof KEY_CATEGORIES]?.map((key) => (
              <button
                key={key}
                type="button"
                disabled={slots.length >= MAX_COMBO_KEYS && !slots.includes(key)}
                onClick={() => toggleKey(key)}
                className={`px-2 py-1 text-xs rounded border min-w-8 ${
                  slots.includes(key)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-500'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {getHIDKeyLabel(key)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── HotkeyPicker ─────────────────────────────────────────────────────────────

const HOTKEY_MODIFIERS = new Set(['Ctrl', 'Shift', 'Alt', 'Meta'])

const HOTKEY_CATEGORIES = {
  modifiers: ['Ctrl', 'Shift', 'Alt', 'Meta'],
  letters: ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'],
  numbers: ['0','1','2','3','4','5','6','7','8','9'],
  function: ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'],
  special: ['Return','Tab','Escape','Space','Backspace','Delete','Up','Down','Left','Right'],
  punctuation: ['-','=','[',']','\\',';',"'",'`',',','.','/'],
} as const

const HOTKEY_CATEGORY_NAMES: Record<string, string> = {
  modifiers: '修饰键', letters: '字母', numbers: '数字', function: 'F键', special: '特殊键', punctuation: '标点',
}

function getHotkeyLabel(key: string, isMac: boolean): string {
  if (key === 'Meta') return isMac ? 'Cmd' : 'Win'
  if (key === 'Return') return 'Enter'
  if (key === 'Up') return '↑'
  if (key === 'Down') return '↓'
  if (key === 'Left') return '←'
  if (key === 'Right') return '→'
  return key
}

function HotkeyPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() =>
    value ? value.split('+').filter(Boolean) : []
  )
  const [showPicker, setShowPicker] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('modifiers')
  const pickerRef = useRef<HTMLDivElement>(null)
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)

  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const toggleKey = (key: string) => {
    let newKeys: string[]
    if (HOTKEY_MODIFIERS.has(key)) {
      newKeys = selectedKeys.includes(key)
        ? selectedKeys.filter((k) => k !== key)
        : [...selectedKeys, key]
    } else {
      const mods = selectedKeys.filter((k) => HOTKEY_MODIFIERS.has(k))
      newKeys = selectedKeys.includes(key) ? mods : [...mods, key]
    }
    setSelectedKeys(newKeys)
    onChange(newKeys.join('+'))
  }

  const removeKey = (key: string) => {
    const newKeys = selectedKeys.filter((k) => k !== key)
    setSelectedKeys(newKeys)
    onChange(newKeys.join('+'))
  }

  const reset = () => {
    const defaultKeys = ['Ctrl', 'Shift', 'V']
    setSelectedKeys(defaultKeys)
    onChange(defaultKeys.join('+'))
  }

  return (
    <div className="relative space-y-1.5">
      <div className="flex flex-wrap gap-1 items-center">
        {selectedKeys.map((key) => (
          <span
            key={key}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded border border-blue-300 dark:border-blue-700"
          >
            {getHotkeyLabel(key, isMac)}
            <button
              type="button"
              onClick={() => removeKey(key)}
              className="ml-0.5 hover:text-red-600"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="px-2 py-0.5 text-xs border rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          + 选择键
        </button>
        <button
          type="button"
          onClick={reset}
          className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          重置
        </button>
      </div>
      {selectedKeys.length > 0 && (
        <p className="text-xs text-gray-500">{selectedKeys.join('+')}</p>
      )}
      {showPicker && (
        <div
          ref={pickerRef}
          className="absolute left-0 top-full mt-1 z-50 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg min-w-64"
        >
          <div className="flex flex-wrap gap-1 mb-2">
            {(Object.keys(HOTKEY_CATEGORIES) as Array<keyof typeof HOTKEY_CATEGORIES>).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={`px-2 py-0.5 text-xs rounded ${activeCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
              >
                {HOTKEY_CATEGORY_NAMES[cat] || cat}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 max-w-72">
            {HOTKEY_CATEGORIES[activeCategory as keyof typeof HOTKEY_CATEGORIES]?.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleKey(key)}
                className={`px-2 py-1 text-xs rounded border min-w-8 ${
                  selectedKeys.includes(key)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-50 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border-gray-200 dark:border-gray-500'
                }`}
              >
                {getHotkeyLabel(key, isMac)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Keyboard Shortcuts Section ──────────────────────────────────────────────

function KeyboardShortcutsSection({
  settings,
  setSettings,
}: {
  settings: ReturnType<typeof useVoiceSettings>['settings']
  setSettings: ReturnType<typeof useVoiceSettings>['setSettings']
}) {
  const { t } = useTranslation()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTriggerWords, setNewTriggerWords] = useState('')
  const [newSlots, setNewSlots] = useState<string[]>([])

  const shortcuts = settings.keyboardShortcuts || []

  const updateShortcut = useCallback(
    (id: string, patch: Partial<KeyboardShortcut>) => {
      const updated = shortcuts.map((s) => (s.id === id ? { ...s, ...patch } : s))
      setSettings({ keyboardShortcuts: updated })
    },
    [shortcuts, setSettings]
  )

  const removeShortcut = useCallback(
    (id: string) => {
      setSettings({ keyboardShortcuts: shortcuts.filter((s) => s.id !== id) })
      if (expandedId === id) setExpandedId(null)
    },
    [shortcuts, setSettings, expandedId]
  )

  const addShortcut = useCallback(() => {
    if (!newName.trim() || !newTriggerWords.trim() || newSlots.length === 0) return
    const keyCodes = buildKeyCodes(newSlots)
    const entry: KeyboardShortcut = {
      id: `ks_custom_${Date.now()}`,
      name: newName.trim(),
      triggerWords: newTriggerWords.split(/[,，]/).map((w) => w.trim()).filter(Boolean),
      keyCodes,
      enabled: true,
    }
    setSettings({ keyboardShortcuts: [...shortcuts, entry] })
    setNewName('')
    setNewTriggerWords('')
    setNewSlots([])
    setAddingNew(false)
  }, [newName, newTriggerWords, newSlots, shortcuts, setSettings])

  const resetDefaults = useCallback(async () => {
    const platformType = await platform.getPlatform()
    setSettings({ keyboardShortcuts: getDefaultKeyboardShortcuts(platformType) })
  }, [setSettings])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="font-medium">{t('键盘快捷键')}</label>
        <div className="flex gap-2">
          <button
            onClick={() => setAddingNew(true)}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {t('添加快捷键')}
          </button>
          <button
            onClick={resetDefaults}
            className="px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
          >
            {t('恢复默认')}
          </button>
        </div>
      </div>

      {/* Shortcut list */}
      <div className="space-y-1">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.id} className="border rounded-lg dark:border-gray-700">
            <div
              className="flex items-center justify-between p-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
              onClick={() => setExpandedId(expandedId === shortcut.id ? null : shortcut.id)}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={shortcut.enabled}
                  onChange={(e) => {
                    e.stopPropagation()
                    updateShortcut(shortcut.id, { enabled: e.target.checked })
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">{shortcut.name}</span>
                <span className="text-xs text-gray-500">{shortcut.triggerWords.join(' / ')}</span>
              </div>
              <span className="text-xs text-gray-400">{expandedId === shortcut.id ? '▲' : '▼'}</span>
            </div>

            {expandedId === shortcut.id && (
              <div className="p-3 border-t dark:border-gray-700 space-y-2">
                <div>
                  <label className="text-xs text-gray-500">{t('名称')}</label>
                  <input
                    type="text"
                    value={shortcut.name}
                    onChange={(e) => updateShortcut(shortcut.id, { name: e.target.value })}
                    className="w-full p-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t('触发词（逗号分隔）')}</label>
                  <input
                    type="text"
                    value={shortcut.triggerWords.join(', ')}
                    onChange={(e) =>
                      updateShortcut(shortcut.id, {
                        triggerWords: e.target.value.split(/[,，]/).map((w) => w.trim()).filter(Boolean),
                      })
                    }
                    className="w-full p-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t('Key Codes')}</label>
                  <input
                    type="text"
                    value={shortcut.keyCodes.join(', ')}
                    readOnly
                    className="w-full p-1.5 text-sm border rounded bg-gray-50 dark:bg-gray-900 dark:border-gray-700 text-gray-500"
                  />
                </div>
                {shortcut.id.startsWith('ks_custom_') && (
                  <button
                    onClick={() => removeShortcut(shortcut.id)}
                    className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    {t('删除')}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new shortcut form */}
      {addingNew && (
        <div className="p-3 border rounded-lg dark:border-gray-700 space-y-2">
          <div>
            <label className="text-xs text-gray-500">{t('名称')}</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('如：截图') || ''}
              className="w-full p-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('触发词（逗号分隔）')}</label>
            <input
              type="text"
              value={newTriggerWords}
              onChange={(e) => setNewTriggerWords(e.target.value)}
              placeholder={t('如：截图, 截屏') || ''}
              className="w-full p-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('按键组合')}</label>
            <div className="mt-1">
              <KeyComboBuilder slots={newSlots} onChange={setNewSlots} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addShortcut}
              disabled={!newName.trim() || !newTriggerWords.trim() || newSlots.length === 0}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('确认添加')}
            </button>
            <button
              onClick={() => setAddingNew(false)}
              className="px-3 py-1 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600"
            >
              {t('取消')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
