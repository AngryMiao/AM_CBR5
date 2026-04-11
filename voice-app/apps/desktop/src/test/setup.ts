import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'
import { getDefaultKeyboardShortcuts } from '../features/settings/keyboardShortcuts'

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  writable: true,
  value: vi.fn(),
})

type RuntimeSnapshot = {
  phase: string
  transcript: string
  result: string
  detail: string
  input_mode: string
  result_window_mode: string
}

type HistoryRecord = {
  id: number
  transcript: string
  result: string
  status: string
  detail: string
  created_at: string
}

type VoiceSettings = {
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

type KeyboardShortcut = {
  id: string
  trigger_words: string[]
  key_codes: string[]
  recorded_keys: string[]
  enabled: boolean
}

type EditableSecretValueInput =
  | { action: 'unchanged' }
  | { action: 'replace'; value: string }
  | { action: 'clear' }

type EditableVoiceSettings = {
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

type EditableSettingsMutationResult = {
  settings: EditableVoiceSettings
  warnings: string[]
}

type SaveEditableVoiceSettingsInput = {
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

type RuntimeLogEntry = {
  level: string
  message: string
}

type PlatformDiagnostics = {
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

type McpServerRuntimeDiagnostics = {
  id: string
  name: string
  enabled: boolean
  source: string
  active_in_runtime: boolean
  transport: string
  command: string
  args: string[]
}

type McpToolRuntimeDiagnostics = {
  qualified_name: string
  server_id: string
  tool_name: string
  description: string
}

type AngrymiaoRuntimeDiagnostics = {
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

type RuntimeDiagnostics = {
  skill_bundle_root: string | null
  mcp_last_sync_error: string | null
  configured_server_count: number
  active_server_count: number
  tool_count: number
  mcp_servers: McpServerRuntimeDiagnostics[]
  active_tools: McpToolRuntimeDiagnostics[]
  angrymiao: AngrymiaoRuntimeDiagnostics
}

type SkillBundleRuntimeInventoryItem = {
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

type SkillBundleInventoryItem = {
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

type StoredSecrets = {
  doubao_asr_access_token: string
  llm_api_key: string
}

type MicrophoneInputDevice = {
  id: string
  label: string
  is_default: boolean
}

let runtimeSnapshot: RuntimeSnapshot = {
  phase: '待命中',
  transcript: '',
  result: '',
  detail: '等待下一次语音任务。',
  input_mode: 'none',
  result_window_mode: 'auto',
}
let historyRecords: HistoryRecord[] = []
let runtimeLogs: RuntimeLogEntry[] = []
let platformDiagnostics: PlatformDiagnostics = {
  platform_name: 'Windows',
  supported: true,
  microphone_available: true,
  microphone_permission_status: '可用',
  input_control_permission_status: '待验证',
  hotkey_backend: '原生键盘 Hook',
  hotkey_backend_error: null,
  auto_launch_enabled: false,
  deep_link_scheme: 'voice-app',
  deep_link_registered: true,
  last_deep_link: null,
  permission_hint: '如无法录音，请检查系统设置中的麦克风权限。',
}
let runtimeDiagnostics: RuntimeDiagnostics = createDefaultRuntimeDiagnostics()
let skillBundles = createDefaultSkillBundles()
let completedTasks = 0
let microphoneCaptureActive = false
let editableSettings = createDefaultEditableSettings()
let storedSecrets = createDefaultSecrets()
let microphoneInputs = createDefaultMicrophoneInputs()
const listeners = new Map<string, Set<(event: { payload: unknown }) => void>>()

function createMockWindow(label: 'main' | 'overlay' | 'result' = 'main') {
  return {
    label,
    hide: vi.fn(),
    close: vi.fn(),
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    startDragging: vi.fn(),
  }
}

const getCurrentWindow = vi.fn(() => createMockWindow('main'))
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
const defaultAsrAudioRate = 16000

beforeEach(() => {
  for (const timer of pendingTimers) {
    clearTimeout(timer)
  }
  pendingTimers.clear()
  runtimeSnapshot = {
    phase: '待命中',
    transcript: '',
    result: '',
    detail: '等待下一次语音任务。',
    input_mode: 'none',
    result_window_mode: 'auto',
  }
  historyRecords = []
  runtimeLogs = [{ level: 'info', message: '语音运行时已就绪。' }]
  platformDiagnostics = {
    platform_name: 'Windows',
    supported: true,
    microphone_available: true,
    microphone_permission_status: '可用',
    input_control_permission_status: '待验证',
    hotkey_backend: '原生键盘 Hook',
    hotkey_backend_error: null,
    auto_launch_enabled: false,
    deep_link_scheme: 'voice-app',
    deep_link_registered: true,
    last_deep_link: null,
    permission_hint: '如无法录音，请检查系统设置中的麦克风权限。',
  }
  runtimeDiagnostics = createDefaultRuntimeDiagnostics()
  skillBundles = createDefaultSkillBundles()
  completedTasks = 0
  microphoneCaptureActive = false
  editableSettings = createDefaultEditableSettings()
  storedSecrets = createDefaultSecrets()
  microphoneInputs = createDefaultMicrophoneInputs()
  listeners.clear()
  getCurrentWindow.mockImplementation(() => createMockWindow('main'))
})

function createDefaultEditableSettings(): EditableVoiceSettings {
  return {
    schema_version: 1,
    history_enabled: true,
    auto_launch_enabled: false,
    default_hotkey: 'RightAlt',
    microphone_device_id: '',
    doubao_asr_url: 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async',
    doubao_asr_app_id: 'test-app-id',
    doubao_asr_resource_id: 'volc.bigasr.sauc.duration',
    doubao_asr_model: 'bigmodel',
    transcription_silence_timeout_ms: 3500,
    llm_base_url: 'https://api.openai.com/v1',
    llm_model: 'gpt-4o-mini',
    llm_system_prompt:
      '你是一个桌面语音助手。用户明确要求执行本地动作时，请优先调用已提供工具；只有在不需要执行动作时，才返回简洁、可执行的最终回答。',
    angrymiao_skill_enabled: false,
    keyboard_driver_path: '',
    keyboard_shortcuts: getDefaultKeyboardShortcuts(),
    mcp_servers_json: '[]',
    has_doubao_asr_access_token: true,
    has_llm_api_key: true,
  }
}

function createDefaultMicrophoneInputs(): MicrophoneInputDevice[] {
  return [
    { id: 'usb-mic', label: 'USB 麦克风', is_default: false },
    { id: 'builtin-mic', label: '内置麦克风', is_default: true },
  ]
}

function createDefaultSecrets(): StoredSecrets {
  return {
    doubao_asr_access_token: 'doubao-secret',
    llm_api_key: 'llm-secret',
  }
}

function createDefaultSkillBundles(): SkillBundleInventoryItem[] {
  return [
    {
      id: 'angrymiao-voice-control',
      version: '1.0.0',
      name: 'Angrymiao Voice Control',
      description: 'Voice-command skill bundle for desktop system control.',
      bundle_dir: 'C:/voice-app/skill-bundles/angrymiao-voice-control',
      platforms: ['darwin', 'win32'],
      supported_on_current_platform: true,
      is_builtin: true,
      prompt_file: 'SKILL.md',
      prompt_examples_file: 'examples.md',
      runtimes: [
        {
          id: 'system-control',
          name: 'system-control',
          transport: 'mcp-stdio',
          launcher: 'node-script',
          entry: 'runtime/system-control-mcp/dist/index.js',
          server_id: 'angrymiao-system-control',
          server_name: 'system-control',
          platforms: ['darwin', 'win32'],
          supported_on_current_platform: true,
          missing_required_env: [],
          resolved_env: {
            KEYBOARD_DRIVER_PATH:
              'C:/voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/utils/AIKeyBoardDriver.exe',
          },
        },
      ],
    },
  ]
}

function createInstalledBundleFromPath(bundleSourceDir: string): SkillBundleInventoryItem {
  const normalizedPath = bundleSourceDir.replace(/\\/g, '/').replace(/\/+$/, '')
  const rawName = normalizedPath.split('/').filter(Boolean).pop() || 'custom-skill'
  const bundleId = rawName.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  const title = rawName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

  return {
    id: bundleId,
    version: '1.0.0',
    name: title || 'Custom Skill Bundle',
    description: 'User installed skill bundle.',
    bundle_dir: `C:/voice-app/skill-bundles/${bundleId}`,
    platforms: ['win32'],
    supported_on_current_platform: true,
    is_builtin: false,
    prompt_file: 'SKILL.md',
    prompt_examples_file: null,
    runtimes: [
      {
        id: 'custom-runtime',
        name: 'custom-runtime',
        transport: 'mcp-stdio',
        launcher: 'node-script',
        entry: 'runtime/custom/index.js',
        server_id: `${bundleId}-server`,
        server_name: `${bundleId}-server`,
        platforms: ['win32'],
        supported_on_current_platform: true,
        missing_required_env: [],
        resolved_env: {},
      },
    ],
  }
}

function createDefaultRuntimeDiagnostics(): RuntimeDiagnostics {
  return {
    skill_bundle_root: 'C:/voice-app/skill-bundles',
    mcp_last_sync_error: null,
    configured_server_count: 1,
    active_server_count: 1,
    tool_count: 1,
    mcp_servers: [
      {
        id: 'angrymiao-system-control',
        name: 'system-control',
        enabled: true,
        source: 'builtin-skill-bundle',
        active_in_runtime: true,
        transport: 'stdio',
        command: 'node',
        args: [
          'C:/voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/dist/index.js',
        ],
      },
    ],
    active_tools: [
      {
        qualified_name: 'mcp__system-control__type_text',
        server_id: 'angrymiao-system-control',
        tool_name: 'type_text',
        description: 'Type text into current focused input',
      },
    ],
    angrymiao: {
      enabled_in_settings: false,
      bundle_dir: 'C:/voice-app/skill-bundles/angrymiao-voice-control',
      bundle_installed: true,
      supported_on_current_platform: true,
      runtime_entry:
        'C:/voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/dist/index.js',
      runtime_entry_exists: true,
      server_id: 'angrymiao-system-control',
      keyboard_driver_source: 'bundle 默认路径',
      keyboard_driver_path:
        'C:/voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/utils/AIKeyBoardDriver.exe',
      keyboard_driver_exists: true,
      missing_required_env: [],
      error: null,
    },
  }
}

function toVoiceSettings(settings: EditableVoiceSettings): VoiceSettings {
  return {
    history_enabled: settings.history_enabled,
    auto_launch_enabled: settings.auto_launch_enabled,
    default_hotkey: settings.default_hotkey,
    microphone_device_id: settings.microphone_device_id,
    asr_provider: 'doubao',
    asr_model: settings.doubao_asr_model,
    asr_resource_id: settings.doubao_asr_resource_id,
    asr_audio_rate: defaultAsrAudioRate,
    transcription_silence_timeout_ms: settings.transcription_silence_timeout_ms,
    llm_provider: 'openai-compatible',
    llm_model: settings.llm_model,
    llm_base_url: settings.llm_base_url,
    keyboard_shortcuts: settings.keyboard_shortcuts,
  }
}

function cloneEditableSettings(settings: EditableVoiceSettings) {
  return structuredClone(settings)
}

function emit(eventName: string, payload: unknown) {
  listeners.get(eventName)?.forEach((listener) => {
    listener({ payload })
  })
}

export function setRuntimeSnapshotForTest(next: RuntimeSnapshot) {
  runtimeSnapshot = next
  emit('runtime-snapshot', runtimeSnapshot)
}

function pushInfoLog(message: string) {
  runtimeLogs = [...runtimeLogs, { level: 'info', message }]
  emit('logs-updated', runtimeLogs)
}

function pushErrorLog(message: string) {
  runtimeLogs = [...runtimeLogs, { level: 'error', message }]
  emit('logs-updated', runtimeLogs)
}

function completeToolExecutionRuntime(transcript: string, createdAt: string) {
  completedTasks += 1
  runtimeSnapshot = {
    phase: '已完成',
    transcript,
    result: '已将文本输出到当前输入位置。',
    detail: '本地工具执行已完成。',
    input_mode: 'agent',
    result_window_mode: 'hidden',
  }
  historyRecords = [
    ...historyRecords,
    {
      id: completedTasks,
      transcript,
      result: runtimeSnapshot.result,
      status: 'done',
      detail: runtimeSnapshot.detail,
      created_at: createdAt,
    },
  ]
  emit('runtime-snapshot', runtimeSnapshot)
  emit('history-updated', historyRecords)
  pushInfoLog('本地工具执行已完成。')
}

function scheduleToolExecutionRuntime(transcript: string, createdAt: string) {
  scheduleMacrotask(() => {
    runtimeSnapshot = {
      phase: '正在输出',
      transcript,
      result: '',
      detail: '正在输出文本到当前焦点。',
      input_mode: 'agent',
      result_window_mode: 'auto',
    }
    emit('runtime-snapshot', runtimeSnapshot)
    pushInfoLog('LLM 已返回 1 个工具动作，正在进入本地执行。')

    scheduleMacrotask(() => {
      completeToolExecutionRuntime(transcript, createdAt)
    })
  }, 5)
}

function startMicrophoneCaptureRuntime() {
  microphoneCaptureActive = true
  runtimeSnapshot = {
    phase: '正在聆听',
    transcript: '',
    result: '',
    detail: '正在接收语音输入。',
    input_mode: 'agent',
    result_window_mode: 'auto',
  }
  pushInfoLog('测试语音任务已开始，状态进入正在聆听。')
  emit('runtime-snapshot', runtimeSnapshot)

  queueMicrotask(() => {
    runtimeSnapshot = {
      phase: '正在聆听',
      transcript: '实时片段',
      result: '',
      detail: '正在流式识别语音内容。',
      input_mode: 'agent',
      result_window_mode: 'auto',
    }
    emit('runtime-snapshot', runtimeSnapshot)
  })

  return runtimeSnapshot
}

function stopMicrophoneCaptureRuntime() {
  const transcript = '最终识别结果'

  microphoneCaptureActive = false
  runtimeSnapshot = {
    phase: '正在识别',
    transcript: runtimeSnapshot.transcript,
    result: '',
    detail: '正在等待豆包返回最终识别结果。',
    input_mode: 'agent',
    result_window_mode: 'auto',
  }
  pushInfoLog('测试语音任务已结束录音，等待豆包完成识别。')
  emit('runtime-snapshot', runtimeSnapshot)

  queueMicrotask(() => {
    runtimeSnapshot = {
      phase: '正在生成',
      transcript,
      result: '',
      detail: '正在等待 OpenAI-compatible LLM 输出。',
      input_mode: 'agent',
      result_window_mode: 'auto',
    }
    emit('runtime-snapshot', runtimeSnapshot)
    pushInfoLog('豆包流式识别已完成，正在请求 OpenAI-compatible LLM。')
    scheduleToolExecutionRuntime(transcript, '2026-04-05 14:12:00')
  })

  return runtimeSnapshot
}

function queryHistoryRecordsRuntime(keyword?: string, status?: string) {
  const normalizedKeyword = keyword?.trim() ?? ''
  const normalizedStatus = status?.trim().toLowerCase() ?? ''

  return historyRecords.filter((record) => {
    const keywordMatches =
      !normalizedKeyword ||
      record.transcript.includes(normalizedKeyword) ||
      record.result.includes(normalizedKeyword) ||
      record.detail.includes(normalizedKeyword)
    const statusMatches =
      !normalizedStatus || record.status.toLowerCase() === normalizedStatus

    return keywordMatches && statusMatches
  })
}

function previewHistoryRecordRuntime(recordId: number) {
  const record = historyRecords.find((entry) => entry.id === recordId)
  if (!record) {
    throw new Error(`未找到任务 #${recordId}。`)
  }

  runtimeSnapshot = {
    phase: record.status === 'error' ? '识别失败' : '已完成',
    transcript: record.transcript,
    result: record.result,
    detail: record.detail,
    input_mode: 'agent',
    result_window_mode: 'auto',
  }
  emit('runtime-snapshot', runtimeSnapshot)
  return runtimeSnapshot
}

function retryHistoryRecordRuntime(recordId: number) {
  const record = historyRecords.find((entry) => entry.id === recordId)
  if (!record) {
    throw new Error(`未找到任务 #${recordId}。`)
  }

  runtimeSnapshot = {
    phase: '正在生成',
    transcript: record.transcript,
    result: '',
    detail: `正在根据任务 #${recordId} 的识别文本重新生成结果。`,
    input_mode: 'agent',
    result_window_mode: 'auto',
  }
  emit('runtime-snapshot', runtimeSnapshot)
  pushInfoLog(`已开始重试任务 #${recordId}，正在重新请求 OpenAI-compatible LLM。`)

  scheduleToolExecutionRuntime(record.transcript, '2026-04-06 18:00:00')

  return runtimeSnapshot
}

function ensureSecretInput(
  input: EditableSecretValueInput | undefined,
  fieldName: string,
) {
  if (!input || typeof input !== 'object' || !('action' in input)) {
    throw new Error(`${fieldName} secret action is required`)
  }

  return input
}

function resolveSecretInput(current: string, input: EditableSecretValueInput) {
  switch (input.action) {
    case 'unchanged':
      return current
    case 'replace':
      return input.value.trim()
    case 'clear':
      return ''
    default:
      return current
  }
}

function saveEditableSettingsRuntime(
  input: SaveEditableVoiceSettingsInput | undefined,
): EditableSettingsMutationResult {
  if (!input) {
    throw new Error('save_editable_settings requires input')
  }

  const doubaoAction = ensureSecretInput(
    input.doubao_asr_access_token,
    'doubao_asr_access_token',
  )
  const llmAction = ensureSecretInput(input.llm_api_key, 'llm_api_key')

  storedSecrets = {
    doubao_asr_access_token: resolveSecretInput(
      storedSecrets.doubao_asr_access_token,
      doubaoAction,
    ),
    llm_api_key: resolveSecretInput(storedSecrets.llm_api_key, llmAction),
  }

  editableSettings = {
    ...editableSettings,
    ...input,
    has_doubao_asr_access_token:
      storedSecrets.doubao_asr_access_token.trim().length > 0,
    has_llm_api_key: storedSecrets.llm_api_key.trim().length > 0,
  }
  platformDiagnostics = {
    ...platformDiagnostics,
    auto_launch_enabled: editableSettings.auto_launch_enabled,
  }
  runtimeDiagnostics = {
    ...runtimeDiagnostics,
    angrymiao: {
      ...runtimeDiagnostics.angrymiao,
      enabled_in_settings: editableSettings.angrymiao_skill_enabled,
      keyboard_driver_path:
        editableSettings.keyboard_driver_path ||
        runtimeDiagnostics.angrymiao.keyboard_driver_path,
      keyboard_driver_source: editableSettings.keyboard_driver_path
        ? '设置路径'
        : runtimeDiagnostics.angrymiao.keyboard_driver_source,
      keyboard_driver_exists: Boolean(
        editableSettings.keyboard_driver_path ||
          runtimeDiagnostics.angrymiao.keyboard_driver_path,
      ),
    },
  }
  emit('platform-diagnostics-updated', platformDiagnostics)
  pushInfoLog('设置已保存，新的语音任务将使用最新配置。')

  return {
    settings: cloneEditableSettings(editableSettings),
    warnings: [],
  }
}

function resetEditableSettingsRuntime(): EditableSettingsMutationResult {
  platformDiagnostics = {
    ...platformDiagnostics,
    auto_launch_enabled: editableSettings.auto_launch_enabled,
  }
  runtimeDiagnostics = {
    ...runtimeDiagnostics,
    angrymiao: {
      ...runtimeDiagnostics.angrymiao,
      enabled_in_settings: editableSettings.angrymiao_skill_enabled,
    },
  }
  emit('platform-diagnostics-updated', platformDiagnostics)
  pushInfoLog('已重置为当前已保存设置。')
  return {
    settings: cloneEditableSettings(editableSettings),
    warnings: [],
  }
}

function scheduleMacrotask(task: () => void, delay = 0) {
  const timer = setTimeout(() => {
    pendingTimers.delete(timer)
    task()
  }, delay)

  pendingTimers.add(timer)
}

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string, payload?: Record<string, unknown>) => {
    if (command === 'get_runtime_snapshot') {
      return runtimeSnapshot
    }

    if (command === 'get_history_records') {
      return historyRecords
    }

    if (command === 'query_history_records') {
      return queryHistoryRecordsRuntime(
        payload && 'keyword' in payload ? (payload as { keyword?: string }).keyword : undefined,
        payload && 'status' in payload ? (payload as { status?: string }).status : undefined,
      )
    }

    if (command === 'preview_history_record') {
      return previewHistoryRecordRuntime(
        payload && 'recordId' in payload ? (payload as { recordId: number }).recordId : 0,
      )
    }

    if (command === 'retry_history_record') {
      return retryHistoryRecordRuntime(
        payload && 'recordId' in payload ? (payload as { recordId: number }).recordId : 0,
      )
    }

    if (command === 'get_voice_settings') {
      return toVoiceSettings(editableSettings)
    }

    if (command === 'get_editable_settings') {
      return cloneEditableSettings(editableSettings)
    }

    if (command === 'list_microphone_inputs') {
      return structuredClone(microphoneInputs)
    }

    if (command === 'save_editable_settings') {
      return saveEditableSettingsRuntime(payload?.input)
    }

    if (command === 'reset_editable_settings') {
      return resetEditableSettingsRuntime()
    }

    if (command === 'get_runtime_logs') {
      return runtimeLogs
    }

    if (command === 'clear_runtime_logs') {
      runtimeLogs = []
      emit('logs-updated', runtimeLogs)
      return null
    }

    if (command === 'export_runtime_logs') {
      const exportPath = 'C:/voice-app/runtime-logs-2026-04-06.log'
      pushInfoLog(`运行日志已导出到 ${exportPath}。`)
      return exportPath
    }

    if (command === 'get_platform_diagnostics') {
      return platformDiagnostics
    }

    if (command === 'get_runtime_diagnostics') {
      return runtimeDiagnostics
    }

    if (command === 'list_skill_bundles') {
      return structuredClone(skillBundles)
    }

    if (command === 'read_skill_bundle_text') {
      return '# Angrymiao Voice Control\n\nUse keyboard control.'
    }

    if (command === 'install_skill_bundle') {
      const bundleSourceDir =
        payload && 'bundleSourceDir' in payload
          ? (payload as { bundleSourceDir?: string }).bundleSourceDir?.trim() ?? ''
          : ''

      if (!bundleSourceDir) {
        throw new Error('请先输入待安装 Skill Bundle 的本地目录路径。')
      }

      const installed = createInstalledBundleFromPath(bundleSourceDir)
      skillBundles = [...skillBundles, installed]
      return installed
    }

    if (command === 'start_microphone_capture') {
      return startMicrophoneCaptureRuntime()
    }

    if (command === 'stop_microphone_capture') {
      if (!microphoneCaptureActive) {
        pushErrorLog('当前没有活动的语音任务')
        throw new Error('当前没有活动的语音任务')
      }

      return stopMicrophoneCaptureRuntime()
    }

    if (command === 'dismiss_runtime_result') {
      runtimeSnapshot = {
        phase: '待命中',
        transcript: '',
        result: '',
        detail: '等待下一次语音任务。',
        input_mode: 'none',
        result_window_mode: 'auto',
      }
      emit('runtime-snapshot', runtimeSnapshot)
      return runtimeSnapshot
    }

    return null
  }),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    async (eventName: string, handler: (event: { payload: unknown }) => void) => {
      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set())
      }

      listeners.get(eventName)?.add(handler)

      return () => {
        listeners.get(eventName)?.delete(handler)
      }
    },
  ),
}))
