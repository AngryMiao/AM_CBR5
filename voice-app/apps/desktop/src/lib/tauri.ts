import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type RuntimePhase =
  | '待命中'
  | '正在聆听'
  | '正在识别'
  | '正在生成'
  | '正在执行'
  | '正在输出'
  | '已完成'
  | '识别失败'
  | '加载中'

export type RuntimeSnapshot = {
  phase: RuntimePhase | string
  transcript: string
  result: string
  detail: string
  input_mode: 'none' | 'agent' | 'transcription' | string
}

export type HistoryRecord = {
  id: number
  transcript: string
  result: string
  status: string
  detail: string
  created_at: string
}

export type VoiceSettings = {
  history_enabled: boolean
  auto_launch_enabled: boolean
  default_hotkey: string
  microphone_device_id: string
  asr_provider: string
  asr_model: string
  asr_resource_id: string
  asr_audio_rate: number
  transcription_silence_timeout_ms: number
  llm_provider: string
  llm_model: string
  llm_base_url: string
  keyboard_shortcuts: KeyboardShortcut[]
}

export type KeyboardShortcut = {
  id: string
  trigger_words: string[]
  key_codes: string[]
  recorded_keys: string[]
  enabled: boolean
}

export type EditableSecretValueInput =
  | { action: 'unchanged' }
  | { action: 'replace'; value: string }
  | { action: 'clear' }

export type EditableSettingsMutationResult = {
  settings: EditableVoiceSettings
  warnings: string[]
}

export type EditableVoiceSettings = {
  schema_version: number
  history_enabled: boolean
  auto_launch_enabled: boolean
  default_hotkey: string
  microphone_device_id: string
  doubao_asr_url: string
  doubao_asr_app_id: string
  doubao_asr_resource_id: string
  doubao_asr_model: string
  transcription_silence_timeout_ms: number
  llm_base_url: string
  llm_model: string
  llm_system_prompt: string
  angrymiao_skill_enabled: boolean
  keyboard_driver_path: string
  keyboard_shortcuts: KeyboardShortcut[]
  mcp_servers_json: string
  has_doubao_asr_access_token: boolean
  has_llm_api_key: boolean
}

export type SaveEditableVoiceSettingsInput = {
  schema_version: number
  history_enabled: boolean
  auto_launch_enabled: boolean
  default_hotkey: string
  microphone_device_id: string
  doubao_asr_url: string
  doubao_asr_app_id: string
  doubao_asr_resource_id: string
  doubao_asr_model: string
  transcription_silence_timeout_ms: number
  llm_base_url: string
  llm_model: string
  llm_system_prompt: string
  angrymiao_skill_enabled: boolean
  keyboard_driver_path: string
  keyboard_shortcuts: KeyboardShortcut[]
  mcp_servers_json: string
  doubao_asr_access_token: EditableSecretValueInput
  llm_api_key: EditableSecretValueInput
}

export type RuntimeLogEntry = {
  level: string
  message: string
}

export type MicrophoneInputDevice = {
  id: string
  label: string
  is_default: boolean
}

export type PlatformDiagnostics = {
  platform_name: string
  supported: boolean
  microphone_available: boolean
  microphone_permission_status: string
  input_control_permission_status: string
  hotkey_backend: string
  hotkey_backend_error: string | null
  auto_launch_enabled: boolean
  deep_link_scheme: string
  deep_link_registered: boolean
  last_deep_link: string | null
  permission_hint: string | null
}

export type McpServerRuntimeDiagnostics = {
  id: string
  name: string
  enabled: boolean
  source: string
  active_in_runtime: boolean
  transport: string
  command: string
  args: string[]
}

export type McpToolRuntimeDiagnostics = {
  qualified_name: string
  server_id: string
  tool_name: string
  description: string
}

export type AngrymiaoRuntimeDiagnostics = {
  enabled_in_settings: boolean
  bundle_dir: string | null
  bundle_installed: boolean
  supported_on_current_platform: boolean
  runtime_entry: string | null
  runtime_entry_exists: boolean
  server_id: string | null
  keyboard_driver_source: string
  keyboard_driver_path: string | null
  keyboard_driver_exists: boolean
  missing_required_env: string[]
  error: string | null
}

export type RuntimeDiagnostics = {
  skill_bundle_root: string | null
  mcp_last_sync_error: string | null
  configured_server_count: number
  active_server_count: number
  tool_count: number
  mcp_servers: McpServerRuntimeDiagnostics[]
  active_tools: McpToolRuntimeDiagnostics[]
  angrymiao: AngrymiaoRuntimeDiagnostics
}

export type SkillBundleRuntimeInventoryItem = {
  id: string
  name: string
  transport: string
  launcher: string
  entry: string
  server_id: string
  server_name: string
  platforms: string[]
  supported_on_current_platform: boolean
  missing_required_env: string[]
  resolved_env: Record<string, string>
}

export type SkillBundleInventoryItem = {
  id: string
  version: string
  name: string
  description: string
  bundle_dir: string
  platforms: string[]
  supported_on_current_platform: boolean
  is_builtin: boolean
  prompt_file: string
  prompt_examples_file: string | null
  runtimes: SkillBundleRuntimeInventoryItem[]
}

export type AppWindowLabel = 'main' | 'overlay' | 'result'

const runtimeSnapshotEvent = 'runtime-snapshot'
const historyUpdatedEvent = 'history-updated'
const logsUpdatedEvent = 'logs-updated'
const platformDiagnosticsUpdatedEvent = 'platform-diagnostics-updated'

export async function getRuntimeSnapshot() {
  return invoke<RuntimeSnapshot>('get_runtime_snapshot')
}

export async function startMicrophoneCapture() {
  return invoke<RuntimeSnapshot>('start_microphone_capture')
}

export async function stopMicrophoneCapture() {
  return invoke<RuntimeSnapshot>('stop_microphone_capture')
}

export async function dismissRuntimeResult() {
  return invoke<RuntimeSnapshot>('dismiss_runtime_result')
}

export async function getHistoryRecords() {
  return invoke<HistoryRecord[]>('get_history_records')
}

export async function queryHistoryRecords(keyword?: string, status?: string) {
  return invoke<HistoryRecord[]>('query_history_records', { keyword, status })
}

export async function previewHistoryRecord(recordId: number) {
  return invoke<RuntimeSnapshot>('preview_history_record', { recordId })
}

export async function retryHistoryRecord(recordId: number) {
  return invoke<RuntimeSnapshot>('retry_history_record', { recordId })
}

export async function getVoiceSettings() {
  return invoke<VoiceSettings>('get_voice_settings')
}

export async function getEditableSettings() {
  return invoke<EditableVoiceSettings>('get_editable_settings')
}

export async function listMicrophoneInputs() {
  return invoke<MicrophoneInputDevice[]>('list_microphone_inputs')
}

export async function saveEditableSettings(input: SaveEditableVoiceSettingsInput) {
  return invoke<EditableSettingsMutationResult>('save_editable_settings', { input })
}

export async function resetEditableSettings() {
  return invoke<EditableSettingsMutationResult>('reset_editable_settings')
}

export async function getRuntimeLogs() {
  return invoke<RuntimeLogEntry[]>('get_runtime_logs')
}

export async function clearRuntimeLogs() {
  return invoke<void>('clear_runtime_logs')
}

export async function exportRuntimeLogs() {
  return invoke<string>('export_runtime_logs')
}

export async function getPlatformDiagnostics() {
  return invoke<PlatformDiagnostics>('get_platform_diagnostics')
}

export async function getRuntimeDiagnostics() {
  return invoke<RuntimeDiagnostics>('get_runtime_diagnostics')
}

export async function listSkillBundles() {
  return invoke<SkillBundleInventoryItem[]>('list_skill_bundles')
}

export async function readSkillBundleText(bundleId: string, relativePath: string) {
  return invoke<string>('read_skill_bundle_text', { bundleId, relativePath })
}

export async function installSkillBundle(bundleSourceDir: string) {
  return invoke<SkillBundleInventoryItem>('install_skill_bundle', { bundleSourceDir })
}

export function getCurrentWindowLabel(): AppWindowLabel {
  try {
    const label = getCurrentWindow().label

    if (label === 'overlay' || label === 'result') {
      return label
    }
  } catch {
    return 'main'
  }

  return 'main'
}

export async function hideCurrentWindow() {
  const currentWindow = getCurrentWindow()

  try {
    await currentWindow.hide()
    return
  } catch {
    if (typeof currentWindow.close === 'function') {
      await currentWindow.close()
    }
  }
}

export async function closeCurrentWindow() {
  const currentWindow = getCurrentWindow()

  if (typeof currentWindow.close === 'function') {
    await currentWindow.close()
    return
  }

  await currentWindow.hide()
}

export async function listenRuntimeSnapshot(
  onSnapshot: (snapshot: RuntimeSnapshot) => void,
) {
  return listen<RuntimeSnapshot>(runtimeSnapshotEvent, (event) => {
    onSnapshot(event.payload)
  })
}

export async function listenHistoryRecords(
  onHistory: (history: HistoryRecord[]) => void,
) {
  return listen<HistoryRecord[]>(historyUpdatedEvent, (event) => {
    onHistory(event.payload)
  })
}

export async function listenRuntimeLogs(
  onLogs: (logs: RuntimeLogEntry[]) => void,
) {
  return listen<RuntimeLogEntry[]>(logsUpdatedEvent, (event) => {
    onLogs(event.payload)
  })
}

export async function listenPlatformDiagnostics(
  onDiagnostics: (diagnostics: PlatformDiagnostics) => void,
) {
  return listen<PlatformDiagnostics>(platformDiagnosticsUpdatedEvent, (event) => {
    onDiagnostics(event.payload)
  })
}
