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
import { 
  Save, 
  RotateCcw, 
  AlertTriangle,
  RefreshCw
} from 'lucide-react'

type PanelStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error'
type MicrophoneStatus = 'idle' | 'loading' | 'error'
type SettingsTabValue = 'general' | 'hotkey' | 'asr' | 'model' | 'mcp'

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
    doubao_asr_url: draft.doubao_asr_url,
    doubao_asr_app_id: draft.doubao_asr_app_id,
    doubao_asr_resource_id: draft.doubao_asr_resource_id,
    doubao_asr_model: draft.doubao_asr_model,
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

function getSecretHint(hasSecret: boolean, secret: SecretDraftState, providerName: string) {
  if (secret.action === 'clear') {
    return `保存后会清空当前已保存的 ${providerName}。`
  }
  if (secret.action === 'replace' && secret.value.trim()) {
    return `保存后会覆盖当前已保存的 ${providerName}。`
  }
  if (hasSecret) {
    return `当前已保存 ${providerName}，留空并直接保存会保持不变。`
  }
  return `当前未设置 ${providerName}，输入后保存即可生效。`
}

export function SettingsPanel() {
  const [draft, setDraft] = useState<EditableVoiceSettings | null>(null)
  const [activeTab, setActiveTab] = useState<SettingsTabValue>('general')
  const [status, setStatus] = useState<PanelStatus>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [microphoneInputs, setMicrophoneInputs] = useState<MicrophoneInputDevice[]>([])
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneStatus>('loading')
  const [microphoneMessage, setMicrophoneMessage] = useState<string | null>(null)
  const [doubaoSecret, setDoubaoSecret] = useState<SecretDraftState>(createUnchangedSecretDraft())
  const [llmSecret, setLlmSecret] = useState<SecretDraftState>(createUnchangedSecretDraft())

  useEffect(() => {
    void loadInitialSettings()
  }, [])

  async function loadInitialSettings() {
    setStatus('loading')
    setMessage(null)
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
      setMessage(toErrorMessage(cause))
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
    setMessage(null)
  }

  function updateSecretDraft(setter: (next: SecretDraftState) => void, next: SecretDraftState) {
    setter(next)
    setStatus('idle')
    setMessage(null)
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
      setMessage('请先修正设置项后再保存。')
      return
    }
    setStatus('saving')
    setMessage(null)
    try {
      const result = await saveEditableSettings(toSaveInput(draft, doubaoSecret, llmSecret))
      hydrateDraft(result.settings)
      setStatus('saved')
      setMessage(getMutationFeedback('设置已保存。', result))
    } catch (cause) {
      await reloadPersistedSettingsAfterSaveError(toErrorMessage(cause))
    }
  }

  async function handleReset() {
    setStatus('saving')
    setMessage(null)
    try {
      const result = await resetEditableSettings()
      hydrateDraft(result.settings)
      setStatus('saved')
      setMessage(getMutationFeedback('已恢复为当前已保存设置。', result))
    } catch (cause) {
      setStatus('error')
      setMessage(toErrorMessage(cause))
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
    setMessage(errorMessage)
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
        <form
          className="settings-form-shell"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
        >
          {runtimeReadinessWarnings.length > 0 ? (
            <div className="console-warning" role="status">
              <AlertTriangle className="h-4 w-4" />
              <span>当前语音任务还不能运行，请补齐：{runtimeReadinessWarnings.join('、')}。</span>
            </div>
          ) : null}

          <Tabs
            className="settings-tabs-shell"
            onValueChange={(value) => setActiveTab(value as SettingsTabValue)}
            value={activeTab}
          >
            <div className="settings-tabs-bar">
              <TabsList className="settings-tabs-list">
                <TabsTrigger onClick={() => setActiveTab('general')} value="general">通用</TabsTrigger>
                <TabsTrigger onClick={() => setActiveTab('hotkey')} value="hotkey">快捷键</TabsTrigger>
                <TabsTrigger onClick={() => setActiveTab('asr')} value="asr">ASR</TabsTrigger>
                <TabsTrigger onClick={() => setActiveTab('model')} value="model">模型</TabsTrigger>
                <TabsTrigger onClick={() => setActiveTab('mcp')} value="mcp">MCP</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent className="settings-tab-panel" value="general">
              <section className="settings-pane">
                <div className="settings-pane-header">
                  <h3>通用</h3>
                </div>

                <div className="settings-toggle-row">
                  <div>
                    <strong>保存历史记录</strong>
                  </div>
                  <Switch
                    aria-label="保存历史记录"
                    checked={draft.history_enabled}
                    disabled={isBusy}
                    onCheckedChange={(checked) => updateDraft('history_enabled', checked)}
                  />
                </div>

                <div className="settings-toggle-row">
                  <div>
                    <strong>开机自启动</strong>
                  </div>
                  <Switch
                    aria-label="开机自启动"
                    checked={draft.auto_launch_enabled}
                    disabled={isBusy}
                    onCheckedChange={(checked) => updateDraft('auto_launch_enabled', checked)}
                  />
                </div>
              </section>
            </TabsContent>

            <TabsContent className="settings-tab-panel" value="hotkey">
              <section className="settings-pane">
                <div className="settings-pane-header">
                  <h3>快捷键</h3>
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">默认热键</label>
                  <DefaultHotkeyRecorder
                    inputAriaInvalid={Boolean(validationErrors.default_hotkey)}
                    inputClassName={inputClassName('default_hotkey')}
                    value={draft.default_hotkey}
                    onChange={(value) => updateDraft('default_hotkey', value)}
                  />
                  {renderFieldError('default_hotkey')}
                </div>
              </section>
            </TabsContent>

            <TabsContent className="settings-tab-panel" value="asr">
              <section className="settings-pane">
                <div className="settings-pane-header">
                  <h3>豆包 ASR</h3>
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">豆包 WebSocket URL</label>
                  <Input
                    aria-invalid={Boolean(validationErrors.doubao_asr_url)}
                    aria-label="豆包 WebSocket URL"
                    className={inputClassName('doubao_asr_url')}
                    value={draft.doubao_asr_url}
                    onChange={(event) => updateDraft('doubao_asr_url', event.target.value)}
                  />
                  {renderFieldError('doubao_asr_url')}
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">豆包 App ID</label>
                  <Input
                    aria-label="豆包 App ID"
                    value={draft.doubao_asr_app_id}
                    onChange={(event) => updateDraft('doubao_asr_app_id', event.target.value)}
                  />
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">默认麦克风</label>
                  <div className="settings-inline-control">
                    <select
                      aria-label="默认麦克风"
                      className="settings-native-select"
                      value={draft.microphone_device_id}
                      onChange={(event) => updateDraft('microphone_device_id', event.target.value)}
                    >
                      {isSavedMicrophoneUnavailable ? (
                        <option value={draft.microphone_device_id}>已保存设备不可用</option>
                      ) : null}
                      <option value="">系统默认麦克风</option>
                      {microphoneInputs.map((device) => (
                        <option key={device.id} value={device.id}>
                          {getMicrophoneOptionLabel(device)}
                        </option>
                      ))}
                    </select>
                    <Button
                      aria-label="刷新设备列表"
                      disabled={isBusy || microphoneStatus === 'loading'}
                      onClick={() => void handleRefreshMicrophoneInputs()}
                      type="button"
                      variant="outline"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  {microphoneStatus === 'error' && microphoneMessage ? <p className="runtime-error">{microphoneMessage}</p> : null}
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">豆包 Access Token</label>
                  <div className="settings-inline-control">
                    <Input
                      aria-label="豆包 Access Token"
                      className="flex-1"
                      placeholder={draft.has_doubao_asr_access_token ? '已保存，留空则保持不变' : '当前未设置'}
                      type="password"
                      value={doubaoSecret.action === 'replace' ? doubaoSecret.value : ''}
                      onChange={(event) =>
                        updateSecret(event.target.value, draft.has_doubao_asr_access_token, setDoubaoSecret)
                      }
                    />
                    <Button type="button" variant="outline" onClick={() => updateSecretDraft(setDoubaoSecret, createUnchangedSecretDraft())}>
                      保持当前密钥
                    </Button>
                    <Button type="button" variant="outline" onClick={() => updateSecretDraft(setDoubaoSecret, { action: 'clear', value: '' })}>
                      清空密钥
                    </Button>
                  </div>
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">豆包 Resource ID</label>
                  <Input
                    aria-invalid={Boolean(validationErrors.doubao_asr_resource_id)}
                    aria-label="豆包 Resource ID"
                    className={inputClassName('doubao_asr_resource_id')}
                    value={draft.doubao_asr_resource_id}
                    onChange={(event) => updateDraft('doubao_asr_resource_id', event.target.value)}
                  />
                  {renderFieldError('doubao_asr_resource_id')}
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">豆包模型</label>
                  <Input
                    aria-invalid={Boolean(validationErrors.doubao_asr_model)}
                    aria-label="豆包模型"
                    className={inputClassName('doubao_asr_model')}
                    value={draft.doubao_asr_model}
                    onChange={(event) => updateDraft('doubao_asr_model', event.target.value)}
                  />
                  {renderFieldError('doubao_asr_model')}
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">转录静音自动结束（ms）</label>
                  <Input
                    aria-invalid={Boolean(validationErrors.transcription_silence_timeout_ms)}
                    aria-label="转录静音自动结束（ms）"
                    className={inputClassName('transcription_silence_timeout_ms')}
                    max={5000}
                    min={0}
                    step={100}
                    type="number"
                    value={draft.transcription_silence_timeout_ms}
                    onChange={(event) => updateDraft('transcription_silence_timeout_ms', Number(event.target.value) || 0)}
                  />
                  {renderFieldError('transcription_silence_timeout_ms')}
                </div>
              </section>
            </TabsContent>

            <TabsContent className="settings-tab-panel" value="model">
              <section className="settings-pane">
                <div className="settings-pane-header">
                  <h3>OpenAI-compatible LLM</h3>
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">LLM 服务地址</label>
                  <Input
                    aria-invalid={Boolean(validationErrors.llm_base_url)}
                    aria-label="LLM 服务地址"
                    className={inputClassName('llm_base_url')}
                    value={draft.llm_base_url}
                    onChange={(event) => updateDraft('llm_base_url', event.target.value)}
                  />
                  {renderFieldError('llm_base_url')}
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">LLM API Key</label>
                  <div className="settings-inline-control">
                    <Input
                      aria-label="LLM API Key"
                      className="flex-1"
                      placeholder={draft.has_llm_api_key ? '已保存，留空则保持不变' : '当前未设置'}
                      type="password"
                      value={llmSecret.action === 'replace' ? llmSecret.value : ''}
                      onChange={(event) => updateSecret(event.target.value, draft.has_llm_api_key, setLlmSecret)}
                    />
                    <Button type="button" variant="outline" onClick={() => updateSecretDraft(setLlmSecret, createUnchangedSecretDraft())}>
                      保持当前密钥
                    </Button>
                    <Button type="button" variant="outline" onClick={() => updateSecretDraft(setLlmSecret, { action: 'clear', value: '' })}>
                      清空密钥
                    </Button>
                  </div>
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">LLM 模型</label>
                  <Input
                    aria-invalid={Boolean(validationErrors.llm_model)}
                    aria-label="LLM 模型"
                    className={inputClassName('llm_model')}
                    value={draft.llm_model}
                    onChange={(event) => updateDraft('llm_model', event.target.value)}
                  />
                  {renderFieldError('llm_model')}
                </div>

                <div className="settings-field-block">
                  <label className="settings-field-title">系统提示词</label>
                  <Textarea
                    aria-label="系统提示词"
                    rows={6}
                    value={draft.llm_system_prompt}
                    onChange={(event) => updateDraft('llm_system_prompt', event.target.value)}
                  />
                </div>
              </section>
            </TabsContent>

            <TabsContent className="settings-tab-panel" value="mcp">
              <section className="settings-pane">
                <div className="settings-pane-header">
                  <h3>MCP</h3>
                </div>

                <div className="settings-toggle-row">
                  <div>
                    <strong>启用 AngryMiao 系统控制</strong>
                  </div>
                  <Switch
                    aria-label="启用 AngryMiao 系统控制"
                    checked={draft.angrymiao_skill_enabled}
                    disabled={isBusy}
                    onCheckedChange={(checked) => updateDraft('angrymiao_skill_enabled', checked)}
                  />
                </div>

                <SkillBundleInventory />

                <KeyboardShortcutSettings
                  keyboardDriverPath={draft.keyboard_driver_path}
                  keyboardShortcuts={draft.keyboard_shortcuts}
                  onKeyboardDriverPathChange={(value) => updateDraft('keyboard_driver_path', value)}
                  onKeyboardShortcutsChange={(value) => updateDraft('keyboard_shortcuts', value)}
                />
                {renderFieldError('keyboard_shortcuts')}

                <div className="settings-field-block">
                  <label className="settings-field-title">MCP 服务 JSON</label>
                  <Textarea
                    aria-invalid={Boolean(validationErrors.mcp_servers_json)}
                    aria-label="MCP 服务 JSON"
                    className={inputClassName('mcp_servers_json')}
                    rows={8}
                    value={draft.mcp_servers_json}
                    onChange={(event) => updateDraft('mcp_servers_json', event.target.value)}
                  />
                  {renderFieldError('mcp_servers_json')}
                </div>
              </section>
            </TabsContent>
          </Tabs>

          <div className="settings-sticky-footer">
            <div className="settings-sticky-message">
              {message ? (
                <span className={status === 'error' ? 'text-destructive' : 'text-emerald-600'}>{message}</span>
              ) : hasBlockingErrors ? (
                <span className="text-destructive">请先修正设置项后再保存。</span>
              ) : runtimeReadinessWarnings.length > 0 ? (
                <span className="text-amber-700">仍缺少运行前置条件：{runtimeReadinessWarnings.join('、')}。</span>
              ) : (
                <span>设置修改会在保存后立即写入本地配置。</span>
              )}
            </div>

            <div className="settings-sticky-actions">
              <Button className="gap-1" disabled={isBusy} onClick={() => void handleReset()} type="button" variant="outline">
                <RotateCcw className="h-4 w-4" />
                重置
              </Button>
              <Button className="gap-1" disabled={isBusy || hasBlockingErrors} type="submit">
                <Save className="h-4 w-4" />
                保存设置
              </Button>
            </div>
          </div>
        </form>
      )}
    </section>
  )
}
