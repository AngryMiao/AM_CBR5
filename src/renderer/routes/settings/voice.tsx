import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useVoiceSettings } from '@/hooks/useVoiceSettings'
import type { ASRProvider, TTSProvider, WhisperModelSize, KeyboardShortcut } from '@shared/types/voice'
import { WhisperLocalProvider, OpenAIASRProvider, AzureASRProvider, GoogleASRProvider } from '@/packages/voice/asr'
import type { WhisperDownloadProgress } from '@/packages/voice/asr/whisper-local'
import { BrowserTTSProvider, OpenAITTSProvider, AzureTTSProvider, ElevenLabsTTSProvider } from '@/packages/voice/tts'
import { getDefaultKeyboardShortcuts, HID, makeCombo, makeSingleKey } from '@shared/defaults/keyboard-shortcuts'
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
  const whisperProviderRef = useRef<WhisperLocalProvider | null>(null)

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
          <option value="openai">{t('OpenAI Whisper API')}</option>
          <option value="azure">{t('Azure Speech Services')}</option>
          <option value="google">{t('Google Cloud Speech')}</option>
        </select>

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
          <input
            type="text"
            value={settings.shortcuts.toggleVoice}
            onChange={(e) =>
              setSettings({
                ...settings,
                shortcuts: { ...settings.shortcuts, toggleVoice: e.target.value },
              })
            }
            placeholder="Ctrl+Shift+V"
            className="w-full p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700 mt-1"
          />
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

// ─── Modifier / Key options for the key code builder ─────────────────────────

const MODIFIER_OPTIONS = [
  { label: 'Ctrl', value: HID.CtrlLeft },
  { label: 'Cmd/Win', value: HID.CmdLeft },
  { label: 'Shift', value: HID.ShiftLeft },
  { label: 'Alt', value: HID.AltLeft },
] as const

const KEY_OPTIONS = [
  { label: 'A', value: HID.A },
  { label: 'C', value: HID.C },
  { label: 'S', value: HID.S },
  { label: 'V', value: HID.V },
  { label: 'X', value: HID.X },
  { label: 'Y', value: HID.Y },
  { label: 'Z', value: HID.Z },
  { label: 'Enter', value: HID.Enter },
  { label: 'Backspace', value: HID.Backspace },
  { label: 'Tab', value: HID.Tab },
  { label: 'Escape', value: HID.Escape },
] as const

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
  const [newModifiers, setNewModifiers] = useState<string[]>([])
  const [newKey, setNewKey] = useState('')

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
    if (!newName.trim() || !newTriggerWords.trim() || !newKey) return
    const keyCodes =
      newModifiers.length > 0 ? makeCombo(newModifiers, newKey) : makeSingleKey(newKey)
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
    setNewModifiers([])
    setNewKey('')
    setAddingNew(false)
  }, [newName, newTriggerWords, newModifiers, newKey, shortcuts, setSettings])

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
            <label className="text-xs text-gray-500">{t('修饰键')}</label>
            <div className="flex gap-2 flex-wrap">
              {MODIFIER_OPTIONS.map((mod) => (
                <label key={mod.value} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={newModifiers.includes(mod.value)}
                    onChange={(e) => {
                      setNewModifiers(
                        e.target.checked
                          ? [...newModifiers, mod.value]
                          : newModifiers.filter((m) => m !== mod.value)
                      )
                    }}
                    className="w-3.5 h-3.5"
                  />
                  {mod.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">{t('主键')}</label>
            <select
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full p-1.5 text-sm border rounded dark:bg-gray-800 dark:border-gray-700"
            >
              <option value="">{t('选择按键')}</option>
              {KEY_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addShortcut}
              disabled={!newName.trim() || !newTriggerWords.trim() || !newKey}
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
