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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  Settings, 
  Save, 
  RotateCcw, 
  Mic, 
  Key, 
  Zap,
  Server,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RefreshCw
} from 'lucide-react'

type PanelStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'error'
type MicrophoneStatus = 'idle' | 'loading' | 'error'

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" />
            设置
          </h2>
          <p className="text-muted-foreground mt-1">配置语音识别和 AI 服务</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void handleReset()} disabled={isBusy} className="gap-1">
            <RotateCcw className="w-4 h-4" />
            重置
          </Button>
          <Button onClick={() => void handleSave()} disabled={isBusy || hasBlockingErrors} className="gap-1">
            <Save className="w-4 h-4" />
            保存设置
          </Button>
        </div>
      </div>

      {!draft ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-muted-foreground">正在加载设置...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {runtimeReadinessWarnings.length > 0 && (
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">当前语音任务还不能运行</p>
                <p className="text-sm mt-1">请补齐以下配置: {runtimeReadinessWarnings.join('、')}</p>
              </div>
            </div>
          )}

          <form onSubmit={(event) => { event.preventDefault(); void handleSave() }}>
            <div className="space-y-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    通用设置
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">当前配置写入 settings.json，不再依赖 .env</p>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                    <div>
                      <p className="font-medium">保存历史记录</p>
                      <p className="text-xs text-muted-foreground">启用后自动保存语音识别历史</p>
                    </div>
                    <Switch checked={draft.history_enabled} onCheckedChange={(checked) => updateDraft('history_enabled', checked)} disabled={isBusy} />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                    <div>
                      <p className="font-medium">开机自启动</p>
                      <p className="text-xs text-muted-foreground">系统启动时自动运行应用</p>
                    </div>
                    <Switch checked={draft.auto_launch_enabled} onCheckedChange={(checked) => updateDraft('auto_launch_enabled', checked)} disabled={isBusy} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Key className="w-5 h-5 text-primary" />
                    快捷键
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">默认热键</label>
                    <DefaultHotkeyRecorder
                      inputAriaInvalid={Boolean(validationErrors.default_hotkey)}
                      inputClassName={inputClassName('default_hotkey')}
                      value={draft.default_hotkey}
                      onChange={(value) => updateDraft('default_hotkey', value)}
                    />
                    {renderFieldError('default_hotkey')}
                    <p className="text-xs text-muted-foreground">按 RightAlt 或 LeftCtrl+K 格式保存，精确区分左右修饰键</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Mic className="w-5 h-5 text-primary" />
                    豆包 ASR
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">豆包 WebSocket URL</label>
                    <Input aria-invalid={Boolean(validationErrors.doubao_asr_url)} className={inputClassName('doubao_asr_url')} value={draft.doubao_asr_url} onChange={(event) => updateDraft('doubao_asr_url', event.target.value)} />
                    {renderFieldError('doubao_asr_url')}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">豆包 App ID</label>
                    <Input value={draft.doubao_asr_app_id} onChange={(event) => updateDraft('doubao_asr_app_id', event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">默认麦克风</label>
                    <div className="flex gap-2">
                      <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" aria-label="默认麦克风" value={draft.microphone_device_id} onChange={(event) => updateDraft('microphone_device_id', event.target.value)}>
                        {isSavedMicrophoneUnavailable ? <option value={draft.microphone_device_id}>已保存设备不可用</option> : null}
                        <option value="">系统默认麦克风</option>
                        {microphoneInputs.map((device) => <option key={device.id} value={device.id}>{getMicrophoneOptionLabel(device)}</option>)}
                      </select>
                      <Button type="button" variant="outline" onClick={() => void handleRefreshMicrophoneInputs()} disabled={isBusy || microphoneStatus === 'loading'}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                    {microphoneStatus === 'loading' && <p className="text-xs text-muted-foreground mt-1">正在读取当前系统麦克风列表。</p>}
                    {microphoneStatus === 'error' && microphoneMessage && <p className="text-sm text-destructive mt-1">{microphoneMessage}</p>}
                    {microphoneStatus === 'idle' && microphoneInputs.length === 0 && <p className="text-xs text-muted-foreground mt-1">当前未检测到可用输入设备，留空时会继续跟随系统默认麦克风。</p>}
                    {isSavedMicrophoneUnavailable && <p className="text-xs text-muted-foreground mt-1">当前已保存的麦克风不可用，新的语音任务会自动回退到系统默认麦克风。</p>}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">豆包 Access Token</label>
                    <div className="flex gap-2">
                      <Input type="password" className="flex-1" value={doubaoSecret.action === 'replace' ? doubaoSecret.value : ''} placeholder={draft.has_doubao_asr_access_token ? '已保存，留空则保持不变' : '当前未设置'} onChange={(event) => updateSecret(event.target.value, draft.has_doubao_asr_access_token, setDoubaoSecret)} />
                      <Button type="button" variant="outline" onClick={() => updateSecretDraft(setDoubaoSecret, createUnchangedSecretDraft())}>保持当前</Button>
                      <Button type="button" variant="outline" onClick={() => updateSecretDraft(setDoubaoSecret, { action: 'clear', value: '' })}>清空</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{getSecretHint(draft.has_doubao_asr_access_token, doubaoSecret, '豆包 Access Token')}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">豆包 Resource ID</label>
                    <Input aria-invalid={Boolean(validationErrors.doubao_asr_resource_id)} className={inputClassName('doubao_asr_resource_id')} value={draft.doubao_asr_resource_id} onChange={(event) => updateDraft('doubao_asr_resource_id', event.target.value)} />
                    {renderFieldError('doubao_asr_resource_id')}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">豆包模型</label>
                    <Input aria-invalid={Boolean(validationErrors.doubao_asr_model)} className={inputClassName('doubao_asr_model')} value={draft.doubao_asr_model} onChange={(event) => updateDraft('doubao_asr_model', event.target.value)} />
                    {renderFieldError('doubao_asr_model')}
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    高级参数
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">音频格式、采样率、位深、声道、语言、ITN、DDC、标点、分句、结束窗口与上下文参数已固定为代码默认值，不再开放编辑。</p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">转录静音自动结束（ms）</label>
                    <Input type="number" min={0} max={5000} step={100} aria-invalid={Boolean(validationErrors.transcription_silence_timeout_ms)} className={inputClassName('transcription_silence_timeout_ms')} value={draft.transcription_silence_timeout_ms} onChange={(event) => updateDraft('transcription_silence_timeout_ms', Number(event.target.value) || 0)} />
                    {renderFieldError('transcription_silence_timeout_ms')}
                    <p className="text-xs text-muted-foreground">转录模式中，持续静音超过该时长后会自动停止并提交。</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    OpenAI-compatible LLM
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">LLM 服务地址</label>
                    <Input aria-invalid={Boolean(validationErrors.llm_base_url)} className={inputClassName('llm_base_url')} value={draft.llm_base_url} onChange={(event) => updateDraft('llm_base_url', event.target.value)} />
                    {renderFieldError('llm_base_url')}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">LLM API Key</label>
                    <div className="flex gap-2">
                      <Input type="password" className="flex-1" value={llmSecret.action === 'replace' ? llmSecret.value : ''} placeholder={draft.has_llm_api_key ? '已保存，留空则保持不变' : '当前未设置'} onChange={(event) => updateSecret(event.target.value, draft.has_llm_api_key, setLlmSecret)} />
                      <Button type="button" variant="outline" onClick={() => updateSecretDraft(setLlmSecret, createUnchangedSecretDraft())}>保持当前</Button>
                      <Button type="button" variant="outline" onClick={() => updateSecretDraft(setLlmSecret, { action: 'clear', value: '' })}>清空</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{getSecretHint(draft.has_llm_api_key, llmSecret, 'LLM API Key')}</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">LLM 模型</label>
                    <Input aria-invalid={Boolean(validationErrors.llm_model)} className={inputClassName('llm_model')} value={draft.llm_model} onChange={(event) => updateDraft('llm_model', event.target.value)} />
                    {renderFieldError('llm_model')}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">系统提示词</label>
                    <Textarea rows={4} value={draft.llm_system_prompt} onChange={(event) => updateDraft('llm_system_prompt', event.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    MCP
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/20">
                    <div>
                      <p className="font-medium">启用 AngryMiao 系统控制</p>
                      <p className="text-xs text-muted-foreground">启用后可以使用系统控制功能</p>
                    </div>
                    <Switch checked={draft.angrymiao_skill_enabled} onCheckedChange={(checked) => updateDraft('angrymiao_skill_enabled', checked)} disabled={isBusy} />
                  </div>
                  <SkillBundleInventory />
                  <KeyboardShortcutSettings
                    keyboardDriverPath={draft.keyboard_driver_path}
                    keyboardShortcuts={draft.keyboard_shortcuts}
                    onKeyboardDriverPathChange={(value) => updateDraft('keyboard_driver_path', value)}
                    onKeyboardShortcutsChange={(value) => updateDraft('keyboard_shortcuts', value)}
                  />
                  {renderFieldError('keyboard_shortcuts')}
                  <p className="text-xs text-muted-foreground">自定义 MCP 服务 JSON 会与内置 AngryMiao runtime 一起参与 MCP 同步。</p>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">MCP 服务 JSON</label>
                    <Textarea aria-invalid={Boolean(validationErrors.mcp_servers_json)} className={inputClassName('mcp_servers_json')} rows={8} value={draft.mcp_servers_json} onChange={(event) => updateDraft('mcp_servers_json', event.target.value)} />
                    {renderFieldError('mcp_servers_json')}
                  </div>
                </CardContent>
              </Card>
            </div>
          </form>
        </>
      )}

      {message && (
        <div className={`p-4 rounded-lg text-sm ${status === 'error' ? 'bg-destructive/10 border border-destructive/30 text-destructive' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-500'}`}>
          {message}
        </div>
      )}
    </div>
  )
}
