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
    if (!draft) {
      return
    }

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
      // 保持用户当前草稿，至少不要吞掉原始错误。
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
    return validationErrors[field] ? 'settings-input-invalid' : undefined
  }

  function renderFieldError(field: SettingsFieldKey) {
    const error = validationErrors[field]

    if (!error) {
      return null
    }

    return <p className="settings-field-error">{error}</p>
  }

  function getMicrophoneOptionLabel(device: MicrophoneInputDevice) {
    return device.is_default ? `${device.label}（当前系统默认）` : device.label
  }

  return (
    <section className="panel settings-panel">
      <h2 className="sr-only">设置</h2>

      {!draft ? (
        <p>正在加载设置...</p>
      ) : (
        <>
          {runtimeReadinessWarnings.length > 0 ? (
            <p className="settings-warning" role="status">
              当前语音任务还不能运行，请补齐：{runtimeReadinessWarnings.join('、')}。
            </p>
          ) : null}

          <form
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <div className="settings-sections">
              <fieldset className="settings-section" disabled={isBusy}>
                <legend>通用</legend>
                <p className="settings-hint">当前配置写入 `settings.json`，这里不再依赖 `.env`。</p>
                <label className="settings-checkbox">
                  <input
                    checked={draft.history_enabled}
                    type="checkbox"
                    onChange={(event) => updateDraft('history_enabled', event.target.checked)}
                  />
                  <span>保存历史记录</span>
                </label>
                <label className="settings-checkbox">
                  <input
                    checked={draft.auto_launch_enabled}
                    type="checkbox"
                    onChange={(event) => updateDraft('auto_launch_enabled', event.target.checked)}
                  />
                  <span>开机自启动</span>
                </label>
              </fieldset>

              <fieldset className="settings-section" disabled={isBusy}>
                <legend>快捷键</legend>
                <label className="settings-field">
                  <span>默认热键</span>
                  <DefaultHotkeyRecorder
                    inputAriaInvalid={Boolean(validationErrors.default_hotkey)}
                    inputClassName={inputClassName('default_hotkey')}
                    value={draft.default_hotkey}
                    onChange={(value) => updateDraft('default_hotkey', value)}
                  />
                  {renderFieldError('default_hotkey')}
                </label>
                <p className="settings-hint">
                  默认热键会按 `RightAlt` 或 `LeftCtrl+K` 这样的格式保存，并精确区分左右修饰键。
                </p>
              </fieldset>

              <fieldset className="settings-section" disabled={isBusy}>
                <legend>豆包 ASR</legend>
                <label className="settings-field">
                  <span>豆包 WebSocket URL</span>
                  <input
                    aria-invalid={Boolean(validationErrors.doubao_asr_url)}
                    className={inputClassName('doubao_asr_url')}
                    value={draft.doubao_asr_url}
                    onChange={(event) => updateDraft('doubao_asr_url', event.target.value)}
                  />
                  {renderFieldError('doubao_asr_url')}
                </label>
                <label className="settings-field">
                  <span>豆包 App ID</span>
                  <input
                    value={draft.doubao_asr_app_id}
                    onChange={(event) => updateDraft('doubao_asr_app_id', event.target.value)}
                  />
                </label>
                <label className="settings-field settings-field-wide">
                  <span>默认麦克风</span>
                  <div className="settings-inline-form">
                    <select
                      aria-label="默认麦克风"
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
                    <button
                      type="button"
                      onClick={() => {
                        void handleRefreshMicrophoneInputs()
                      }}
                      disabled={isBusy || microphoneStatus === 'loading'}
                    >
                      刷新设备列表
                    </button>
                  </div>
                  {microphoneStatus === 'loading' ? (
                    <p className="settings-hint">正在读取当前系统麦克风列表。</p>
                  ) : null}
                  {microphoneStatus === 'error' && microphoneMessage ? (
                    <p className="settings-field-error">{microphoneMessage}</p>
                  ) : null}
                  {microphoneStatus === 'idle' && microphoneInputs.length === 0 ? (
                    <p className="settings-hint">当前未检测到可用输入设备，留空时会继续跟随系统默认麦克风。</p>
                  ) : null}
                  {isSavedMicrophoneUnavailable ? (
                    <p className="settings-hint">当前已保存的麦克风不可用，新的语音任务会自动回退到系统默认麦克风。</p>
                  ) : null}
                </label>
                <div className="settings-secret">
                  <label className="settings-field">
                    <span>豆包 Access Token</span>
                    <input
                      type="password"
                      value={doubaoSecret.action === 'replace' ? doubaoSecret.value : ''}
                      placeholder={draft.has_doubao_asr_access_token ? '已保存，留空则保持不变' : '当前未设置'}
                      onChange={(event) =>
                        updateSecret(event.target.value, draft.has_doubao_asr_access_token, setDoubaoSecret)
                      }
                    />
                  </label>
                  <div className="settings-inline-actions">
                    <button
                      type="button"
                      onClick={() => updateSecretDraft(setDoubaoSecret, createUnchangedSecretDraft())}
                    >
                      保持当前
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSecretDraft(setDoubaoSecret, {
                          action: 'clear',
                          value: '',
                        })
                      }
                    >
                      清空密钥
                    </button>
                  </div>
                  <p className="settings-hint">
                    {getSecretHint(draft.has_doubao_asr_access_token, doubaoSecret, '豆包 Access Token')}
                  </p>
                </div>
                <label className="settings-field">
                  <span>豆包 Resource ID</span>
                  <input
                    aria-invalid={Boolean(validationErrors.doubao_asr_resource_id)}
                    className={inputClassName('doubao_asr_resource_id')}
                    value={draft.doubao_asr_resource_id}
                    onChange={(event) => updateDraft('doubao_asr_resource_id', event.target.value)}
                  />
                  {renderFieldError('doubao_asr_resource_id')}
                </label>
                <label className="settings-field">
                  <span>豆包模型</span>
                  <input
                    aria-invalid={Boolean(validationErrors.doubao_asr_model)}
                    className={inputClassName('doubao_asr_model')}
                    value={draft.doubao_asr_model}
                    onChange={(event) => updateDraft('doubao_asr_model', event.target.value)}
                  />
                  {renderFieldError('doubao_asr_model')}
                </label>
              </fieldset>

              <fieldset className="settings-section" disabled={isBusy}>
                <legend>高级参数</legend>
                <p className="settings-hint">
                  音频格式、采样率、位深、声道、语言、ITN、DDC、标点、分句、结束窗口与上下文参数
                  已固定为代码默认值，不再开放编辑。
                </p>
                <label className="settings-field">
                  <span>转录静音自动结束（ms）</span>
                  <input
                    aria-invalid={Boolean(validationErrors.transcription_silence_timeout_ms)}
                    aria-label="转录静音自动结束（ms）"
                    className={inputClassName('transcription_silence_timeout_ms')}
                    min={0}
                    max={5000}
                    step={100}
                    type="number"
                    value={draft.transcription_silence_timeout_ms}
                    onChange={(event) =>
                      updateDraft('transcription_silence_timeout_ms', Number(event.target.value) || 0)
                    }
                  />
                  {renderFieldError('transcription_silence_timeout_ms')}
                  <p className="settings-hint">转录模式中，持续静音超过该时长后会自动停止并提交。</p>
                </label>
              </fieldset>

              <fieldset className="settings-section" disabled={isBusy}>
                <legend>OpenAI-compatible LLM</legend>
                <label className="settings-field">
                  <span>LLM 服务地址</span>
                  <input
                    aria-invalid={Boolean(validationErrors.llm_base_url)}
                    className={inputClassName('llm_base_url')}
                    value={draft.llm_base_url}
                    onChange={(event) => updateDraft('llm_base_url', event.target.value)}
                  />
                  {renderFieldError('llm_base_url')}
                </label>
                <div className="settings-secret">
                  <label className="settings-field">
                    <span>LLM API Key</span>
                    <input
                      type="password"
                      value={llmSecret.action === 'replace' ? llmSecret.value : ''}
                      placeholder={draft.has_llm_api_key ? '已保存，留空则保持不变' : '当前未设置'}
                      onChange={(event) => updateSecret(event.target.value, draft.has_llm_api_key, setLlmSecret)}
                    />
                  </label>
                  <div className="settings-inline-actions">
                    <button type="button" onClick={() => updateSecretDraft(setLlmSecret, createUnchangedSecretDraft())}>
                      保持当前
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSecretDraft(setLlmSecret, {
                          action: 'clear',
                          value: '',
                        })
                      }
                    >
                      清空密钥
                    </button>
                  </div>
                  <p className="settings-hint">{getSecretHint(draft.has_llm_api_key, llmSecret, 'LLM API Key')}</p>
                </div>
                <label className="settings-field">
                  <span>LLM 模型</span>
                  <input
                    aria-invalid={Boolean(validationErrors.llm_model)}
                    className={inputClassName('llm_model')}
                    value={draft.llm_model}
                    onChange={(event) => updateDraft('llm_model', event.target.value)}
                  />
                  {renderFieldError('llm_model')}
                </label>
                <label className="settings-field settings-field-wide">
                  <span>系统提示词</span>
                  <textarea
                    rows={4}
                    value={draft.llm_system_prompt}
                    onChange={(event) => updateDraft('llm_system_prompt', event.target.value)}
                  />
                </label>
              </fieldset>

              <fieldset className="settings-section" disabled={isBusy}>
                <legend>MCP</legend>
                <div className="settings-checkbox-grid">
                  <label className="settings-checkbox">
                    <input
                      checked={draft.angrymiao_skill_enabled}
                      type="checkbox"
                      onChange={(event) => updateDraft('angrymiao_skill_enabled', event.target.checked)}
                    />
                    <span>启用 AngryMiao 系统控制</span>
                  </label>
                </div>
                <SkillBundleInventory />
                <KeyboardShortcutSettings
                  keyboardDriverPath={draft.keyboard_driver_path}
                  keyboardShortcuts={draft.keyboard_shortcuts}
                  onKeyboardDriverPathChange={(value) => updateDraft('keyboard_driver_path', value)}
                  onKeyboardShortcutsChange={(value) => updateDraft('keyboard_shortcuts', value)}
                />
                {renderFieldError('keyboard_shortcuts')}
                <p className="settings-hint">自定义 MCP 服务 JSON 会与内置 AngryMiao runtime 一起参与 MCP 同步。</p>
                <label className="settings-field settings-field-wide">
                  <span>MCP 服务 JSON</span>
                  <textarea
                    aria-invalid={Boolean(validationErrors.mcp_servers_json)}
                    className={inputClassName('mcp_servers_json')}
                    rows={8}
                    value={draft.mcp_servers_json}
                    onChange={(event) => updateDraft('mcp_servers_json', event.target.value)}
                  />
                  {renderFieldError('mcp_servers_json')}
                </label>
              </fieldset>
            </div>

            <div className="settings-actions">
              <button disabled={isBusy || hasBlockingErrors} type="submit">
                保存设置
              </button>
              <button type="button" onClick={() => void handleReset()}>
                重置为已保存
              </button>
            </div>
          </form>
        </>
      )}

      {message ? (
        <p
          className={status === 'error' ? 'runtime-error' : 'settings-feedback'}
          role={status === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
    </section>
  )
}
