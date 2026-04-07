import { useEffect, useMemo, useState } from 'react'
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
type SettingsSectionId = 'general' | 'hotkeys' | 'voice' | 'models' | 'mcp'

const settingsSectionErrorFields: Record<SettingsSectionId, SettingsFieldKey[]> = {
  general: [],
  hotkeys: ['default_hotkey'],
  voice: [
    'doubao_asr_url',
    'doubao_asr_resource_id',
    'doubao_asr_model',
    'doubao_asr_audio_format',
    'doubao_asr_audio_rate',
    'doubao_asr_audio_bits',
    'doubao_asr_audio_channel',
    'doubao_asr_audio_language',
    'doubao_asr_context_json',
  ],
  models: ['llm_base_url', 'llm_model'],
  mcp: ['keyboard_shortcuts', 'mcp_servers_json'],
}

const settingsSections: Array<{
  id: SettingsSectionId
  label: string
  eyebrow: string
  description: string
}> = [
  {
    id: 'general',
    label: '通用',
    eyebrow: 'General',
    description: '管理历史记录、开机自启动以及当前配置真源说明。',
  },
  {
    id: 'hotkeys',
    label: '快捷键',
    eyebrow: 'Hotkeys',
    description: '配置长按录音的默认热键，保证全局触发链路稳定。',
  },
  {
    id: 'voice',
    label: '语音',
    eyebrow: 'Voice',
    description: '只保留豆包 ASR 的接入参数和音频高级配置。',
  },
  {
    id: 'models',
    label: '模型',
    eyebrow: 'Models',
    description: '配置 OpenAI-compatible LLM 的服务地址、模型与系统提示词。',
  },
  {
    id: 'mcp',
    label: 'MCP',
    eyebrow: 'MCP',
    description: '维护 stdio MCP server 列表，并与内置 AngryMiao runtime 共同参与 MCP 同步。',
  },
]

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
    doubao_asr_audio_format: draft.doubao_asr_audio_format,
    doubao_asr_audio_rate: draft.doubao_asr_audio_rate,
    doubao_asr_audio_bits: draft.doubao_asr_audio_bits,
    doubao_asr_audio_channel: draft.doubao_asr_audio_channel,
    doubao_asr_audio_language: draft.doubao_asr_audio_language,
    doubao_asr_enable_itn: draft.doubao_asr_enable_itn,
    doubao_asr_enable_ddc: draft.doubao_asr_enable_ddc,
    doubao_asr_enable_punc: draft.doubao_asr_enable_punc,
    doubao_asr_show_utterances: draft.doubao_asr_show_utterances,
    doubao_asr_force_to_speech_time: draft.doubao_asr_force_to_speech_time,
    doubao_asr_end_window_size: draft.doubao_asr_end_window_size,
    doubao_asr_boosting_table_id: draft.doubao_asr_boosting_table_id,
    doubao_asr_context_json: draft.doubao_asr_context_json,
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

function getSecretHint(
  hasSecret: boolean,
  secret: SecretDraftState,
  providerName: string,
) {
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
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('general')
  const [doubaoSecret, setDoubaoSecret] = useState<SecretDraftState>(
    createUnchangedSecretDraft(),
  )
  const [llmSecret, setLlmSecret] = useState<SecretDraftState>(
    createUnchangedSecretDraft(),
  )

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

  function updateDraft<Key extends keyof EditableVoiceSettings>(
    key: Key,
    value: EditableVoiceSettings[Key],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setStatus('idle')
    setMessage(null)
  }

  function updateSecretDraft(
    setter: (next: SecretDraftState) => void,
    next: SecretDraftState,
  ) {
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
      const nextSectionWithErrors = settingsSections.find((section) =>
        settingsSectionErrorFields[section.id].some((field) => Boolean(validationErrors[field])),
      )
      if (nextSectionWithErrors) {
        setActiveSection(nextSectionWithErrors.id)
      }
      setStatus('error')
      setMessage('请先修正设置项后再保存。')
      return
    }

    setStatus('saving')
    setMessage(null)

    try {
      const result = await saveEditableSettings(
        toSaveInput(draft, doubaoSecret, llmSecret),
      )
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

  function updateSecret(
    value: string,
    hasSecret: boolean,
    setter: (next: SecretDraftState) => void,
  ) {
    if (!value) {
      updateSecretDraft(
        setter,
        hasSecret ? createUnchangedSecretDraft() : { action: 'replace', value: '' },
      )
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
  const validationErrors = draft
    ? validateSettingsDraft(draft, doubaoSecret, llmSecret)
    : {}
  const hasBlockingErrors = Object.keys(validationErrors).length > 0
  const runtimeReadinessWarnings = draft
    ? getRuntimeReadinessWarnings(draft, doubaoSecret, llmSecret)
    : []
  const currentSection = useMemo(
    () => settingsSections.find((section) => section.id === activeSection) ?? settingsSections[0],
    [activeSection],
  )
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

  function sectionHasErrors(sectionId: SettingsSectionId) {
    return settingsSectionErrorFields[sectionId].some((field) => Boolean(validationErrors[field]))
  }

  function getMicrophoneOptionLabel(device: MicrophoneInputDevice) {
    return device.is_default ? `${device.label}（当前系统默认）` : device.label
  }

  return (
    <section className="panel">
      <div className="settings-header">
        <div>
          <h2>设置</h2>
          <p className="settings-copy">`settings.json` 是当前唯一配置真源。</p>
        </div>
        <span className="settings-status">
          {status === 'loading'
            ? '正在加载'
            : status === 'saving'
              ? '正在保存'
              : '可编辑'}
        </span>
      </div>

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
            <div className="settings-shell">
              <div className="settings-nav" aria-label="设置分区">
                {settingsSections.map((section) => (
                  <button
                    key={section.id}
                    aria-label={section.label}
                    aria-pressed={section.id === activeSection}
                    className="settings-nav-item"
                    data-active={section.id === activeSection ? 'true' : 'false'}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                  >
                    <span>{section.label}</span>
                    <small>{section.eyebrow}</small>
                    <strong>{section.description}</strong>
                    {sectionHasErrors(section.id) ? <em>需修正</em> : null}
                  </button>
                ))}
              </div>

              <div className="settings-stage">
                <div className="settings-stage-hero">
                  <span>{currentSection.eyebrow}</span>
                  <strong>{currentSection.label}</strong>
                  <p>{currentSection.description}</p>
                </div>

                {activeSection === 'general' ? (
                  <fieldset className="settings-section" disabled={isBusy}>
                    <legend>通用</legend>
                    <p className="settings-hint">
                      当前配置写入 `settings.json`，这里不再依赖 `.env`。
                    </p>
                    <label className="settings-checkbox">
                      <input
                        checked={draft.history_enabled}
                        type="checkbox"
                        onChange={(event) =>
                          updateDraft('history_enabled', event.target.checked)
                        }
                      />
                      <span>保存历史记录</span>
                    </label>
                    <label className="settings-checkbox">
                      <input
                        checked={draft.auto_launch_enabled}
                        type="checkbox"
                        onChange={(event) =>
                          updateDraft('auto_launch_enabled', event.target.checked)
                        }
                      />
                      <span>开机自启动</span>
                    </label>
                  </fieldset>
                ) : null}

                {activeSection === 'hotkeys' ? (
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
                ) : null}

                {activeSection === 'voice' ? (
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
                  onChange={(event) =>
                    updateDraft('microphone_device_id', event.target.value)
                  }
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
                <p className="settings-hint">
                  当前未检测到可用输入设备，留空时会继续跟随系统默认麦克风。
                </p>
              ) : null}
              {isSavedMicrophoneUnavailable ? (
                <p className="settings-hint">
                  当前已保存的麦克风不可用，新的语音任务会自动回退到系统默认麦克风。
                </p>
              ) : null}
            </label>
            <div className="settings-secret">
              <label className="settings-field">
                <span>豆包 Access Token</span>
                <input
                  type="password"
                  value={doubaoSecret.action === 'replace' ? doubaoSecret.value : ''}
                  placeholder={
                    draft.has_doubao_asr_access_token ? '已保存，留空则保持不变' : '当前未设置'
                  }
                  onChange={(event) =>
                    updateSecret(
                      event.target.value,
                      draft.has_doubao_asr_access_token,
                      setDoubaoSecret,
                    )
                  }
                />
              </label>
              <div className="settings-inline-actions">
                <button
                  type="button"
                  onClick={() =>
                    updateSecretDraft(setDoubaoSecret, createUnchangedSecretDraft())
                  }
                >
                  保持当前
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateSecretDraft(setDoubaoSecret, { action: 'clear', value: '' })
                  }
                >
                  清空密钥
                </button>
              </div>
              <p className="settings-hint">
                {getSecretHint(
                  draft.has_doubao_asr_access_token,
                  doubaoSecret,
                  '豆包 Access Token',
                )}
              </p>
            </div>
              <label className="settings-field">
                <span>豆包 Resource ID</span>
                <input
                  aria-invalid={Boolean(validationErrors.doubao_asr_resource_id)}
                  className={inputClassName('doubao_asr_resource_id')}
                  value={draft.doubao_asr_resource_id}
                  onChange={(event) =>
                    updateDraft('doubao_asr_resource_id', event.target.value)
                  }
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
                ) : null}

                {activeSection === 'voice' ? (
                  <fieldset className="settings-section" disabled={isBusy}>
                    <legend>高级参数</legend>
                    <div className="settings-grid-form">
                      <label className="settings-field">
                        <span>音频格式</span>
                        <input
                          aria-invalid={Boolean(validationErrors.doubao_asr_audio_format)}
                          className={inputClassName('doubao_asr_audio_format')}
                          value={draft.doubao_asr_audio_format}
                          onChange={(event) =>
                            updateDraft('doubao_asr_audio_format', event.target.value)
                          }
                        />
                        {renderFieldError('doubao_asr_audio_format')}
                      </label>
                      <label className="settings-field">
                        <span>音频采样率</span>
                        <input
                          aria-invalid={Boolean(validationErrors.doubao_asr_audio_rate)}
                          aria-label="音频采样率"
                          className={inputClassName('doubao_asr_audio_rate')}
                          type="number"
                          value={draft.doubao_asr_audio_rate}
                          onChange={(event) =>
                            updateDraft(
                              'doubao_asr_audio_rate',
                              Number(event.target.value) || 0,
                            )
                          }
                        />
                        {renderFieldError('doubao_asr_audio_rate')}
                      </label>
                      <label className="settings-field">
                        <span>音频位深</span>
                        <input
                          aria-invalid={Boolean(validationErrors.doubao_asr_audio_bits)}
                          aria-label="音频位深"
                          className={inputClassName('doubao_asr_audio_bits')}
                          type="number"
                          value={draft.doubao_asr_audio_bits}
                          onChange={(event) =>
                            updateDraft(
                              'doubao_asr_audio_bits',
                              Number(event.target.value) || 0,
                            )
                          }
                        />
                        {renderFieldError('doubao_asr_audio_bits')}
                      </label>
                      <label className="settings-field">
                        <span>音频声道</span>
                        <input
                          aria-invalid={Boolean(validationErrors.doubao_asr_audio_channel)}
                          className={inputClassName('doubao_asr_audio_channel')}
                          type="number"
                          value={draft.doubao_asr_audio_channel}
                          onChange={(event) =>
                            updateDraft(
                              'doubao_asr_audio_channel',
                              Number(event.target.value) || 0,
                            )
                          }
                        />
                        {renderFieldError('doubao_asr_audio_channel')}
                      </label>
                      <label className="settings-field">
                        <span>音频语言</span>
                        <input
                          aria-invalid={Boolean(validationErrors.doubao_asr_audio_language)}
                          className={inputClassName('doubao_asr_audio_language')}
                          value={draft.doubao_asr_audio_language}
                          onChange={(event) =>
                            updateDraft('doubao_asr_audio_language', event.target.value)
                          }
                        />
                        {renderFieldError('doubao_asr_audio_language')}
                      </label>
                      <label className="settings-field">
                        <span>强制判定语音时长(ms)</span>
                        <input
                          type="number"
                          value={draft.doubao_asr_force_to_speech_time}
                          onChange={(event) =>
                            updateDraft(
                              'doubao_asr_force_to_speech_time',
                              Number(event.target.value) || 0,
                            )
                          }
                        />
                      </label>
                      <label className="settings-field">
                        <span>结束判定窗口(ms)</span>
                        <input
                          type="number"
                          value={draft.doubao_asr_end_window_size}
                          onChange={(event) =>
                            updateDraft(
                              'doubao_asr_end_window_size',
                              Number(event.target.value) || 0,
                            )
                          }
                        />
                      </label>
                      <label className="settings-field">
                        <span>Boosting Table ID</span>
                        <input
                          value={draft.doubao_asr_boosting_table_id}
                          onChange={(event) =>
                            updateDraft('doubao_asr_boosting_table_id', event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <div className="settings-checkbox-grid">
                      <label className="settings-checkbox">
                        <input
                          checked={draft.doubao_asr_enable_itn}
                          type="checkbox"
                          onChange={(event) =>
                            updateDraft('doubao_asr_enable_itn', event.target.checked)
                          }
                        />
                        <span>启用 ITN</span>
                      </label>
                      <label className="settings-checkbox">
                        <input
                          checked={draft.doubao_asr_enable_ddc}
                          type="checkbox"
                          onChange={(event) =>
                            updateDraft('doubao_asr_enable_ddc', event.target.checked)
                          }
                        />
                        <span>启用 DDC</span>
                      </label>
                      <label className="settings-checkbox">
                        <input
                          checked={draft.doubao_asr_enable_punc}
                          type="checkbox"
                          onChange={(event) =>
                            updateDraft('doubao_asr_enable_punc', event.target.checked)
                          }
                        />
                        <span>启用标点</span>
                      </label>
                      <label className="settings-checkbox">
                        <input
                          checked={draft.doubao_asr_show_utterances}
                          type="checkbox"
                          onChange={(event) =>
                            updateDraft('doubao_asr_show_utterances', event.target.checked)
                          }
                        />
                        <span>显示分句结果</span>
                      </label>
                    </div>
                    <label className="settings-field settings-field-wide">
                      <span>上下文 JSON</span>
                      <textarea
                        aria-invalid={Boolean(validationErrors.doubao_asr_context_json)}
                        className={inputClassName('doubao_asr_context_json')}
                        rows={4}
                        value={draft.doubao_asr_context_json}
                        onChange={(event) =>
                          updateDraft('doubao_asr_context_json', event.target.value)
                        }
                      />
                      {renderFieldError('doubao_asr_context_json')}
                    </label>
                  </fieldset>
                ) : null}

                {activeSection === 'models' ? (
                  <fieldset className="settings-section" disabled={isBusy}>
                    <legend>OpenAI-compatible LLM</legend>
                    <label className="settings-field">
                      <span>LLM 服务地址</span>
                      <input
                        aria-invalid={Boolean(validationErrors.llm_base_url)}
                        className={inputClassName('llm_base_url')}
                        value={draft.llm_base_url}
                        onChange={(event) =>
                          updateDraft('llm_base_url', event.target.value)
                        }
                      />
                      {renderFieldError('llm_base_url')}
                    </label>
                    <div className="settings-secret">
                      <label className="settings-field">
                        <span>LLM API Key</span>
                        <input
                          type="password"
                          value={llmSecret.action === 'replace' ? llmSecret.value : ''}
                          placeholder={
                            draft.has_llm_api_key ? '已保存，留空则保持不变' : '当前未设置'
                          }
                          onChange={(event) =>
                            updateSecret(
                              event.target.value,
                              draft.has_llm_api_key,
                              setLlmSecret,
                            )
                          }
                        />
                      </label>
                      <div className="settings-inline-actions">
                        <button
                          type="button"
                          onClick={() =>
                            updateSecretDraft(setLlmSecret, createUnchangedSecretDraft())
                          }
                        >
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
                      <p className="settings-hint">
                        {getSecretHint(draft.has_llm_api_key, llmSecret, 'LLM API Key')}
                      </p>
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
                        onChange={(event) =>
                          updateDraft('llm_system_prompt', event.target.value)
                        }
                      />
                    </label>
                  </fieldset>
                ) : null}

                {activeSection === 'mcp' ? (
                  <fieldset className="settings-section" disabled={isBusy}>
                    <legend>MCP</legend>
                    <div className="settings-checkbox-grid">
                      <label className="settings-checkbox">
                        <input
                          checked={draft.angrymiao_skill_enabled}
                          type="checkbox"
                          onChange={(event) =>
                            updateDraft('angrymiao_skill_enabled', event.target.checked)
                          }
                        />
                        <span>启用 AngryMiao 系统控制</span>
                      </label>
                    </div>
                    <SkillBundleInventory />
                    <KeyboardShortcutSettings
                      keyboardDriverPath={draft.keyboard_driver_path}
                      keyboardShortcuts={draft.keyboard_shortcuts}
                      onKeyboardDriverPathChange={(value) =>
                        updateDraft('keyboard_driver_path', value)
                      }
                      onKeyboardShortcutsChange={(value) =>
                        updateDraft('keyboard_shortcuts', value)
                      }
                    />
                    {renderFieldError('keyboard_shortcuts')}
                    <p className="settings-hint">
                      自定义 MCP 服务 JSON 会与内置 AngryMiao runtime 一起参与 MCP 同步。
                    </p>
                    <label className="settings-field settings-field-wide">
                      <span>MCP 服务 JSON</span>
                      <textarea
                        aria-invalid={Boolean(validationErrors.mcp_servers_json)}
                        className={inputClassName('mcp_servers_json')}
                        rows={8}
                        value={draft.mcp_servers_json}
                        onChange={(event) =>
                          updateDraft('mcp_servers_json', event.target.value)
                        }
                      />
                      {renderFieldError('mcp_servers_json')}
                    </label>
                  </fieldset>
                ) : null}
              </div>
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
