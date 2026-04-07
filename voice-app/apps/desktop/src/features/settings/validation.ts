import type { EditableVoiceSettings } from '../../lib/tauri'
import { isValidDefaultHotkey } from './defaultHotkey'

export type SecretDraftState = {
  action: 'unchanged' | 'replace' | 'clear'
  value: string
}

export type SettingsFieldKey =
  | 'default_hotkey'
  | 'doubao_asr_url'
  | 'doubao_asr_resource_id'
  | 'doubao_asr_model'
  | 'doubao_asr_audio_format'
  | 'doubao_asr_audio_rate'
  | 'doubao_asr_audio_bits'
  | 'doubao_asr_audio_channel'
  | 'doubao_asr_audio_language'
  | 'doubao_asr_context_json'
  | 'llm_base_url'
  | 'llm_model'
  | 'keyboard_shortcuts'
  | 'mcp_servers_json'

export type SettingsValidationErrors = Partial<Record<SettingsFieldKey, string>>

const allowedDoubaoAudioFormats = new Set(['pcm', 'wav', 'ogg', 'mp3'])

export function validateSettingsDraft(
  draft: EditableVoiceSettings,
  _doubaoSecret: SecretDraftState,
  _llmSecret: SecretDraftState,
): SettingsValidationErrors {
  const errors: SettingsValidationErrors = {}

  if (!draft.default_hotkey.trim()) {
    errors.default_hotkey = '默认热键不能为空。'
  } else if (!isValidDefaultHotkey(draft.default_hotkey)) {
    errors.default_hotkey = '默认热键格式无效，请使用类似 RightAlt 或 LeftCtrl+K 的格式。'
  }

  validateUrl(
    draft.doubao_asr_url,
    ['ws:', 'wss:'],
    '豆包 WebSocket URL 必须是合法的 ws:// 或 wss:// 地址。',
    (message) => {
      errors.doubao_asr_url = message
    },
  )

  if (!draft.doubao_asr_resource_id.trim()) {
    errors.doubao_asr_resource_id = '豆包 Resource ID 不能为空。'
  }

  if (!draft.doubao_asr_model.trim()) {
    errors.doubao_asr_model = '豆包模型不能为空。'
  }

  if (!draft.doubao_asr_audio_format.trim()) {
    errors.doubao_asr_audio_format = '音频格式不能为空。'
  } else if (
    !allowedDoubaoAudioFormats.has(draft.doubao_asr_audio_format.trim().toLowerCase())
  ) {
    errors.doubao_asr_audio_format = '音频格式只支持 pcm、wav、ogg 或 mp3。'
  }

  if (draft.doubao_asr_audio_rate !== 16_000) {
    errors.doubao_asr_audio_rate = '音频采样率当前只支持 16000。'
  }

  if (draft.doubao_asr_audio_bits !== 16) {
    errors.doubao_asr_audio_bits = '音频位深当前只支持 16。'
  }

  if (draft.doubao_asr_audio_channel !== 1 && draft.doubao_asr_audio_channel !== 2) {
    errors.doubao_asr_audio_channel = '音频声道当前只支持 1 或 2。'
  }

  if (!draft.doubao_asr_audio_language.trim()) {
    errors.doubao_asr_audio_language = '音频语言不能为空。'
  }

  if (draft.doubao_asr_context_json.trim()) {
    try {
      JSON.parse(draft.doubao_asr_context_json)
    } catch {
      errors.doubao_asr_context_json = '上下文 JSON 必须是合法 JSON。'
    }
  }

  validateUrl(
    draft.llm_base_url,
    ['http:', 'https:'],
    'LLM 服务地址必须是合法的 http:// 或 https:// 地址。',
    (message) => {
      errors.llm_base_url = message
    },
  )

  if (!draft.llm_model.trim()) {
    errors.llm_model = 'LLM 模型不能为空。'
  }

  if (!isValidKeyboardShortcuts(draft.keyboard_shortcuts)) {
    errors.keyboard_shortcuts = '键盘快捷键映射格式无效。'
  }

  if (!isValidMcpServersJson(draft.mcp_servers_json)) {
    errors.mcp_servers_json = 'MCP 服务 JSON 格式无效。'
  }

  return errors
}

export function getRuntimeReadinessWarnings(
  draft: EditableVoiceSettings,
  doubaoSecret: SecretDraftState,
  llmSecret: SecretDraftState,
) {
  const warnings: string[] = []

  if (!draft.doubao_asr_app_id.trim()) {
    warnings.push('豆包 App ID')
  }

  if (!hasEffectiveSecret(draft.has_doubao_asr_access_token, doubaoSecret)) {
    warnings.push('豆包 Access Token')
  }

  if (!hasEffectiveSecret(draft.has_llm_api_key, llmSecret)) {
    warnings.push('LLM API Key')
  }

  return warnings
}

function hasEffectiveSecret(
  hasSavedSecret: boolean,
  draft: SecretDraftState,
) {
  switch (draft.action) {
    case 'replace':
      return draft.value.trim().length > 0
    case 'clear':
      return false
    default:
      return hasSavedSecret
  }
}

function validateUrl(
  value: string,
  protocols: string[],
  message: string,
  onError: (message: string) => void,
) {
  const trimmed = value.trim()
  if (!trimmed) {
    onError(message)
    return
  }

  try {
    const url = new URL(trimmed)
    if (!protocols.includes(url.protocol)) {
      onError(message)
    }
  } catch {
    onError(message)
  }
}

function isValidMcpServersJson(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return true
  }

  try {
    const parsed = JSON.parse(trimmed)

    if (!Array.isArray(parsed)) {
      return false
    }

    return parsed.every((item) => {
      if (!item || typeof item !== 'object') {
        return false
      }

      const config = item as Record<string, unknown>
      if (typeof config.id !== 'string' || !config.id.trim()) {
        return false
      }
      if (typeof config.name !== 'string' || !config.name.trim()) {
        return false
      }
      if (typeof config.enabled !== 'boolean') {
        return false
      }
      if (!config.transport || typeof config.transport !== 'object') {
        return false
      }

      const transport = config.transport as Record<string, unknown>
      if (transport.type !== 'stdio') {
        return false
      }

      return typeof transport.command === 'string' && transport.command.trim().length > 0
    })
  } catch {
    return false
  }
}

function isValidKeyboardShortcuts(
  shortcuts: EditableVoiceSettings['keyboard_shortcuts'],
) {
  const ids = new Set<string>()

  return shortcuts.every((shortcut) => {
    if (!shortcut.id.trim() || ids.has(shortcut.id.trim())) {
      return false
    }
    ids.add(shortcut.id.trim())

    const triggerWords = shortcut.trigger_words.filter((value) => value.trim())
    if (triggerWords.length === 0) {
      return false
    }

    if (
      shortcut.recorded_keys.length === 0 &&
      shortcut.key_codes.length === 0
    ) {
      return false
    }

    return shortcut.recorded_keys.length <= 6
  })
}
