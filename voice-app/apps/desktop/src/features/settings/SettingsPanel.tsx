import { useEffect, useState } from 'react'
import {
  getEditableSettings,
  listMicrophoneInputs,
  resetEditableSettings,
  saveEditableSettings,
  type EditableSettingsMutationResult,
  type EditableSecretValueInput,
  type EditableVoiceSettings,
  type MicrophoneInputDevice,
  type SaveEditableVoiceSettingsInput,
} from '../../lib/tauri'
import { DefaultHotkeyRecorder } from './DefaultHotkeyRecorder'
import { KeyboardShortcutSettings } from './KeyboardShortcutSettings'
import { SkillBundleInventory } from './SkillBundleInventory'
import {
  getRuntimeReadinessWarnings,
  validateSettingsDraft,
  type SecretDraftState,
  type SettingsFieldKey,
} from './validation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToastContainer, useToast } from '@/components/ui/toast'
import {
  RefreshCw,
} from 'lucide-react'

type PanelStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error'
type MicrophoneStatus = 'idle' | 'loading' | 'error'
type SettingsTabValue = 'general' | 'asr' | 'model' | 'mcp'

function createUnchangedSecretDraft(): SecretDraftState {
  return { action: 'unchanged', value: '' }
}

function toSecretInput(secret: SecretDraftState): EditableSecretValueInput {
  if (secret.action === 'replace') {
    return { action: 'replace', value: secret.value }
  }
  return { action: secret.action }
}

function toSaveInput(
  draft: EditableVoiceSettings,
  doubaoSecret: SecretDraftState,
  llmSecret: SecretDraftState,
): SaveEditableVoiceSettingsInput {
  return {
    schema_version: draft.schema_version,
    history_enabled: draft.history_enabled,
    auto_launch_enabled: draft.auto_launch_enabled,
    default_hotkey: draft.default_hotkey,
    microphone_device_id: draft.microphone_device_id,
    doubao_asr_url: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
    doubao_asr_app_id: draft.doubao_asr_app_id,
    doubao_asr_resource_id: 'volc.bigasr.sauc.duration',
    doubao_asr_model: 'bigmodel',
    transcription_silence_timeout_ms: draft.transcription_silence_timeout_ms,
    llm_base_url: draft.llm_base_url,
    llm_model: draft.llm_model,
    llm_system_prompt: draft.llm_system_prompt,
    angrymiao_skill_enabled: draft.angrymiao_skill_enabled,
    keyboard_driver_path: draft.keyboard_driver_path,
    keyboard_shortcuts: draft.keyboard_shortcuts,
    mcp_servers_json: draft.mcp_servers_json,
    doubao_asr_access_token: toSecretInput(doubaoSecret),
    llm_api_key: toSecretInput(llmSecret),
  }
}

function toErrorMessage(cause: unknown) {
  if (cause instanceof Error) {
    return cause.message
  }
  if (typeof cause === 'string' && cause.trim()) {
    return cause.trim()
  }
  if (cause && typeof cause === 'object') {
    const message =
      'message' in cause && typeof cause.message === 'string'
        ? cause.message
        : 'error' in cause && typeof cause.error === 'string'
          ? cause.error
          : ''
    if (message.trim()) {
      return message.trim()
    }
  }
  return '设置操作失败。'
}

function getMutationFeedback(
  actionLabel: '设置已保存。' | '已恢复为当前已保存设置。',
  result: EditableSettingsMutationResult,
) {
  if (result.warnings.length === 0) {
    return actionLabel
  }
  const prefix =
    actionLabel === '设置已保存。'
      ? '设置已保存，但以下项目未即时生效：'
      : '已恢复为当前已保存设置，但以下项目未即时生效：'
  return `${prefix}${result.warnings.join('；')}`
}

export function SettingsPanel() {
  const [draft, setDraft] = useState<EditableVoiceSettings | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTabValue>('general')
  const [status, setStatus] = useState<PanelStatus>('loading')
  const [microphoneInputs, setMicrophoneInputs] = useState<MicrophoneInputDevice[]>([])
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneStatus>('loading')
  const [microphoneMessage, setMicrophoneMessage] = useState<string | null>(null)
  const [doubaoSecret, setDoubaoSecret] = useState<SecretDraftState>(createUnchangedSecretDraft())
  const [llmSecret, setLlmSecret] = useState<SecretDraftState>(createUnchangedSecretDraft())
  const { toast, showSuccess, showError, hideToast } = useToast()

  useEffect(() => {
    void loadInitialSettings()
  }, [])

  async function loadInitialSettings() {
    setStatus('loading')
    setMicrophoneStatus('loading')
    setMicrophoneMessage(null)

    const [settingsResult, microphonesResult] = await Promise.allSettled([
      getEditableSettings(),
      listMicrophoneInputs(),
    ])

    if (microphonesResult.status === 'fulfilled') {
      setMicrophoneInputs(microphonesResult.value)
      setMicrophoneStatus('idle')
    } else {
      setMicrophoneInputs([])
      setMicrophoneStatus('error')
      setMicrophoneMessage(toErrorMessage(microphonesResult.reason))
    }

    try {
      if (settingsResult.status === 'rejected') {
        throw settingsResult.reason
      }
      const settings = settingsResult.value
      hydrateDraft(settings)
      setStatus('idle')
    } catch (cause) {
      setStatus('error')
      showError(toErrorMessage(cause))
    }
  }

  function hydrateDraft(settings: EditableVoiceSettings) {
    setDraft(settings)
    setDoubaoSecret(createUnchangedSecretDraft())
    setLlmSecret(createUnchangedSecretDraft())
  }

  function updateDraft<Key extends keyof EditableVoiceSettings>(key: Key, value: EditableVoiceSettings[Key]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setStatus('idle')
  }

  function updateSecretDraft(setter: (next: SecretDraftState) => void, next: SecretDraftState) {
    setter(next)
    setStatus('idle')
  }

  async function handleRefreshMicrophoneInputs() {
    setMicrophoneStatus('loading')
    setMicrophoneMessage(null)
    try {
      const devices = await listMicrophoneInputs()
      setMicrophoneInputs(devices)
      setMicrophoneStatus('idle')
    } catch (cause) {
      setMicrophoneInputs([])
      setMicrophoneStatus('error')
      setMicrophoneMessage(toErrorMessage(cause))
    }
  }

  async function handleSave() {
    if (!draft) return
    if (hasBlockingErrors) {
      setStatus('error')
      showError('请先修正设置项后再保存。')
      return
    }
    setStatus('saving')
    try {
      const result = await saveEditableSettings(toSaveInput(draft, doubaoSecret, llmSecret))
      hydrateDraft(result.settings)
      setStatus('saved')
      showSuccess(getMutationFeedback('设置已保存。', result))
    } catch (cause) {
      await reloadPersistedSettingsAfterSaveError(toErrorMessage(cause))
    }
  }

  async function handleReset() {
    setStatus('saving')
    try {
      const result = await resetEditableSettings()
      hydrateDraft(result.settings)
      setStatus('saved')
      showSuccess(getMutationFeedback('已恢复为当前已保存设置。', result))
    } catch (cause) {
      setStatus('error')
      showError(toErrorMessage(cause))
    }
  }

  function updateSecret(value: string, hasSecret: boolean, setter: (next: SecretDraftState) => void) {
    if (!value) {
      updateSecretDraft(setter, hasSecret ? createUnchangedSecretDraft() : { action: 'replace', value: '' })
      return
    }
    updateSecretDraft(setter, { action: 'replace', value })
  }

  async function reloadPersistedSettingsAfterSaveError(errorMessage: string) {
    try {
      const persisted = await getEditableSettings()
      hydrateDraft(persisted)
    } catch {
      // keep user draft
    }
    setStatus('error')
    showError(errorMessage)
  }

  const isBusy = status === 'loading' || status === 'saving'
  const validationErrors = draft ? validateSettingsDraft(draft, doubaoSecret, llmSecret) : {}
  const hasBlockingErrors = Object.keys(validationErrors).length > 0
  const runtimeReadinessWarnings = draft ? getRuntimeReadinessWarnings(draft, doubaoSecret, llmSecret) : []
  const isSavedMicrophoneUnavailable =
    Boolean(draft?.microphone_device_id?.trim()) &&
    microphoneStatus !== 'loading' &&
    !microphoneInputs.some((device) => device.id === draft?.microphone_device_id)

  function inputClassName(field: SettingsFieldKey) {
    return validationErrors[field] ? 'border-destructive focus-visible:ring-destructive' : ''
  }

  function renderFieldError(field: SettingsFieldKey) {
    const error = validationErrors[field]
    if (!error) return null
    return <p className="text-sm text-destructive mt-1">{error}</p>
  }

  function getMicrophoneOptionLabel(device: MicrophoneInputDevice) {
    return device.is_default ? `${device.label}（当前系统默认）` : device.label
  }

  return (
    <section className="console-page settings-page">
      {!draft ? (
        <div className="console-empty-state">
          <div className="animate-spin h-8 w-8 rounded-full border-2 border-primary border-t-transparent" />
          <p>正在加载设置...</p>
        </div>
      ) : (
        <Tabs
          className="settings-tabs-shell"
          data-scroll-container="false"
          onValueChange={(value) => setActiveTab(value as SettingsTabValue)}
          value={activeTab}
        >
          {/* Fixed tabs header - stays at top, never scrolls */}
          <div className="settings-pill-tabs-header">
            <TabsList className="settings-pill-tabs">
              <TabsTrigger className="settings-pill-tab" onClick={() => setActiveTab('general')} value="general">通用</TabsTrigger>
              <TabsTrigger className="settings-pill-tab" onClick={() => setActiveTab('asr')} value="asr">ASR</TabsTrigger>
              <TabsTrigger className="settings-pill-tab" onClick={() => setActiveTab('model')} value="model">模型</TabsTrigger>
              <TabsTrigger className="settings-pill-tab" onClick={() => setActiveTab('mcp')} value="mcp">MCP</TabsTrigger>
            </TabsList>
          </div>

          <div
            className="settings-content animate-panel-fade-in"
            data-scroll-container="true"
            data-testid="settings-content"
          >
            <form
              className="settings-form-shell"
              data-scroll-container="false"
              onSubmit={(event) => {
                event.preventDefault()
                void handleSave()
              }}
            >
              <ToastContainer toast={toast} hideToast={hideToast} />

              {runtimeReadinessWarnings.length > 0 ? (
                <div className="console-warning" role="status" style={{ marginBottom: '12px' }}>
                  当前语音任务还不能运行，请补齐：{runtimeReadinessWarnings.join('、')}。
                </div>
              ) : null}

              <TabsContent className="settings-pill-panel" value="general" key="general">
                <div className="settings-glass-card">
                  {/* Save History */}
                  <div className="settings-toggle-card">
                    <span className="settings-toggle-title">保存历史记录</span>
                  <Switch
                    aria-label="保存历史记录"
                    checked={draft.history_enabled}
                    disabled={isBusy}
                    onCheckedChange={(checked) => updateDraft('history_enabled', checked)}
                  />
                </div>

                {/* Auto Launch */}
                <div className="settings-toggle-card">
                  <span className="settings-toggle-title">开机自启动</span>
                  <Switch
                    aria-label="开机自启动"
                    checked={draft.auto_launch_enabled}
                    disabled={isBusy}
                    onCheckedChange={(checked) => updateDraft('auto_launch_enabled', checked)}
                  />
                </div>

                {/* Default Hotkey */}
                <div className="settings-device-card">
                  <span className="settings-device-title">默认热键</span>
                  <div className="settings-device-control">
                    <DefaultHotkeyRecorder
                      inputAriaInvalid={Boolean(validationErrors.default_hotkey)}
                      inputClassName="settings-hotkey-input"
                      value={draft.default_hotkey}
                      onChange={(value) => updateDraft('default_hotkey', value)}
                    />
                    {renderFieldError('default_hotkey')}
                  </div>
                </div>

                {/* Default Microphone */}
                <div className="settings-device-card">
                  <span className="settings-device-title">默认麦克风</span>
                  <div className="settings-device-control">
                    <div className="settings-device-select-row">
                      <Select
                        value={draft.microphone_device_id || 'system-default'}
                        onValueChange={(value) => updateDraft('microphone_device_id', value === 'system-default' ? '' : value)}
                        disabled={isBusy}
                      >
                        <SelectTrigger className="settings-device-select">
                          <SelectValue placeholder="选择麦克风" />
                        </SelectTrigger>
                        <SelectContent>
                          {isSavedMicrophoneUnavailable ? (
                            <SelectItem value={draft.microphone_device_id}>已保存设备不可用</SelectItem>
                          ) : null}
                          <SelectItem value="system-default">系统默认麦克风</SelectItem>
                          {microphoneInputs.map((device) => (
                            <SelectItem key={device.id} value={device.id}>
                              {getMicrophoneOptionLabel(device)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        aria-label="刷新设备列表"
                        className="settings-device-refresh-btn"
                        disabled={isBusy || microphoneStatus === 'loading'}
                        onClick={() => void handleRefreshMicrophoneInputs()}
                        type="button"
                        variant="outline"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    {microphoneStatus === 'error' && microphoneMessage ? (
                      <p className="settings-device-error">{microphoneMessage}</p>
                    ) : null}
                  </div>
                </div>

                <div className="settings-action-bar">
                  <button
                    className="settings-btn-glass"
                    disabled={isBusy}
                    onClick={() => void handleReset()}
                    type="button"
                  >
                    重置
                  </button>
                  <button
                    className="settings-btn-primary"
                    disabled={isBusy || hasBlockingErrors}
                    type="submit"
                  >
                    保存设置
                  </button>
                </div>
              </div>
            </TabsContent>

              <TabsContent className="settings-pill-panel" value="asr" key="asr">
                <div className="settings-glass-card">
                {/* App ID */}
                <div className="settings-input-card">
                  <span className="settings-input-title">豆包 App ID</span>
                  <Input
                    aria-label="豆包 App ID"
                    className="settings-input-field"
                    value={draft.doubao_asr_app_id}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateDraft('doubao_asr_app_id', event.target.value)}
                  />
                </div>

                {/* Access Token */}
                <div className="settings-input-card">
                  <span className="settings-input-title">豆包 Access Token</span>
                  <div className="settings-secret-row">
                    <Input
                      aria-label="豆包 Access Token"
                      className="settings-input-field"
                      placeholder={draft.has_doubao_asr_access_token ? '已保存，留空则保持不变' : '当前未设置'}
                      type="password"
                      value={doubaoSecret.action === 'replace' ? doubaoSecret.value : ''}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        updateSecret(event.target.value, draft.has_doubao_asr_access_token, setDoubaoSecret)
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="settings-secret-btn"
                      onClick={() => updateSecretDraft(setDoubaoSecret, createUnchangedSecretDraft())}
                    >
                      保持
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="settings-secret-btn settings-secret-btn-danger"
                      onClick={() => updateSecretDraft(setDoubaoSecret, { action: 'clear', value: '' })}
                    >
                      清空
                    </Button>
                  </div>
                </div>

                {/* Silence Timeout */}
                <div className="settings-input-card">
                  <span className="settings-input-title">转录静音自动结束</span>
                  <div className="settings-number-row">
                    <Input
                      aria-invalid={Boolean(validationErrors.transcription_silence_timeout_ms)}
                      aria-label="转录静音自动结束"
                      className="settings-input-field settings-input-number"
                      max={5000}
                      min={0}
                      step={100}
                      type="number"
                      value={draft.transcription_silence_timeout_ms}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateDraft('transcription_silence_timeout_ms', Number(event.target.value) || 0)}
                    />
                    <span className="settings-number-unit">毫秒</span>
                  </div>
                  {renderFieldError('transcription_silence_timeout_ms')}
                </div>

                <div className="settings-action-bar">
                  <button
                    className="settings-btn-glass"
                    disabled={isBusy}
                    onClick={() => void handleReset()}
                    type="button"
                  >
                    重置
                  </button>
                  <button
                    className="settings-btn-primary"
                    disabled={isBusy || hasBlockingErrors}
                    type="submit"
                  >
                    保存设置
                  </button>
                </div>
              </div>
            </TabsContent>

              <TabsContent className="settings-pill-panel" value="model" key="model">
                <div className="settings-glass-card">
                {/* LLM Base URL */}
                <div className="settings-input-card">
                  <span className="settings-input-title">LLM 服务地址</span>
                  <Input
                    aria-invalid={Boolean(validationErrors.llm_base_url)}
                    aria-label="LLM 服务地址"
                    className="settings-input-field"
                    value={draft.llm_base_url}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateDraft('llm_base_url', event.target.value)}
                  />
                  {renderFieldError('llm_base_url')}
                </div>

                {/* LLM API Key */}
                <div className="settings-input-card">
                  <span className="settings-input-title">LLM API Key</span>
                  <div className="settings-secret-row">
                    <Input
                      aria-label="LLM API Key"
                      className="settings-input-field"
                      placeholder={draft.has_llm_api_key ? '已保存，留空则保持不变' : '当前未设置'}
                      type="password"
                      value={llmSecret.action === 'replace' ? llmSecret.value : ''}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateSecret(event.target.value, draft.has_llm_api_key, setLlmSecret)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="settings-secret-btn"
                      onClick={() => updateSecretDraft(setLlmSecret, createUnchangedSecretDraft())}
                    >
                      保持
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="settings-secret-btn settings-secret-btn-danger"
                      onClick={() => updateSecretDraft(setLlmSecret, { action: 'clear', value: '' })}
                    >
                      清空
                    </Button>
                  </div>
                </div>

                {/* LLM Model */}
                <div className="settings-input-card">
                  <span className="settings-input-title">LLM 模型</span>
                  <Input
                    aria-invalid={Boolean(validationErrors.llm_model)}
                    aria-label="LLM 模型"
                    className="settings-input-field"
                    value={draft.llm_model}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateDraft('llm_model', event.target.value)}
                  />
                  {renderFieldError('llm_model')}
                </div>

                {/* System Prompt */}
                <div className="settings-input-card settings-input-card-wide">
                  <span className="settings-input-title">系统提示词</span>
                  <Textarea
                    aria-label="系统提示词"
                    className="settings-textarea-field"
                    rows={6}
                    value={draft.llm_system_prompt}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => updateDraft('llm_system_prompt', event.target.value)}
                  />
                </div>

                <div className="settings-action-bar">
                  <button
                    className="settings-btn-glass"
                    disabled={isBusy}
                    onClick={() => void handleReset()}
                    type="button"
                  >
                    重置
                  </button>
                  <button
                    className="settings-btn-primary"
                    disabled={isBusy || hasBlockingErrors}
                    type="submit"
                  >
                    保存设置
                  </button>
                </div>
              </div>
            </TabsContent>

              <TabsContent className="settings-pill-panel" value="mcp" key="mcp">
                <div className="settings-glass-card">
                <SkillBundleInventory
                  skillEnabled={draft.angrymiao_skill_enabled}
                  onSkillEnabledChange={(checked) => updateDraft('angrymiao_skill_enabled', checked)}
                  disabled={isBusy}
                />

                <KeyboardShortcutSettings
                  keyboardDriverPath={draft.keyboard_driver_path}
                  keyboardShortcuts={draft.keyboard_shortcuts}
                  onKeyboardDriverPathChange={(value) => updateDraft('keyboard_driver_path', value)}
                  onKeyboardShortcutsChange={(value) => updateDraft('keyboard_shortcuts', value)}
                />
                {renderFieldError('keyboard_shortcuts')}

                {/* MCP Servers JSON */}
                <div className="settings-input-card settings-input-card-wide">
                  <span className="settings-input-title">MCP 服务配置</span>
                  <Textarea
                    aria-invalid={Boolean(validationErrors.mcp_servers_json)}
                    aria-label="MCP 服务配置"
                    className="settings-textarea-field"
                    rows={6}
                    value={draft.mcp_servers_json}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => updateDraft('mcp_servers_json', event.target.value)}
                  />
                  {renderFieldError('mcp_servers_json')}
                </div>

                <div className="settings-action-bar">
                  <button
                    className="settings-btn-glass"
                    disabled={isBusy}
                    onClick={() => void handleReset()}
                    type="button"
                  >
                    重置
                  </button>
                  <button
                    className="settings-btn-primary"
                    disabled={isBusy || hasBlockingErrors}
                    type="submit"
                  >
                    保存设置
                  </button>
                </div>
              </div>
              </TabsContent>
            </form>
          </div>
        </Tabs>
      )}
    </section>
  )
}
