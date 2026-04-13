use crate::audio_waveform::{AudioWaveformFrame, AudioWaveformStream};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use asr_core::{
    DoubaoAsrConfig, DoubaoSessionEvent, DoubaoStreamingSession, MicrophoneRecordingSession,
};
use automation_core::{
    GlobalHotkey, HotkeyModeAction, HotkeyModeController, RuntimeHotkeyPhase, SystemToolExecutor,
    ToolExecutionRuntimePhase, ToolExecutor, VoiceInputMode,
};
use history_core::{
    load_history_records, query_history_records, save_history_records, HistoryQuery, HistoryRecord,
};
use ipc_contract::{RuntimeSnapshot, RESULT_WINDOW_MODE_AUTO, RESULT_WINDOW_MODE_HIDDEN};
use llm_core::{
    LlmGenerationOutcome, LlmToolRequest, OpenAiCompatibleLlmConfig, OpenAiCompatibleLlmService,
};
use logging_core::{RuntimeLogEntry, RuntimeLogStore};
use mcp_core::{McpRuntime, McpToolCall, McpToolDescriptor};
use platform_core::{detect_platform_diagnostics, PlatformDiagnostics};
use serde::Serialize;
use settings_core::{
    EditableVoiceSettings, RuntimeVoiceSettings, SaveEditableVoiceSettingsInput, SettingsStore,
    StoredVoiceSettings, VoiceSettings,
};
use tauri::ipc::Channel;
use voice_core::RuntimeMachine;

enum ActiveCapture {
    #[cfg_attr(test, allow(dead_code))]
    Microphone(MicrophoneRecordingSession),
    #[cfg(test)]
    Test,
}

struct ActiveVoiceTask {
    capture: Option<ActiveCapture>,
    session: Option<DoubaoStreamingSession>,
}

struct RuntimeStore {
    machine: RuntimeMachine,
    history: Vec<HistoryRecord>,
    app_data_dir: Option<PathBuf>,
    history_store_path: Option<PathBuf>,
    settings_store_path: Option<PathBuf>,
    skill_bundle_root: Option<PathBuf>,
    platform_diagnostics: PlatformDiagnostics,
    stored_settings: StoredVoiceSettings,
    editable_settings: EditableVoiceSettings,
    runtime_settings: RuntimeVoiceSettings,
    logs: RuntimeLogStore,
    active_task: Option<ActiveVoiceTask>,
    active_operation_id: Option<u64>,
    next_operation_id: u64,
    hotkey_controller: HotkeyModeController,
    active_input_mode: VoiceInputMode,
    transcription_silence_token: u64,
    tool_executor: Arc<dyn ToolExecutor>,
    mcp_runtime: McpRuntime,
    mcp_last_sync_error: Option<String>,
}

pub(crate) struct TaskStartOutcome {
    pub operation_id: u64,
    pub snapshot: RuntimeSnapshot,
    pub events: Option<mpsc::Receiver<DoubaoSessionEvent>>,
    pub follow_up: Option<SessionFollowUp>,
}

pub(crate) enum HotkeyReleaseOutcome {
    TaskStarted(TaskStartOutcome),
    Snapshot(RuntimeSnapshot),
}

pub(crate) struct SessionEventOutcome {
    pub operation_id: u64,
    pub snapshot: RuntimeSnapshot,
    pub follow_up: Option<SessionFollowUp>,
}

pub(crate) enum SessionFollowUp {
    RunLlm(String),
    CommitTranscription(String),
}

pub(crate) enum LlmRunOutcome {
    Completed {
        snapshot: RuntimeSnapshot,
    },
    ToolExecutionPending {
        progress_snapshot: RuntimeSnapshot,
        requests: Vec<LlmToolRequest>,
    },
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct RuntimeDiagnostics {
    pub skill_bundle_root: Option<String>,
    pub mcp_last_sync_error: Option<String>,
    pub configured_server_count: usize,
    pub active_server_count: usize,
    pub tool_count: usize,
    pub mcp_servers: Vec<McpServerRuntimeDiagnostics>,
    pub active_tools: Vec<McpToolRuntimeDiagnostics>,
    pub angrymiao: crate::skill_bundles::AngrymiaoRuntimeDiagnostics,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct McpServerRuntimeDiagnostics {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub source: String,
    pub active_in_runtime: bool,
    pub transport: String,
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct McpToolRuntimeDiagnostics {
    pub qualified_name: String,
    pub server_id: String,
    pub tool_name: String,
    pub description: String,
}

pub struct AppState {
    runtime: Mutex<RuntimeStore>,
    waveform: Arc<Mutex<AudioWaveformStream>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::from_settings(StoredVoiceSettings::default())
    }
}

impl AppState {
    pub fn from_settings(settings: StoredVoiceSettings) -> Self {
        Self::from_settings_with_platform_executor_and_mcp_runtime(
            settings,
            detect_platform_diagnostics(),
            Arc::new(SystemToolExecutor),
            McpRuntime::new(),
        )
    }

    fn from_settings_with_platform_executor_and_mcp_runtime(
        settings: StoredVoiceSettings,
        platform_diagnostics: PlatformDiagnostics,
        tool_executor: Arc<dyn ToolExecutor>,
        mcp_runtime: McpRuntime,
    ) -> Self {
        Self {
            runtime: Mutex::new(build_runtime_store(
                settings,
                platform_diagnostics,
                tool_executor,
                mcp_runtime,
            )),
            waveform: Arc::new(Mutex::new(AudioWaveformStream::default())),
        }
    }

    #[cfg(test)]
    pub fn for_test() -> Self {
        Self::from_settings_with_platform_executor_and_mcp_runtime(
            test_stored_settings(),
            test_platform_diagnostics(),
            Arc::new(StaticToolExecutor::default()),
            McpRuntime::with_factory(Box::new(StaticMcpTransportFactory::default())),
        )
    }

    #[cfg(test)]
    pub fn with_invalid_config_for_test(_message: impl Into<String>) -> Self {
        let mut settings = test_stored_settings();
        settings.doubao_asr_access_token.clear();
        Self::from_settings_with_platform_executor_and_mcp_runtime(
            settings,
            test_platform_diagnostics(),
            Arc::new(StaticToolExecutor::default()),
            McpRuntime::with_factory(Box::new(StaticMcpTransportFactory::default())),
        )
    }

    #[cfg(test)]
    pub fn with_failing_tool_executor_for_test(message: impl Into<String>) -> Self {
        Self::from_settings_with_platform_executor_and_mcp_runtime(
            test_stored_settings(),
            test_platform_diagnostics(),
            Arc::new(StaticToolExecutor {
                failure: Some(message.into()),
            }),
            McpRuntime::with_factory(Box::new(StaticMcpTransportFactory::default())),
        )
    }

    #[cfg(test)]
    pub fn with_mcp_for_test() -> Self {
        let mut settings = test_stored_settings();
        settings.mcp_servers = vec![test_mcp_server_config()];
        let state = Self::from_settings_with_platform_executor_and_mcp_runtime(
            settings,
            test_platform_diagnostics(),
            Arc::new(StaticToolExecutor::default()),
            McpRuntime::with_factory(Box::new(StaticMcpTransportFactory::default())),
        );
        state
            .sync_mcp_servers()
            .expect("test MCP runtime should sync");
        state
    }

    pub fn runtime_snapshot(&self) -> RuntimeSnapshot {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        snapshot_with_mode(runtime.machine.snapshot(), runtime.active_input_mode)
    }

    pub fn register_audio_waveform_listener(
        &self,
        window_label: String,
        on_event: Channel<AudioWaveformFrame>,
    ) -> Result<(), String> {
        let initial_frame = {
            let mut waveform = self.waveform.lock().expect("waveform lock poisoned");
            waveform.register_subscriber(window_label, on_event.clone())
        };

        on_event
            .send(initial_frame)
            .map_err(|cause| format!("注册音频波纹订阅失败: {cause}"))
    }

    pub fn current_input_mode(&self) -> VoiceInputMode {
        self.runtime
            .lock()
            .expect("runtime store lock poisoned")
            .active_input_mode
    }

    pub fn history_records(&self) -> Vec<HistoryRecord> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.history.clone()
    }

    pub fn platform_diagnostics(&self) -> PlatformDiagnostics {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.platform_diagnostics.clone()
    }

    pub fn runtime_diagnostics(&self) -> RuntimeDiagnostics {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let skill_bundle_root = runtime.skill_bundle_root.clone();
        let active_server_ids = runtime.mcp_runtime.active_server_ids();
        let active_tools = runtime.mcp_runtime.available_tools();
        let config_resolution = crate::skill_bundles::resolve_builtin_mcp_servers(
            skill_bundle_root.as_deref(),
            &runtime.stored_settings,
        );
        let angrymiao = crate::skill_bundles::inspect_angrymiao_runtime(
            skill_bundle_root.as_deref(),
            &runtime.stored_settings,
        );
        let (server_configs, config_error) = match config_resolution {
            Ok(configs) => (configs, None),
            Err(cause) => (Vec::new(), Some(cause)),
        };

        let mcp_servers = server_configs
            .iter()
            .map(|config| {
                build_mcp_server_runtime_diagnostics(
                    config,
                    runtime
                        .stored_settings
                        .mcp_servers
                        .iter()
                        .any(|server| server.id == config.id),
                    active_server_ids
                        .iter()
                        .any(|server_id| server_id == &config.id),
                )
            })
            .collect::<Vec<_>>();

        let active_tool_inventory = active_tools
            .iter()
            .map(|tool| McpToolRuntimeDiagnostics {
                qualified_name: tool.qualified_name.clone(),
                server_id: tool.server_id.clone(),
                tool_name: tool.tool_name.clone(),
                description: tool.description.clone(),
            })
            .collect::<Vec<_>>();

        RuntimeDiagnostics {
            skill_bundle_root: skill_bundle_root.map(|path| path.display().to_string()),
            mcp_last_sync_error: runtime.mcp_last_sync_error.clone().or(config_error),
            configured_server_count: mcp_servers.len(),
            active_server_count: active_server_ids.len(),
            tool_count: active_tool_inventory.len(),
            mcp_servers,
            active_tools: active_tool_inventory,
            angrymiao,
        }
    }

    pub fn configure_app_data_dir(&self, path: PathBuf) {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.app_data_dir = Some(path);
    }

    pub fn configure_history_store(&self, path: PathBuf) -> Result<(), String> {
        let (history, recovery_log) = match load_history_records(&path) {
            Ok(history) => (history, None),
            Err(cause) => {
                let backup_path = backup_corrupted_history_file(&path)?;
                let log_message = format!(
                    "历史记录文件损坏，已备份到 {}，当前将从空历史恢复: {cause}",
                    backup_path.display()
                );
                (Vec::new(), Some(log_message))
            }
        };
        let history_count = history.len();
        let completed_tasks = history.iter().map(|record| record.id).max().unwrap_or(0);
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.history = history;
        runtime.history_store_path = Some(path);
        runtime.machine.set_completed_tasks(completed_tasks);

        if let Some(log_message) = recovery_log {
            runtime.logs.push(RuntimeLogEntry::error(log_message));
        } else if history_count > 0 {
            runtime.logs.push(RuntimeLogEntry::info(format!(
                "已从本地历史文件加载 {} 条记录。",
                history_count
            )));
        }

        Ok(())
    }

    pub fn configure_settings_store(&self, path: PathBuf) -> Result<(), String> {
        let settings = SettingsStore::load_or_create(&path)?;
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.settings_store_path = Some(path);
        replace_settings(&mut runtime, settings);
        if let Err(cause) = sync_mcp_runtime(&mut runtime) {
            runtime.logs.push(RuntimeLogEntry::error(format!(
                "MCP runtime 初始化失败: {cause}"
            )));
        }
        Ok(())
    }

    pub fn configure_skill_bundle_root(&self, path: PathBuf) {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.skill_bundle_root = Some(path);
    }

    pub fn skill_bundle_root(&self) -> Option<PathBuf> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.skill_bundle_root.clone()
    }

    pub fn runtime_logs(&self) -> Vec<RuntimeLogEntry> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.logs.entries()
    }

    pub fn voice_settings(&self) -> VoiceSettings {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.runtime_settings.clone()
    }

    pub fn editable_settings(&self) -> EditableVoiceSettings {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.editable_settings.clone()
    }

    pub fn stored_settings(&self) -> StoredVoiceSettings {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.stored_settings.clone()
    }

    #[cfg(test)]
    pub fn available_mcp_tools_for_test(&self) -> Vec<McpToolDescriptor> {
        self.available_mcp_tools()
    }

    pub fn sync_mcp_servers(&self) -> Result<(), String> {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        sync_mcp_runtime(&mut runtime)
    }

    pub fn save_editable_settings(
        &self,
        input: SaveEditableVoiceSettingsInput,
    ) -> Result<EditableVoiceSettings, String> {
        let (path, current) = {
            let runtime = self.runtime.lock().expect("runtime store lock poisoned");
            (
                runtime.settings_store_path.clone(),
                runtime.stored_settings.clone(),
            )
        };
        let path = path.ok_or_else(|| "设置存储尚未初始化。".to_string())?;
        let next_settings = SettingsStore::apply_input(&current, input)?;
        SettingsStore::save(&path, &next_settings)?;

        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        replace_settings(&mut runtime, next_settings);
        runtime.logs.push(RuntimeLogEntry::info(
            "设置已保存，新的语音任务将使用最新配置。",
        ));
        Ok(runtime.editable_settings.clone())
    }

    pub fn reset_editable_settings(&self) -> Result<EditableVoiceSettings, String> {
        let path = self.settings_store_path()?;
        let settings = SettingsStore::load_or_create(&path)?;

        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        replace_settings(&mut runtime, settings);
        runtime
            .logs
            .push(RuntimeLogEntry::info("已重置为当前已保存设置。"));
        Ok(runtime.editable_settings.clone())
    }

    pub fn configured_hotkey(&self) -> Result<GlobalHotkey, automation_core::HotkeyParseError> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        GlobalHotkey::parse(&runtime.runtime_settings.default_hotkey)
    }

    pub fn push_info_log(&self, message: impl Into<String>) {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.logs.push(RuntimeLogEntry::info(message));
    }

    pub fn push_error_log(&self, message: impl Into<String>) {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.logs.push(RuntimeLogEntry::error(message));
    }

    pub fn query_history_records(
        &self,
        keyword: Option<String>,
        status: Option<String>,
    ) -> Vec<HistoryRecord> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        query_history_records(&runtime.history, &HistoryQuery { keyword, status })
    }

    pub fn preview_history_record(&self, record_id: usize) -> Result<RuntimeSnapshot, String> {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let record = runtime
            .history
            .iter()
            .find(|entry| entry.id == record_id)
            .cloned()
            .ok_or_else(|| format!("未找到任务 #{record_id}。"))?;
        runtime.machine.load_history_preview(
            record.transcript,
            record.result,
            record.detail,
            record.status,
        );

        Ok(runtime.machine.snapshot())
    }

    pub fn retry_history_record(&self, record_id: usize) -> Result<TaskStartOutcome, String> {
        let transcript = {
            let runtime = self.runtime.lock().expect("runtime store lock poisoned");
            let record = runtime
                .history
                .iter()
                .find(|entry| entry.id == record_id)
                .ok_or_else(|| format!("未找到任务 #{record_id}。"))?;
            let transcript = record.transcript.trim().to_string();
            if transcript.is_empty() {
                return Err(format!("任务 #{record_id} 没有可用于重试生成的识别文本。"));
            }
            transcript
        };

        let operation_id = self.begin_operation();
        let snapshot = {
            let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
            runtime.active_operation_id = Some(operation_id);
            runtime.machine.start_generating_with_transcript(
                transcript.clone(),
                format!("正在根据任务 #{record_id} 的识别文本重新生成结果。"),
            );
            runtime.logs.push(RuntimeLogEntry::info(format!(
                "已开始重试任务 #{record_id}，正在重新请求 OpenAI-compatible LLM。"
            )));
            runtime.machine.snapshot()
        };

        Ok(TaskStartOutcome {
            operation_id,
            snapshot,
            events: None,
            follow_up: Some(SessionFollowUp::RunLlm(transcript)),
        })
    }

    pub fn clear_runtime_logs(&self) {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.logs.clear();
    }

    pub fn export_runtime_logs(&self) -> Result<PathBuf, String> {
        let (path, logs) = {
            let runtime = self.runtime.lock().expect("runtime store lock poisoned");
            let export_dir = runtime
                .app_data_dir
                .clone()
                .or_else(|| {
                    runtime
                        .settings_store_path
                        .as_ref()
                        .and_then(|path| path.parent().map(Path::to_path_buf))
                })
                .or_else(|| {
                    runtime
                        .history_store_path
                        .as_ref()
                        .and_then(|path| path.parent().map(Path::to_path_buf))
                })
                .ok_or_else(|| "运行日志导出目录尚未初始化。".to_string())?;
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|cause| format!("生成日志导出时间戳失败: {cause}"))?
                .as_secs();
            (
                export_dir.join(format!("runtime-logs-{timestamp}.log")),
                runtime.logs.clone(),
            )
        };

        logs.export_to_path(&path)?;
        Ok(path)
    }

    pub fn update_platform_diagnostics(&self, diagnostics: PlatformDiagnostics) {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.platform_diagnostics = diagnostics;
    }

    #[cfg(test)]
    pub fn begin_hotkey_task(&self) -> Result<Option<TaskStartOutcome>, String> {
        let phase = self.runtime_snapshot().phase;

        match phase.as_str() {
            "待命中" | "已完成" | "识别失败" => self
                .start_voice_task_for_mode(VoiceInputMode::Agent)
                .map(Some),
            _ => Ok(None),
        }
    }

    pub fn continue_hotkey_task(&self, now_ms: u64) -> Result<Option<TaskStartOutcome>, String> {
        let phase = self.runtime_snapshot().phase;
        let input_mode = self.current_input_mode();
        let decision = {
            let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
            runtime.hotkey_controller.on_interrupt_restart_timer(
                map_runtime_phase(&phase),
                input_mode,
                now_ms,
            )
        };

        match decision {
            HotkeyModeAction::StartAgentListening => self
                .start_voice_task_for_mode(VoiceInputMode::Agent)
                .map(Some),
            HotkeyModeAction::StartTranscriptionListening => self
                .start_voice_task_for_mode(VoiceInputMode::Transcription)
                .map(Some),
            HotkeyModeAction::CancelAndArmRestart => {
                let _ = self.cancel_current_operation("已中断当前语音任务，等待长按重启。");
                Ok(None)
            }
            _ => Ok(None),
        }
    }

    #[cfg(test)]
    pub fn finish_hotkey_task(&self) -> Result<Option<RuntimeSnapshot>, String> {
        let phase = self.runtime_snapshot().phase;

        match phase.as_str() {
            "正在聆听" => self.finish_voice_task().map(Some),
            _ => Ok(None),
        }
    }

    pub fn handle_hotkey_pressed(&self, now_ms: u64) -> Result<Option<TaskStartOutcome>, String> {
        let phase = self.runtime_snapshot().phase;
        let input_mode = self.current_input_mode();
        let decision = {
            let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
            runtime
                .hotkey_controller
                .on_press(map_runtime_phase(&phase), input_mode, now_ms)
        };

        match decision {
            HotkeyModeAction::StartAgentListening => self
                .start_voice_task_for_mode(VoiceInputMode::Agent)
                .map(Some),
            HotkeyModeAction::StartTranscriptionListening => self
                .start_voice_task_for_mode(VoiceInputMode::Transcription)
                .map(Some),
            HotkeyModeAction::CancelAndArmRestart => {
                let _ = self.cancel_current_operation("已中断当前语音任务，等待长按重启。");
                Ok(None)
            }
            HotkeyModeAction::Noop => Ok(None),
            _ => Ok(None),
        }
    }

    pub fn handle_hotkey_released(
        &self,
        now_ms: u64,
    ) -> Result<Option<HotkeyReleaseOutcome>, String> {
        let phase = self.runtime_snapshot().phase;
        let input_mode = self.current_input_mode();
        let decision = {
            let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
            runtime
                .hotkey_controller
                .on_release(map_runtime_phase(&phase), input_mode, now_ms)
        };

        match decision {
            HotkeyModeAction::StartAgentListening => self
                .start_voice_task_for_mode(VoiceInputMode::Agent)
                .map(HotkeyReleaseOutcome::TaskStarted)
                .map(Some),
            HotkeyModeAction::StartTranscriptionListening => self
                .start_voice_task_for_mode(VoiceInputMode::Transcription)
                .map(HotkeyReleaseOutcome::TaskStarted)
                .map(Some),
            HotkeyModeAction::FinishAgentListening
            | HotkeyModeAction::StopTranscriptionAndSubmit => self
                .finish_voice_task()
                .map(HotkeyReleaseOutcome::Snapshot)
                .map(Some),
            HotkeyModeAction::CancelAgentListening => {
                let snapshot = self.cancel_current_operation("已取消当前语音任务。");
                Ok(Some(HotkeyReleaseOutcome::Snapshot(snapshot)))
            }
            HotkeyModeAction::DismissResult => {
                let snapshot = self.dismiss_runtime_result("已关闭任务结果。");
                Ok(Some(HotkeyReleaseOutcome::Snapshot(snapshot)))
            }
            HotkeyModeAction::Noop => Ok(None),
            _ => Ok(None),
        }
    }

    pub fn start_voice_task_for_mode(
        &self,
        input_mode: VoiceInputMode,
    ) -> Result<TaskStartOutcome, String> {
        self.start_voice_task_with_mode(input_mode)
    }

    pub fn start_voice_task(&self) -> Result<TaskStartOutcome, String> {
        self.start_voice_task_with_mode(VoiceInputMode::Agent)
    }

    fn start_voice_task_with_mode(
        &self,
        input_mode: VoiceInputMode,
    ) -> Result<TaskStartOutcome, String> {
        {
            let runtime = self.runtime.lock().expect("runtime store lock poisoned");
            if runtime.active_operation_id.is_some() || runtime.active_task.is_some() {
                return Err("语音任务已在运行中".to_string());
            }
        }

        if let Err(message) = self.ensure_platform_ready_for_voice_task() {
            return Ok(self.tag_task_start_outcome_with_mode(
                TaskStartOutcome {
                    operation_id: 0,
                    snapshot: self.fail_voice_task(message),
                    events: None,
                    follow_up: None,
                },
                input_mode,
            ));
        }

        #[cfg(test)]
        {
            if let Err(message) = self.validate_config_for_voice_task(input_mode) {
                return Ok(self.tag_task_start_outcome_with_mode(
                    TaskStartOutcome {
                        operation_id: 0,
                        snapshot: self.fail_voice_task(message),
                        events: None,
                        follow_up: None,
                    },
                    input_mode,
                ));
            }

            self.start_test_voice_task()
                .map(|outcome| self.tag_task_start_outcome_with_mode(outcome, input_mode))
        }
        #[cfg(not(test))]
        {
            if let Err(message) = self.validate_config_for_voice_task(input_mode) {
                return Ok(self.tag_task_start_outcome_with_mode(
                    TaskStartOutcome {
                        operation_id: 0,
                        snapshot: self.fail_voice_task(message),
                        events: None,
                        follow_up: None,
                    },
                    input_mode,
                ));
            }

            self.start_live_voice_task()
                .map(|outcome| self.tag_task_start_outcome_with_mode(outcome, input_mode))
        }
    }

    pub fn finish_voice_task(&self) -> Result<RuntimeSnapshot, String> {
        let snapshot = {
            #[cfg(test)]
            {
                self.finish_test_voice_task()
            }
            #[cfg(not(test))]
            {
                self.finish_live_voice_task()
            }
        }?;

        Ok(snapshot_with_mode(snapshot, self.current_input_mode()))
    }

    pub fn apply_session_event(
        &self,
        operation_id: u64,
        event: DoubaoSessionEvent,
    ) -> Option<SessionEventOutcome> {
        if !self.is_current_operation(operation_id) {
            return None;
        }

        match event {
            DoubaoSessionEvent::Partial { text } | DoubaoSessionEvent::Final { text } => {
                let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
                runtime.machine.update_partial_transcript(text);
                Some(SessionEventOutcome {
                    operation_id,
                    snapshot: snapshot_with_mode(
                        runtime.machine.snapshot(),
                        runtime.active_input_mode,
                    ),
                    follow_up: None,
                })
            }
            DoubaoSessionEvent::Completed { text } => {
                let transcript = text.trim().to_string();
                if transcript.is_empty() {
                    return Some(SessionEventOutcome {
                        operation_id,
                        snapshot: self.fail_voice_task("豆包未返回可用识别文本。"),
                        follow_up: None,
                    });
                }

                let task = self.take_active_task();
                let snapshot = {
                    let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
                    let follow_up = match runtime.active_input_mode {
                        VoiceInputMode::Transcription => {
                            runtime.machine.start_inserting_with_transcript(
                                transcript.clone(),
                                "正在将转录文本输出到当前输入位置。",
                            );
                            runtime.logs.push(RuntimeLogEntry::info(
                                "豆包流式识别已完成，正在提交转录文本到当前输入位置。",
                            ));
                            SessionFollowUp::CommitTranscription(transcript.clone())
                        }
                        _ => {
                            runtime.machine.start_generating_with_transcript(
                                transcript.clone(),
                                "正在等待 OpenAI-compatible LLM 输出。",
                            );
                            runtime.logs.push(RuntimeLogEntry::info(
                                "豆包流式识别已完成，正在请求 OpenAI-compatible LLM。",
                            ));
                            SessionFollowUp::RunLlm(transcript.clone())
                        }
                    };

                    (
                        snapshot_with_mode(runtime.machine.snapshot(), runtime.active_input_mode),
                        Some(follow_up),
                    )
                };

                self.cleanup_task(task);
                Some(SessionEventOutcome {
                    operation_id,
                    snapshot: snapshot.0,
                    follow_up: snapshot.1,
                })
            }
            DoubaoSessionEvent::Error { message } => Some(SessionEventOutcome {
                operation_id,
                snapshot: self.fail_voice_task(message),
                follow_up: None,
            }),
        }
    }

    #[cfg(test)]
    pub fn apply_session_event_for_test(&self, event: DoubaoSessionEvent) -> RuntimeSnapshot {
        let operation_id = self
            .current_operation_id()
            .expect("test runtime should have an active operation");
        self.apply_session_event(operation_id, event)
            .expect("test runtime event should be applied")
            .snapshot
    }

    pub fn arm_transcription_silence_timeout(&self, operation_id: u64) -> Option<(u64, u64)> {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        if runtime.active_operation_id != Some(operation_id)
            || runtime.active_input_mode != VoiceInputMode::Transcription
            || runtime.machine.snapshot().phase != "正在聆听"
        {
            return None;
        }

        let timeout_ms = u64::from(runtime.runtime_settings.transcription_silence_timeout_ms);
        if timeout_ms == 0 {
            return None;
        }

        runtime.transcription_silence_token = runtime.transcription_silence_token.saturating_add(1);
        Some((runtime.transcription_silence_token, timeout_ms))
    }

    pub fn finish_transcription_if_silence_timeout(
        &self,
        operation_id: u64,
        token: u64,
    ) -> Option<RuntimeSnapshot> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let should_finish = runtime.active_operation_id == Some(operation_id)
            && runtime.active_input_mode == VoiceInputMode::Transcription
            && runtime.transcription_silence_token == token
            && runtime.machine.snapshot().phase == "正在聆听";
        drop(runtime);

        if !should_finish {
            return None;
        }

        self.finish_voice_task().ok()
    }

    pub fn commit_transcription_insert(
        &self,
        operation_id: u64,
        transcript: String,
    ) -> Option<RuntimeSnapshot> {
        if !self.is_current_operation(operation_id) {
            return None;
        }

        let executor = {
            let runtime = self.runtime.lock().expect("runtime store lock poisoned");
            Arc::clone(&runtime.tool_executor)
        };

        if let Err(message) = executor.execute(&automation_core::ToolExecutionRequest::type_text(
            &transcript,
        )) {
            return self.fail_tool_execution(operation_id, format!("转录文本输出失败: {message}"));
        }

        let snapshot = {
            let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
            if runtime.stored_settings.history_enabled {
                let record = runtime.machine.complete_success_with(
                    transcript.clone(),
                    "已将文本输出到当前输入位置。",
                    "本地工具执行已完成。",
                );
                runtime.history.push(record);
                let history_store_path = runtime.history_store_path.clone();
                let history = runtime.history.clone();
                if let Err(cause) = persist_history(history_store_path.as_ref(), &history) {
                    runtime.logs.push(RuntimeLogEntry::error(format!(
                        "写入本地历史记录失败: {cause}"
                    )));
                }
            }
            runtime.logs.push(RuntimeLogEntry::info(
                "转录文本已输出到当前输入位置。".to_string(),
            ));
            runtime.active_operation_id = None;
            runtime.active_input_mode = VoiceInputMode::None;
            runtime.machine.reset();
            snapshot_with_mode(runtime.machine.snapshot(), VoiceInputMode::None)
        };

        Some(snapshot)
    }

    #[cfg(test)]
    pub fn commit_transcription_insert_for_test(
        &self,
        transcript: String,
    ) -> Option<RuntimeSnapshot> {
        let operation_id = self.current_operation_id()?;
        self.commit_transcription_insert(operation_id, transcript)
    }

    pub fn run_llm_generation(
        &self,
        operation_id: u64,
        transcript: String,
    ) -> Option<LlmRunOutcome> {
        if !self.is_current_operation(operation_id) {
            return None;
        }

        let llm_service = self.build_llm_service(&transcript);
        let mcp_tools = self.available_mcp_tools();

        match llm_service.generate_with_mcp_tools(&transcript, &mcp_tools) {
            Ok(outcome) => self.apply_llm_generation_outcome(operation_id, outcome),
            Err(message) => self
                .fail_llm_generation(operation_id, message)
                .map(|snapshot| LlmRunOutcome::Completed { snapshot }),
        }
    }

    fn apply_llm_generation_outcome(
        &self,
        operation_id: u64,
        outcome: LlmGenerationOutcome,
    ) -> Option<LlmRunOutcome> {
        if !self.is_current_operation(operation_id) {
            return None;
        }

        if outcome.tool_requests.is_empty() {
            return self
                .complete_llm_generation(operation_id, outcome.text)
                .map(|snapshot| LlmRunOutcome::Completed { snapshot });
        }

        self.start_tool_execution(operation_id, &outcome.tool_requests)
            .map(|progress_snapshot| LlmRunOutcome::ToolExecutionPending {
                progress_snapshot,
                requests: outcome.tool_requests,
            })
    }

    pub fn execute_tool_requests(
        &self,
        operation_id: u64,
        requests: Vec<LlmToolRequest>,
    ) -> Option<RuntimeSnapshot> {
        if !self.is_current_operation(operation_id) {
            return None;
        }

        let executor = {
            let runtime = self.runtime.lock().expect("runtime store lock poisoned");
            Arc::clone(&runtime.tool_executor)
        };

        let mut results = Vec::with_capacity(requests.len());

        for request in &requests {
            self.push_info_log(format!(
                "开始执行 {}，参数：{}。",
                summarize_tool_request_label(request),
                summarize_tool_request_arguments(request)
            ));
            match request {
                LlmToolRequest::Local(local_request) => {
                    if let Err(message) = executor.execute(local_request) {
                        self.push_error_log(format!(
                            "{} 执行失败，参数：{}。错误：{message}",
                            summarize_tool_request_label(request),
                            summarize_tool_request_arguments(request)
                        ));
                        return self.fail_tool_execution(operation_id, message);
                    }
                    let success_message = local_request.success_message().to_string();
                    self.push_info_log(format!(
                        "{} 执行成功：{}",
                        summarize_tool_request_label(request),
                        success_message
                    ));
                    results.push(success_message);
                }
                LlmToolRequest::Mcp(call) => match self.execute_mcp_tool_request(call) {
                    Ok(result) => {
                        self.push_info_log(format!(
                            "{} 执行成功：{}",
                            summarize_tool_request_label(request),
                            result.display_text
                        ));
                        results.push(result.display_text);
                    }
                    Err(message) => {
                        self.push_error_log(format!(
                            "{} 执行失败，参数：{}。错误：{message}",
                            summarize_tool_request_label(request),
                            summarize_tool_request_arguments(request)
                        ));
                        return self.fail_tool_execution(operation_id, message);
                    }
                },
            }
        }

        let result = summarize_tool_requests(&requests, &results);
        self.complete_tool_execution(operation_id, result)
    }

    fn start_tool_execution(
        &self,
        operation_id: u64,
        requests: &[LlmToolRequest],
    ) -> Option<RuntimeSnapshot> {
        if !self.is_current_operation(operation_id) || requests.is_empty() {
            return None;
        }

        let detail = describe_tool_execution_detail(requests);
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let transcript = runtime.machine.snapshot().transcript;
        let phase = preferred_tool_runtime_phase(requests);

        match phase {
            ToolExecutionRuntimePhase::Executing => {
                runtime
                    .machine
                    .start_executing_with_transcript(transcript, detail);
            }
            ToolExecutionRuntimePhase::Inserting => {
                runtime
                    .machine
                    .start_inserting_with_transcript(transcript, detail);
            }
        }
        runtime.logs.push(RuntimeLogEntry::info(format!(
            "LLM 已返回 {} 个工具动作，正在进入本地执行。",
            requests.len()
        )));
        runtime.logs.push(RuntimeLogEntry::info(format!(
            "LLM 工具计划：{}",
            summarize_tool_request_plan(requests)
        )));

        Some(runtime.machine.snapshot())
    }

    fn complete_llm_generation(
        &self,
        operation_id: u64,
        result: impl Into<String>,
    ) -> Option<RuntimeSnapshot> {
        if !self.is_current_operation(operation_id) {
            return None;
        }

        let result = result.into();
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let record =
            runtime
                .machine
                .complete_success_with("", result, "OpenAI-compatible LLM 输出已完成。");
        let snapshot = snapshot_with_mode(runtime.machine.snapshot(), runtime.active_input_mode);
        runtime.active_operation_id = None;

        if runtime.stored_settings.history_enabled {
            runtime.history.push(record);
            let history_store_path = runtime.history_store_path.clone();
            let history = runtime.history.clone();

            if let Err(cause) = persist_history(history_store_path.as_ref(), &history) {
                runtime.logs.push(RuntimeLogEntry::error(format!(
                    "写入本地历史记录失败: {cause}"
                )));
            }
        }
        runtime
            .logs
            .push(RuntimeLogEntry::info("OpenAI-compatible LLM 输出已完成。"));

        Some(snapshot)
    }

    fn complete_tool_execution(
        &self,
        operation_id: u64,
        result: impl Into<String>,
    ) -> Option<RuntimeSnapshot> {
        if !self.is_current_operation(operation_id) {
            return None;
        }

        let result = result.into();
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let record = runtime
            .machine
            .complete_success_with("", result, "本地工具执行已完成。");
        let snapshot = snapshot_with_mode(runtime.machine.snapshot(), runtime.active_input_mode)
            .with_result_window_mode(RESULT_WINDOW_MODE_HIDDEN);
        runtime.active_operation_id = None;

        if runtime.stored_settings.history_enabled {
            runtime.history.push(record);
            let history_store_path = runtime.history_store_path.clone();
            let history = runtime.history.clone();

            if let Err(cause) = persist_history(history_store_path.as_ref(), &history) {
                runtime.logs.push(RuntimeLogEntry::error(format!(
                    "写入本地历史记录失败: {cause}"
                )));
            }
        }
        runtime
            .logs
            .push(RuntimeLogEntry::info("本地工具执行已完成。"));

        Some(snapshot)
    }

    fn fail_llm_generation(
        &self,
        operation_id: u64,
        message: impl Into<String>,
    ) -> Option<RuntimeSnapshot> {
        if !self.is_current_operation(operation_id) {
            return None;
        }

        let message = message.into();
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let record = runtime
            .machine
            .complete_error_with("", "生成失败", message.clone());
        let snapshot = snapshot_with_mode(runtime.machine.snapshot(), runtime.active_input_mode);
        runtime.active_operation_id = None;

        if runtime.stored_settings.history_enabled {
            runtime.history.push(record);
            let history_store_path = runtime.history_store_path.clone();
            let history = runtime.history.clone();

            if let Err(cause) = persist_history(history_store_path.as_ref(), &history) {
                runtime.logs.push(RuntimeLogEntry::error(format!(
                    "写入本地历史记录失败: {cause}"
                )));
            }
        }
        runtime.logs.push(RuntimeLogEntry::error(message));

        Some(snapshot)
    }

    fn fail_tool_execution(
        &self,
        operation_id: u64,
        message: impl Into<String>,
    ) -> Option<RuntimeSnapshot> {
        if !self.is_current_operation(operation_id) {
            return None;
        }

        let message = message.into();
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let record = runtime
            .machine
            .complete_error_with("", "工具执行失败", message.clone());
        let snapshot = snapshot_with_mode(runtime.machine.snapshot(), runtime.active_input_mode);
        runtime.active_operation_id = None;

        if runtime.stored_settings.history_enabled {
            runtime.history.push(record);
            let history_store_path = runtime.history_store_path.clone();
            let history = runtime.history.clone();

            if let Err(cause) = persist_history(history_store_path.as_ref(), &history) {
                runtime.logs.push(RuntimeLogEntry::error(format!(
                    "写入本地历史记录失败: {cause}"
                )));
            }
        }
        runtime.logs.push(RuntimeLogEntry::error(message));

        Some(snapshot)
    }

    #[cfg(test)]
    pub fn complete_llm_generation_for_test(&self, result: impl Into<String>) -> RuntimeSnapshot {
        let operation_id = self
            .current_operation_id()
            .expect("test runtime should have an active operation");
        self.complete_llm_generation(operation_id, result)
            .expect("llm generation should complete")
    }

    #[cfg(test)]
    pub fn complete_llm_tool_requests_for_test(
        &self,
        requests: Vec<LlmToolRequest>,
    ) -> RuntimeSnapshot {
        let operation_id = self
            .current_operation_id()
            .expect("test runtime should have an active operation");
        let outcome = self
            .apply_llm_generation_outcome(
                operation_id,
                LlmGenerationOutcome {
                    text: String::new(),
                    tool_requests: requests,
                },
            )
            .expect("llm outcome should be accepted");

        match outcome {
            LlmRunOutcome::Completed { snapshot } => snapshot,
            LlmRunOutcome::ToolExecutionPending { requests, .. } => self
                .execute_tool_requests(operation_id, requests)
                .expect("tool execution should finish"),
        }
    }

    #[cfg(test)]
    pub fn fail_llm_generation_for_test(&self, message: impl Into<String>) -> RuntimeSnapshot {
        let operation_id = self
            .current_operation_id()
            .expect("test runtime should have an active operation");
        self.fail_llm_generation(operation_id, message)
            .expect("llm generation should fail")
    }

    #[cfg(test)]
    fn start_test_voice_task(&self) -> Result<TaskStartOutcome, String> {
        if let Err(message) = self.build_doubao_config() {
            return Ok(TaskStartOutcome {
                operation_id: 0,
                snapshot: self.fail_voice_task(message),
                events: None,
                follow_up: None,
            });
        }

        let operation_id = self.begin_operation();
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.active_operation_id = Some(operation_id);
        runtime.active_task = Some(ActiveVoiceTask {
            capture: Some(ActiveCapture::Test),
            session: None,
        });
        runtime.machine.start_listening();
        runtime.logs.push(RuntimeLogEntry::info(
            "测试语音任务已开始，状态进入正在聆听。",
        ));
        let snapshot = runtime.machine.snapshot();
        drop(runtime);
        activate_audio_waveform_stream(&self.waveform);

        Ok(TaskStartOutcome {
            operation_id,
            snapshot,
            events: None,
            follow_up: None,
        })
    }

    #[cfg(test)]
    fn finish_test_voice_task(&self) -> Result<RuntimeSnapshot, String> {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let Some(active_task) = runtime.active_task.as_mut() else {
            return Err("当前没有活动的语音任务".to_string());
        };

        if active_task.capture.take().is_none() {
            return Err("麦克风采集未启动".to_string());
        }

        runtime.machine.finish_listening();
        runtime.logs.push(RuntimeLogEntry::info(
            "测试语音任务已结束录音，等待豆包完成识别。",
        ));
        let snapshot = runtime.machine.snapshot();
        drop(runtime);
        deactivate_audio_waveform_stream(&self.waveform);

        Ok(snapshot)
    }

    #[cfg(not(test))]
    fn start_live_voice_task(&self) -> Result<TaskStartOutcome, String> {
        let config = match self.build_doubao_config() {
            Ok(config) => config,
            Err(message) => {
                return Ok(TaskStartOutcome {
                    operation_id: 0,
                    snapshot: self.fail_voice_task(message),
                    events: None,
                    follow_up: None,
                });
            }
        };
        let target_audio_rate = config.audio_rate;
        let preferred_microphone_device_id = {
            let runtime = self.runtime.lock().expect("runtime store lock poisoned");
            runtime.stored_settings.microphone_device_id.clone()
        };

        let (session, events) = match DoubaoStreamingSession::connect(config) {
            Ok(value) => value,
            Err(cause) => {
                return Ok(TaskStartOutcome {
                    operation_id: 0,
                    snapshot: self.fail_voice_task(cause.to_string()),
                    events: None,
                    follow_up: None,
                });
            }
        };
        let client = session.client();
        let waveform = Arc::clone(&self.waveform);
        let (capture, capture_ready) =
            match MicrophoneRecordingSession::start_with_preferred_device_and_chunk_callback(
                Some(preferred_microphone_device_id.as_str()),
                target_audio_rate,
                move |chunk| {
                    let _ = client.append_audio(samples_to_pcm_bytes(chunk));
                    push_audio_waveform_samples(&waveform, chunk);
                },
            ) {
                Ok(value) => value,
                Err(cause) => {
                    let _ = session.close();
                    return Ok(TaskStartOutcome {
                        operation_id: 0,
                        snapshot: self.fail_voice_task(format!("启动麦克风失败: {cause}")),
                        events: None,
                        follow_up: None,
                    });
                }
            };

        let operation_id = self.begin_operation();
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.active_operation_id = Some(operation_id);
        runtime.active_task = Some(ActiveVoiceTask {
            capture: Some(ActiveCapture::Microphone(capture)),
            session: Some(session),
        });
        runtime.machine.start_listening();
        if capture_ready.used_fallback {
            runtime.logs.push(RuntimeLogEntry::info(format!(
                "已保存麦克风不可用，已回退到系统默认麦克风：{}。",
                capture_ready.selected_device_label
            )));
        } else {
            runtime.logs.push(RuntimeLogEntry::info(format!(
                "已启动麦克风：{}。",
                capture_ready.selected_device_label
            )));
        }
        runtime.logs.push(RuntimeLogEntry::info(
            "已连接豆包流式识别，开始接收实时音频。",
        ));
        let snapshot = runtime.machine.snapshot();
        drop(runtime);
        activate_audio_waveform_stream(&self.waveform);

        Ok(TaskStartOutcome {
            operation_id,
            snapshot,
            events: Some(events),
            follow_up: None,
        })
    }

    #[cfg(not(test))]
    fn finish_live_voice_task(&self) -> Result<RuntimeSnapshot, String> {
        let mut task = self
            .take_active_task()
            .ok_or_else(|| "当前没有活动的语音任务".to_string())?;

        let clip = match task.capture.take() {
            Some(ActiveCapture::Microphone(capture)) => {
                capture.stop().map_err(|cause| cause.to_string())?
            }
            #[cfg(test)]
            Some(ActiveCapture::Test) => return Err("测试采集不能用于生产路径".to_string()),
            None => return Err("麦克风采集未启动".to_string()),
        };

        if let Some(session) = task.session.as_ref() {
            if let Err(cause) = session.commit() {
                self.cleanup_task(Some(task));
                return Ok(self.fail_voice_task(format!("提交豆包流式识别失败: {cause}")));
            }
        }

        let snapshot = {
            let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
            runtime.active_task = Some(task);
            runtime.machine.finish_listening();
            runtime.logs.push(RuntimeLogEntry::info(format!(
                "已停止麦克风采集，录音时长 {} ms，等待豆包完成识别。",
                clip.duration_ms()
            )));
            let snapshot = runtime.machine.snapshot();
            drop(runtime);
            deactivate_audio_waveform_stream(&self.waveform);
            snapshot
        };

        Ok(snapshot)
    }

    fn fail_voice_task(&self, message: impl Into<String>) -> RuntimeSnapshot {
        let task = self.take_active_task();
        let message = message.into();
        let snapshot = {
            let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
            runtime.active_operation_id = None;
            let record = runtime
                .machine
                .complete_error_with("", "识别失败", message.clone());
            let snapshot =
                snapshot_with_mode(runtime.machine.snapshot(), runtime.active_input_mode);

            if runtime.stored_settings.history_enabled {
                runtime.history.push(record);
                let history_store_path = runtime.history_store_path.clone();
                let history = runtime.history.clone();

                if let Err(cause) = persist_history(history_store_path.as_ref(), &history) {
                    runtime.logs.push(RuntimeLogEntry::error(format!(
                        "写入本地历史记录失败: {cause}"
                    )));
                }
            }
            runtime.logs.push(RuntimeLogEntry::error(message));

            snapshot
        };

        self.cleanup_task(task);
        deactivate_audio_waveform_stream(&self.waveform);
        snapshot
    }

    fn take_active_task(&self) -> Option<ActiveVoiceTask> {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.active_task.take()
    }

    fn cleanup_task(&self, task: Option<ActiveVoiceTask>) {
        let Some(mut task) = task else {
            return;
        };

        if let Some(capture) = task.capture.take() {
            match capture {
                ActiveCapture::Microphone(capture) => {
                    let _ = capture.stop();
                }
                #[cfg(test)]
                ActiveCapture::Test => {}
            }
        }

        if let Some(session) = task.session.take() {
            let _ = session.close();
        }
    }

    fn settings_store_path(&self) -> Result<PathBuf, String> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime
            .settings_store_path
            .clone()
            .ok_or_else(|| "设置存储尚未初始化。".to_string())
    }

    fn build_doubao_config(&self) -> Result<DoubaoAsrConfig, String> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        DoubaoAsrConfig::from_settings(&runtime.stored_settings).map_err(|cause| cause.to_string())
    }

    fn build_llm_service(&self, current_turn_user_text: &str) -> OpenAiCompatibleLlmService {
        let (settings, skill_bundle_root) = {
            let runtime = self.runtime.lock().expect("runtime store lock poisoned");
            (
                runtime.stored_settings.clone(),
                runtime.skill_bundle_root.clone(),
            )
        };
        let prompt_assets = match crate::skill_bundles::resolve_angrymiao_prompt_assets(
            skill_bundle_root.as_deref(),
            &settings,
        ) {
            Ok(value) => value,
            Err(cause) => {
                self.push_error_log(format!("读取 AngryMiao skill prompt 失败: {cause}"));
                None
            }
        };
        let config = OpenAiCompatibleLlmConfig::from_settings_for_turn(
            &settings,
            current_turn_user_text,
            prompt_assets
                .as_ref()
                .map(|assets| assets.prompt_template.as_str()),
            prompt_assets
                .as_ref()
                .map(|assets| assets.hid_reference.as_str()),
        );
        OpenAiCompatibleLlmService::new(config)
    }

    fn available_mcp_tools(&self) -> Vec<McpToolDescriptor> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.mcp_runtime.available_tools()
    }

    fn execute_mcp_tool_request(
        &self,
        call: &McpToolCall,
    ) -> Result<mcp_core::McpToolCallResult, String> {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.mcp_runtime.call_tool(call)
    }

    fn ensure_platform_ready_for_voice_task(&self) -> Result<(), String> {
        let diagnostics = self.platform_diagnostics();
        if !diagnostics.supported {
            return Err("当前平台暂不支持语音任务。".to_string());
        }

        if !diagnostics.microphone_available {
            return Err("未检测到可用麦克风输入设备。".to_string());
        }

        Ok(())
    }

    fn validate_llm_config_for_voice_task(&self) -> Result<(), String> {
        self.build_llm_service("").validate_config()
    }

    fn validate_config_for_voice_task(&self, input_mode: VoiceInputMode) -> Result<(), String> {
        if input_mode != VoiceInputMode::Transcription {
            self.validate_llm_config_for_voice_task()?;
        }

        Ok(())
    }

    fn begin_operation(&self) -> u64 {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        let operation_id = runtime.next_operation_id;
        runtime.next_operation_id = runtime.next_operation_id.saturating_add(1);
        operation_id
    }

    fn current_operation_id(&self) -> Option<u64> {
        let runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.active_operation_id
    }

    fn is_current_operation(&self, operation_id: u64) -> bool {
        self.current_operation_id() == Some(operation_id)
    }

    fn tag_task_start_outcome_with_mode(
        &self,
        mut outcome: TaskStartOutcome,
        input_mode: VoiceInputMode,
    ) -> TaskStartOutcome {
        {
            let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
            runtime.active_input_mode = input_mode;
        }
        outcome.snapshot = snapshot_with_mode(outcome.snapshot, input_mode);
        outcome
    }

    fn cancel_current_operation(&self, message: impl Into<String>) -> RuntimeSnapshot {
        let task = self.take_active_task();
        let message = message.into();
        let snapshot = {
            let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
            runtime.active_operation_id = None;
            runtime.active_input_mode = VoiceInputMode::None;
            runtime.machine.reset();
            runtime.logs.push(RuntimeLogEntry::info(message));
            snapshot_with_mode(runtime.machine.snapshot(), VoiceInputMode::None)
        };

        self.cleanup_task(task);
        deactivate_audio_waveform_stream(&self.waveform);
        snapshot
    }

    pub fn dismiss_runtime_result(&self, message: impl Into<String>) -> RuntimeSnapshot {
        let message = message.into();
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.active_operation_id = None;
        runtime.active_input_mode = VoiceInputMode::None;
        runtime.machine.reset();
        runtime.logs.push(RuntimeLogEntry::info(message));
        let snapshot = snapshot_with_mode(runtime.machine.snapshot(), VoiceInputMode::None);
        drop(runtime);
        deactivate_audio_waveform_stream(&self.waveform);
        snapshot
    }
}

fn activate_audio_waveform_stream(waveform: &Arc<Mutex<AudioWaveformStream>>) {
    let frame = {
        let mut stream = waveform.lock().expect("waveform lock poisoned");
        stream.activate()
    };
    broadcast_audio_waveform_frame(waveform, frame);
}

fn deactivate_audio_waveform_stream(waveform: &Arc<Mutex<AudioWaveformStream>>) {
    let frame = {
        let mut stream = waveform.lock().expect("waveform lock poisoned");
        stream.deactivate()
    };
    broadcast_audio_waveform_frame(waveform, frame);
}

#[cfg_attr(test, allow(dead_code))]
fn push_audio_waveform_samples(waveform: &Arc<Mutex<AudioWaveformStream>>, chunk: &[i16]) {
    let frame = {
        let mut stream = waveform.lock().expect("waveform lock poisoned");
        stream.push_samples(chunk)
    };

    if let Some(frame) = frame {
        broadcast_audio_waveform_frame(waveform, frame);
    }
}

fn broadcast_audio_waveform_frame(
    waveform: &Arc<Mutex<AudioWaveformStream>>,
    frame: AudioWaveformFrame,
) {
    let channels = {
        let stream = waveform.lock().expect("waveform lock poisoned");
        stream.subscriber_channels()
    };
    let mut failed_labels = Vec::new();

    for (window_label, channel) in channels {
        if channel.send(frame.clone()).is_err() {
            failed_labels.push(window_label);
        }
    }

    if !failed_labels.is_empty() {
        let mut stream = waveform.lock().expect("waveform lock poisoned");
        stream.remove_subscribers(&failed_labels);
    }
}

fn build_runtime_store(
    settings: StoredVoiceSettings,
    platform_diagnostics: PlatformDiagnostics,
    tool_executor: Arc<dyn ToolExecutor>,
    mcp_runtime: McpRuntime,
) -> RuntimeStore {
    let editable_settings = SettingsStore::snapshot(&settings);
    let runtime_settings = RuntimeVoiceSettings::from_settings(&settings);

    RuntimeStore {
        machine: RuntimeMachine::default(),
        history: Vec::new(),
        app_data_dir: None,
        history_store_path: None,
        settings_store_path: None,
        skill_bundle_root: None,
        logs: build_startup_logs(&platform_diagnostics),
        platform_diagnostics,
        stored_settings: settings,
        editable_settings,
        runtime_settings,
        active_task: None,
        active_operation_id: None,
        next_operation_id: 1,
        hotkey_controller: HotkeyModeController::default(),
        active_input_mode: VoiceInputMode::None,
        transcription_silence_token: 0,
        tool_executor,
        mcp_runtime,
        mcp_last_sync_error: None,
    }
}

fn build_mcp_server_runtime_diagnostics(
    config: &mcp_core::McpServerConfig,
    defined_in_settings: bool,
    active_in_runtime: bool,
) -> McpServerRuntimeDiagnostics {
    match &config.transport {
        mcp_core::McpTransportConfig::Stdio { command, args, .. } => McpServerRuntimeDiagnostics {
            id: config.id.clone(),
            name: config.name.clone(),
            enabled: config.enabled,
            source: if defined_in_settings {
                "settings.json".to_string()
            } else {
                "builtin-skill-bundle".to_string()
            },
            active_in_runtime,
            transport: "stdio".to_string(),
            command: command.clone(),
            args: args.clone(),
        },
    }
}

fn replace_settings(runtime: &mut RuntimeStore, settings: StoredVoiceSettings) {
    runtime.runtime_settings = RuntimeVoiceSettings::from_settings(&settings);
    runtime.editable_settings = SettingsStore::snapshot(&settings);
    runtime.stored_settings = settings;
}

fn sync_mcp_runtime(runtime: &mut RuntimeStore) -> Result<(), String> {
    let server_configs = match crate::skill_bundles::resolve_builtin_mcp_servers(
        runtime.skill_bundle_root.as_deref(),
        &runtime.stored_settings,
    ) {
        Ok(configs) => configs,
        Err(cause) => {
            runtime.mcp_last_sync_error = Some(cause.clone());
            return Err(cause);
        }
    };

    if let Err(cause) = runtime.mcp_runtime.sync_servers(&server_configs) {
        runtime.mcp_last_sync_error = Some(cause.clone());
        return Err(cause);
    }

    runtime.mcp_last_sync_error = None;
    let enabled_servers = server_configs
        .iter()
        .filter(|server| server.enabled)
        .count();
    let tool_count = runtime.mcp_runtime.available_tools().len();

    if enabled_servers == 0 {
        runtime.logs.push(RuntimeLogEntry::info(
            "MCP 未配置启用中的 server，已跳过工具同步。",
        ));
    } else {
        runtime.logs.push(RuntimeLogEntry::info(format!(
            "MCP runtime 已同步 {} 个 server，发现 {} 个工具。",
            enabled_servers, tool_count
        )));
    }

    Ok(())
}

fn persist_history(path: Option<&PathBuf>, history: &[HistoryRecord]) -> Result<(), String> {
    let Some(path) = path else {
        return Ok(());
    };

    save_history_records(path, history)
}

fn build_startup_logs(platform_diagnostics: &PlatformDiagnostics) -> RuntimeLogStore {
    let mut logs = RuntimeLogStore::default();
    logs.push(RuntimeLogEntry::info("语音运行时已就绪。"));

    let support_label = if platform_diagnostics.supported {
        "当前构建已支持该平台"
    } else {
        "当前构建暂不支持该平台"
    };
    logs.push(RuntimeLogEntry::info(format!(
        "平台诊断：平台 {}，{}。",
        platform_diagnostics.platform_name, support_label
    )));

    if platform_diagnostics.microphone_available {
        logs.push(RuntimeLogEntry::info(
            "平台诊断：已检测到可用麦克风输入设备。",
        ));
    } else {
        logs.push(RuntimeLogEntry::error(
            "平台诊断：未检测到可用麦克风输入设备，语音录音将无法开始。",
        ));
    }

    if let Some(permission_hint) = &platform_diagnostics.permission_hint {
        logs.push(RuntimeLogEntry::info(format!(
            "平台诊断：{permission_hint}"
        )));
    }

    logs.push(RuntimeLogEntry::info(format!(
        "平台诊断：麦克风权限 {}，输入控制 {}。",
        platform_diagnostics.microphone_permission_status,
        platform_diagnostics.input_control_permission_status
    )));
    logs.push(RuntimeLogEntry::info(format!(
        "平台诊断：热键后端 {}。",
        platform_diagnostics.hotkey_backend
    )));

    logs
}

fn map_runtime_phase(phase: &str) -> RuntimeHotkeyPhase {
    match phase {
        "正在聆听" => RuntimeHotkeyPhase::Listening,
        "正在识别" => RuntimeHotkeyPhase::Processing,
        "正在生成" | "正在执行" | "正在输出" => RuntimeHotkeyPhase::Generating,
        "已完成" => RuntimeHotkeyPhase::Done,
        "识别失败" => RuntimeHotkeyPhase::Error,
        _ => RuntimeHotkeyPhase::Idle,
    }
}

fn snapshot_with_mode(
    mut snapshot: RuntimeSnapshot,
    input_mode: VoiceInputMode,
) -> RuntimeSnapshot {
    snapshot.input_mode = input_mode.as_contract_str().to_string();
    snapshot.result_window_mode = if input_mode == VoiceInputMode::Transcription {
        RESULT_WINDOW_MODE_HIDDEN.to_string()
    } else {
        RESULT_WINDOW_MODE_AUTO.to_string()
    };
    snapshot
}

fn preferred_tool_runtime_phase(requests: &[LlmToolRequest]) -> ToolExecutionRuntimePhase {
    if requests
        .iter()
        .all(|request| tool_request_runtime_phase(request) == ToolExecutionRuntimePhase::Inserting)
    {
        ToolExecutionRuntimePhase::Inserting
    } else {
        ToolExecutionRuntimePhase::Executing
    }
}

fn describe_tool_execution_detail(requests: &[LlmToolRequest]) -> String {
    if requests.len() == 1 {
        return tool_request_progress_detail(&requests[0]);
    }

    match preferred_tool_runtime_phase(requests) {
        ToolExecutionRuntimePhase::Executing => {
            format!("正在执行 {} 个工具动作。", requests.len())
        }
        ToolExecutionRuntimePhase::Inserting => {
            format!("正在输出 {} 段文本到当前焦点。", requests.len())
        }
    }
}

fn summarize_tool_request_plan(requests: &[LlmToolRequest]) -> String {
    requests
        .iter()
        .map(summarize_tool_request_brief)
        .collect::<Vec<_>>()
        .join("；")
}

fn summarize_tool_requests(requests: &[LlmToolRequest], results: &[String]) -> String {
    if requests.len() == 1 {
        return results
            .first()
            .cloned()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "已完成 MCP 工具调用。".to_string());
    }

    format!("已完成 {} 个工具动作。", requests.len())
}

fn tool_request_runtime_phase(request: &LlmToolRequest) -> ToolExecutionRuntimePhase {
    match request {
        LlmToolRequest::Local(request) => request.runtime_phase(),
        LlmToolRequest::Mcp(_) => ToolExecutionRuntimePhase::Executing,
    }
}

fn tool_request_progress_detail(request: &LlmToolRequest) -> String {
    match request {
        LlmToolRequest::Local(request) => request.progress_detail().to_string(),
        LlmToolRequest::Mcp(call) => {
            format!("正在执行 MCP 工具 {}。", call.tool_name)
        }
    }
}

fn summarize_tool_request_brief(request: &LlmToolRequest) -> String {
    match request {
        LlmToolRequest::Local(local_request) => match local_request {
            automation_core::ToolExecutionRequest::TypeText { text } => {
                format!("Local type_text(text=\"{}\")", summarize_text_for_log(text))
            }
            automation_core::ToolExecutionRequest::OpenUrl { url } => {
                format!("Local open_url(url={})", summarize_url_for_log(url))
            }
        },
        LlmToolRequest::Mcp(call) => format!(
            "MCP {}({})",
            call.tool_name,
            summarize_mcp_arguments(&call.arguments)
        ),
    }
}

fn summarize_tool_request_label(request: &LlmToolRequest) -> String {
    match request {
        LlmToolRequest::Local(local_request) => match local_request {
            automation_core::ToolExecutionRequest::TypeText { .. } => {
                "本地工具 type_text".to_string()
            }
            automation_core::ToolExecutionRequest::OpenUrl { .. } => {
                "本地工具 open_url".to_string()
            }
        },
        LlmToolRequest::Mcp(call) => format!("MCP 工具 {}", call.tool_name),
    }
}

fn summarize_tool_request_arguments(request: &LlmToolRequest) -> String {
    match request {
        LlmToolRequest::Local(local_request) => match local_request {
            automation_core::ToolExecutionRequest::TypeText { text } => {
                format!("text=\"{}\"", summarize_text_for_log(text))
            }
            automation_core::ToolExecutionRequest::OpenUrl { url } => {
                format!("url={}", summarize_url_for_log(url))
            }
        },
        LlmToolRequest::Mcp(call) => summarize_mcp_arguments(&call.arguments),
    }
}

fn summarize_mcp_arguments(arguments: &serde_json::Value) -> String {
    let Some(object) = arguments.as_object() else {
        return summarize_json_value(arguments);
    };

    let mut keys = object.keys().cloned().collect::<Vec<_>>();
    keys.sort();
    let parts = keys
        .into_iter()
        .filter_map(|key| {
            object
                .get(&key)
                .map(|value| summarize_named_argument(&key, value))
        })
        .collect::<Vec<_>>();

    if parts.is_empty() {
        "无参数".to_string()
    } else {
        parts.join(", ")
    }
}

fn summarize_named_argument(name: &str, value: &serde_json::Value) -> String {
    match (name, value) {
        ("text", serde_json::Value::String(text)) => {
            format!("text=\"{}\"", summarize_text_for_log(text))
        }
        ("url", serde_json::Value::String(url)) => {
            format!("url={}", summarize_url_for_log(url))
        }
        ("shortcut", serde_json::Value::String(shortcut)) => {
            format!("shortcut={}", summarize_short_string(shortcut, 40))
        }
        ("browser", serde_json::Value::String(browser)) => {
            format!("browser={}", summarize_short_string(browser, 20))
        }
        ("appName", serde_json::Value::String(app_name)) => {
            format!("appName=\"{}\"", summarize_short_string(app_name, 40))
        }
        ("recordedKeys", serde_json::Value::Array(values)) => {
            format!("recordedKeys={}", summarize_string_array(values, 6))
        }
        ("keyCodes", serde_json::Value::Array(values)) => {
            format!("keyCodes={}", summarize_key_codes(values))
        }
        ("confirmed", serde_json::Value::Bool(value)) => format!("confirmed={value}"),
        _ => format!("{name}={}", summarize_json_value(value)),
    }
}

fn summarize_key_codes(values: &[serde_json::Value]) -> String {
    if values.is_empty() {
        return "[]".to_string();
    }

    let preview = values
        .iter()
        .take(3)
        .map(summarize_json_value)
        .collect::<Vec<_>>()
        .join(", ");
    let suffix = if values.len() > 3 { ", ..." } else { "" };

    format!("len={}, preview=[{}{}]", values.len(), preview, suffix)
}

fn summarize_string_array(values: &[serde_json::Value], max_items: usize) -> String {
    let preview = values
        .iter()
        .take(max_items)
        .map(summarize_json_value)
        .collect::<Vec<_>>()
        .join(", ");
    let suffix = if values.len() > max_items {
        ", ..."
    } else {
        ""
    };

    format!("[{}{}]", preview, suffix)
}

fn summarize_json_value(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(text) => summarize_short_string(text, 60),
        serde_json::Value::Number(number) => number.to_string(),
        serde_json::Value::Bool(value) => value.to_string(),
        serde_json::Value::Null => "null".to_string(),
        _ => summarize_short_string(&value.to_string(), 60),
    }
}

fn summarize_url_for_log(url: &str) -> String {
    summarize_short_string(url, 120)
}

fn summarize_text_for_log(text: &str) -> String {
    summarize_short_string(text, 80)
}

fn summarize_short_string(value: &str, max_len: usize) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = compact.chars();
    let truncated = chars.by_ref().take(max_len).collect::<String>();

    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        truncated
    }
}

fn backup_corrupted_history_file(path: &Path) -> Result<PathBuf, String> {
    let parent = path
        .parent()
        .ok_or_else(|| "历史记录文件路径缺少父目录。".to_string())?;
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("history");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("json");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|cause| format!("生成历史记录备份时间戳失败: {cause}"))?
        .as_secs();
    let backup_path = parent.join(format!("{stem}.corrupted.{timestamp}.{extension}"));

    std::fs::rename(path, &backup_path)
        .map_err(|cause| format!("备份损坏的历史记录文件失败: {cause}"))?;

    Ok(backup_path)
}

#[cfg(not(test))]
fn samples_to_pcm_bytes(samples: &[i16]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for sample in samples {
        bytes.extend_from_slice(&sample.to_le_bytes());
    }
    bytes
}

#[cfg(test)]
fn test_stored_settings() -> StoredVoiceSettings {
    let mut settings = StoredVoiceSettings::default();
    settings.doubao_asr_url = "ws://127.0.0.1/test".to_string();
    settings.doubao_asr_app_id = "test-app-id".to_string();
    settings.doubao_asr_access_token = "test-token".to_string();
    settings.llm_api_key = "test-llm-key".to_string();
    settings
}

#[cfg(test)]
fn test_platform_diagnostics() -> PlatformDiagnostics {
    PlatformDiagnostics::new(
        "TestOS",
        true,
        true,
        "可用",
        "待验证",
        "待初始化",
        None,
        false,
        "voice-app",
        false,
        None,
        Some("测试环境下使用固定平台诊断。".to_string()),
    )
}

#[cfg(test)]
fn test_mcp_server_config() -> mcp_core::McpServerConfig {
    mcp_core::McpServerConfig::stdio(
        "system-control",
        "System Control",
        "fake-mcp-server",
        Vec::new(),
        Default::default(),
    )
}

#[cfg(test)]
#[derive(Default)]
struct StaticToolExecutor {
    failure: Option<String>,
}

#[cfg(test)]
impl ToolExecutor for StaticToolExecutor {
    fn execute(&self, request: &automation_core::ToolExecutionRequest) -> Result<(), String> {
        request.validate()?;

        if let Some(message) = &self.failure {
            return Err(message.clone());
        }

        Ok(())
    }
}

#[cfg(test)]
#[derive(Clone, Default)]
struct StaticMcpTransportFactory {
    sent_messages: std::sync::Arc<std::sync::Mutex<Vec<serde_json::Value>>>,
}

#[cfg(test)]
struct StaticMcpTransport {
    sent_messages: std::sync::Arc<std::sync::Mutex<Vec<serde_json::Value>>>,
    last_request: Option<serde_json::Value>,
}

#[cfg(test)]
impl mcp_core::McpTransport for StaticMcpTransport {
    fn send_json(&mut self, message: &serde_json::Value) -> Result<(), String> {
        self.sent_messages
            .lock()
            .expect("mcp sent messages lock should succeed")
            .push(message.clone());
        self.last_request = Some(message.clone());
        Ok(())
    }

    fn recv_json(&mut self) -> Result<serde_json::Value, String> {
        let request = self
            .last_request
            .take()
            .ok_or_else(|| "expected queued MCP request".to_string())?;
        let request_id = request["id"].clone();

        match request["method"].as_str() {
            Some("initialize") => Ok(serde_json::json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "protocolVersion": "2025-11-05",
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "system-control", "version": "1.0.0" }
                }
            })),
            Some("tools/list") => Ok(serde_json::json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "tools": [
                        {
                            "name": "type_text",
                            "description": "通过 MCP 输出文本",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "text": { "type": "string" }
                                },
                                "required": ["text"]
                            }
                        }
                    ]
                }
            })),
            Some("tools/call") => Ok(serde_json::json!({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "content": [
                        { "type": "text", "text": "MCP 已输出文本。" }
                    ],
                    "isError": false
                }
            })),
            _ => Err("unexpected MCP method".to_string()),
        }
    }

    fn close(&mut self) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(test)]
impl mcp_core::McpTransportFactory for StaticMcpTransportFactory {
    fn connect(
        &self,
        _config: &mcp_core::McpServerConfig,
    ) -> Result<Box<dyn mcp_core::McpTransport>, String> {
        Ok(Box::new(StaticMcpTransport {
            sent_messages: std::sync::Arc::clone(&self.sent_messages),
            last_request: None,
        }))
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use asr_core::DoubaoSessionEvent;
    use automation_core::{VoiceInputMode, HOTKEY_RESTART_THRESHOLD_MS};
    use history_core::{load_history_records, save_history_records, HistoryRecord};
    use llm_core::LlmToolRequest;
    use mcp_core::McpToolCall;
    use serde_json::json;
    use settings_core::{EditableSecretValueInput, SaveEditableVoiceSettingsInput};

    use super::{AppState, HotkeyReleaseOutcome, SessionFollowUp};

    fn expect_release_snapshot(
        outcome: Option<HotkeyReleaseOutcome>,
        context: &str,
    ) -> ipc_contract::RuntimeSnapshot {
        match outcome.expect(context) {
            HotkeyReleaseOutcome::Snapshot(snapshot) => snapshot,
            HotkeyReleaseOutcome::TaskStarted(outcome) => outcome.snapshot,
        }
    }

    #[test]
    fn hotkey_press_from_idle_enters_listening() {
        let state = AppState::for_test();
        let outcome = state
            .begin_hotkey_task()
            .expect("hotkey press should not fail")
            .expect("idle runtime should react to hotkey press");

        assert_eq!(outcome.snapshot.phase, "正在聆听");
        assert!(outcome.events.is_none());
    }

    #[test]
    fn hotkey_release_from_listening_enters_processing() {
        let state = AppState::for_test();
        state
            .begin_hotkey_task()
            .expect("hotkey press should not fail");

        let snapshot = state
            .finish_hotkey_task()
            .expect("hotkey release should not fail")
            .expect("listening runtime should react to hotkey release");

        assert_eq!(snapshot.phase, "正在识别");
        assert_eq!(snapshot.detail, "正在等待豆包返回最终识别结果。");
    }

    #[test]
    fn short_tap_from_idle_does_not_start_listening() {
        let state = AppState::for_test();

        let pressed = state
            .handle_hotkey_pressed(1_000)
            .expect("hotkey press should not fail");
        assert!(pressed.is_none());

        let released = state
            .handle_hotkey_released(1_100)
            .expect("hotkey release should not fail");
        assert!(released.is_none());

        assert_eq!(state.runtime_snapshot().phase, "待命中");
        assert!(state.history_records().is_empty());
    }

    #[test]
    fn long_hold_from_idle_starts_listening_after_threshold() {
        let state = AppState::for_test();

        let pressed = state
            .handle_hotkey_pressed(1_000)
            .expect("hotkey press should not fail");
        assert!(pressed.is_none());

        let snapshot = state
            .continue_hotkey_task(1_000 + HOTKEY_RESTART_THRESHOLD_MS)
            .expect("threshold timer should not fail")
            .expect("long hold should start listening")
            .snapshot;
        assert_eq!(snapshot.phase, "正在聆听");

        let snapshot = state
            .handle_hotkey_released(1_220)
            .expect("hotkey release should not fail");
        let snapshot =
            expect_release_snapshot(snapshot, "listening runtime should react to hotkey release");
        assert_eq!(snapshot.phase, "正在识别");
    }

    #[test]
    fn short_hold_release_cancels_current_round_without_writing_history() {
        let state = AppState::for_test();

        state.begin_hotkey_task().expect("task should start");

        let snapshot = state
            .handle_hotkey_released(1_100)
            .expect("hotkey release should not fail");
        let snapshot = expect_release_snapshot(snapshot, "short hold should cancel current round");

        assert_eq!(snapshot.phase, "待命中");
        assert!(state.history_records().is_empty());
    }

    #[test]
    fn double_tap_from_idle_enters_transcription_listening() {
        let state = AppState::for_test();

        let pressed = state
            .handle_hotkey_pressed(1_000)
            .expect("first tap press should not fail");
        assert!(pressed.is_none());

        let released = state
            .handle_hotkey_released(1_060)
            .expect("first tap release should not fail");
        assert!(released.is_none());

        let pressed = state
            .handle_hotkey_pressed(1_140)
            .expect("second tap press should not fail");
        assert!(pressed.is_none());

        let released = state
            .handle_hotkey_released(1_190)
            .expect("second tap release should not fail");
        match released {
            Some(HotkeyReleaseOutcome::TaskStarted(outcome)) => {
                assert_eq!(outcome.snapshot.phase, "正在聆听");
                assert_eq!(outcome.snapshot.input_mode, "transcription");
            }
            Some(HotkeyReleaseOutcome::Snapshot(snapshot)) => {
                panic!(
                    "expected transcription task start, got snapshot phase {}",
                    snapshot.phase
                );
            }
            None => panic!("second tap release should start transcription"),
        }

        let snapshot = state.runtime_snapshot();
        assert_eq!(snapshot.phase, "正在聆听");
        assert_eq!(snapshot.input_mode, "transcription");
    }

    #[test]
    fn duplicate_release_after_transcription_start_does_not_immediately_stop_recording() {
        let state = AppState::for_test();

        state
            .handle_hotkey_pressed(1_000)
            .expect("first tap press should not fail");
        state
            .handle_hotkey_released(1_060)
            .expect("first tap release should not fail");
        state
            .handle_hotkey_pressed(1_140)
            .expect("second tap press should not fail");
        let released = state
            .handle_hotkey_released(1_190)
            .expect("second tap release should not fail");
        assert!(matches!(
            released,
            Some(HotkeyReleaseOutcome::TaskStarted(_))
        ));

        let duplicate_release = state
            .handle_hotkey_released(1_210)
            .expect("duplicate release should not fail");
        assert!(duplicate_release.is_none());

        let snapshot = state.runtime_snapshot();
        assert_eq!(snapshot.phase, "正在聆听");
        assert_eq!(snapshot.input_mode, "transcription");
    }

    #[test]
    fn delayed_release_without_new_press_after_transcription_start_does_not_stop_recording() {
        let state = AppState::for_test();

        state
            .handle_hotkey_pressed(1_000)
            .expect("first tap press should not fail");
        state
            .handle_hotkey_released(1_060)
            .expect("first tap release should not fail");
        state
            .handle_hotkey_pressed(1_140)
            .expect("second tap press should not fail");
        let released = state
            .handle_hotkey_released(1_190)
            .expect("second tap release should not fail");
        assert!(matches!(
            released,
            Some(HotkeyReleaseOutcome::TaskStarted(_))
        ));

        let delayed_release = state
            .handle_hotkey_released(1_500)
            .expect("delayed duplicate release should not fail");
        assert!(delayed_release.is_none());

        let snapshot = state.runtime_snapshot();
        assert_eq!(snapshot.phase, "正在聆听");
        assert_eq!(snapshot.input_mode, "transcription");
    }

    #[test]
    fn single_tap_after_transcription_start_stops_and_submits() {
        let state = AppState::for_test();

        state
            .handle_hotkey_pressed(1_000)
            .expect("first tap press should not fail");
        state
            .handle_hotkey_released(1_060)
            .expect("first tap release should not fail");
        state
            .handle_hotkey_pressed(1_140)
            .expect("second tap press should not fail");
        state
            .handle_hotkey_released(1_190)
            .expect("second tap release should not fail");

        let pressed = state
            .handle_hotkey_pressed(1_360)
            .expect("stop tap press should not fail");
        assert!(pressed.is_none());

        let released = state
            .handle_hotkey_released(1_420)
            .expect("stop tap release should not fail");
        let snapshot =
            expect_release_snapshot(released, "transcription tap should stop and submit");

        assert_eq!(snapshot.phase, "正在识别");
        assert_eq!(snapshot.input_mode, "transcription");
    }

    #[test]
    fn short_tap_from_result_dismisses_result_window_without_clearing_history() {
        let state = AppState::for_test();

        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "最终识别结果".to_string(),
        });
        let snapshot = state.complete_llm_generation_for_test("这是 LLM 最终输出".to_string());
        assert_eq!(snapshot.phase, "已完成");

        let pressed = state
            .handle_hotkey_pressed(5_000)
            .expect("result hotkey press should not fail");
        assert!(pressed.is_none());

        let snapshot = state
            .handle_hotkey_released(5_100)
            .expect("result hotkey release should not fail");
        let snapshot =
            expect_release_snapshot(snapshot, "short tap should dismiss the visible result");

        assert_eq!(snapshot.phase, "待命中");
        assert_eq!(state.history_records().len(), 1);
    }

    #[test]
    fn interrupt_restart_restarts_after_threshold_and_ignores_stale_events() {
        let state = AppState::for_test();
        let operation_id = state
            .begin_hotkey_task()
            .expect("task should start")
            .expect("task outcome should exist")
            .operation_id;
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        let snapshot = state
            .apply_session_event(
                operation_id,
                DoubaoSessionEvent::Completed {
                    text: "上一轮结果".to_string(),
                },
            )
            .expect("completed event should advance to generating")
            .snapshot;
        assert_eq!(snapshot.phase, "正在生成");

        let cancel = state
            .handle_hotkey_pressed(5_000)
            .expect("interrupt press should not fail");
        assert!(cancel.is_none());
        assert_eq!(state.runtime_snapshot().phase, "待命中");

        let stale = state.apply_session_event(
            operation_id,
            DoubaoSessionEvent::Error {
                message: "过期事件".to_string(),
            },
        );
        assert!(stale.is_none());

        let restart = state
            .continue_hotkey_task(5_000 + HOTKEY_RESTART_THRESHOLD_MS)
            .expect("restart timer should not fail")
            .expect("timer should start a new round");
        assert_eq!(restart.snapshot.phase, "正在聆听");
        assert_ne!(restart.operation_id, operation_id);
    }

    #[test]
    fn partial_event_updates_runtime_transcript() {
        let state = AppState::for_test();
        state.begin_hotkey_task().expect("task should start");

        let snapshot = state.apply_session_event_for_test(DoubaoSessionEvent::Partial {
            text: "实时片段".to_string(),
        });

        assert_eq!(snapshot.phase, "正在聆听");
        assert_eq!(snapshot.transcript, "实时片段");
    }

    #[test]
    fn completed_event_persists_history_and_logs() {
        let state = AppState::for_test();
        state.begin_hotkey_task().expect("task should start");
        state.apply_session_event_for_test(DoubaoSessionEvent::Partial {
            text: "实时片段".to_string(),
        });
        state
            .finish_hotkey_task()
            .expect("task should finish listening");

        let snapshot = state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "最终识别结果".to_string(),
        });

        assert_eq!(snapshot.phase, "正在生成");
        assert_eq!(snapshot.transcript, "最终识别结果");
        assert_eq!(snapshot.result, "");

        let snapshot = state.complete_llm_generation_for_test("这是 LLM 最终输出".to_string());

        assert_eq!(snapshot.phase, "已完成");
        assert_eq!(snapshot.transcript, "最终识别结果");
        assert_eq!(snapshot.result, "这是 LLM 最终输出");
        assert_eq!(snapshot.result_window_mode, "auto");
        assert_eq!(state.history_records().len(), 1);
        assert_eq!(state.history_records()[0].status, "done");
        assert!(state
            .runtime_logs()
            .iter()
            .any(|entry| entry.message.contains("OpenAI-compatible LLM 输出已完成")));
    }

    #[test]
    fn transcription_completed_types_text_without_llm_generation() {
        let state = AppState::for_test();

        state
            .start_voice_task_for_mode(VoiceInputMode::Transcription)
            .expect("transcription task should start");
        state
            .finish_voice_task()
            .expect("transcription task should stop listening");

        let snapshot = state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "直接写入的文本".to_string(),
        });

        assert_eq!(snapshot.phase, "正在输出");
        assert_eq!(snapshot.input_mode, "transcription");

        let final_snapshot = state
            .commit_transcription_insert_for_test("直接写入的文本".to_string())
            .expect("transcription insert should succeed");

        assert_eq!(final_snapshot.phase, "待命中");
        assert_eq!(final_snapshot.input_mode, "none");
    }

    #[test]
    fn transcription_silence_timeout_finishes_listening_and_ignores_stale_tokens() {
        let state = AppState::for_test();
        let operation_id = state
            .start_voice_task_for_mode(VoiceInputMode::Transcription)
            .expect("transcription task should start")
            .operation_id;

        let (first_token, timeout_ms) = state
            .arm_transcription_silence_timeout(operation_id)
            .expect("transcription listening should arm silence timeout");
        assert_eq!(timeout_ms, 3_500);

        state.apply_session_event_for_test(DoubaoSessionEvent::Partial {
            text: "实时片段".to_string(),
        });

        let (second_token, _) = state
            .arm_transcription_silence_timeout(operation_id)
            .expect("new transcription activity should refresh silence timeout");
        assert!(second_token > first_token);
        assert!(state
            .finish_transcription_if_silence_timeout(operation_id, first_token)
            .is_none());

        let snapshot = state
            .finish_transcription_if_silence_timeout(operation_id, second_token)
            .expect("latest silence timeout token should stop transcription");

        assert_eq!(snapshot.phase, "正在识别");
        assert_eq!(snapshot.input_mode, "transcription");
    }

    #[test]
    fn transcription_mode_does_not_require_llm_config_to_start_listening() {
        let mut settings = super::test_stored_settings();
        settings.llm_api_key.clear();
        let state = AppState::from_settings(settings);

        let outcome = state
            .start_voice_task_for_mode(VoiceInputMode::Transcription)
            .expect("transcription start should not fail when LLM config is missing");

        assert_eq!(outcome.snapshot.phase, "正在聆听");
        assert_eq!(outcome.snapshot.input_mode, "transcription");
        assert_ne!(outcome.operation_id, 0);

        let snapshot = state.cancel_current_operation("测试清理转录任务。");
        assert_eq!(snapshot.phase, "待命中");
        assert_eq!(snapshot.input_mode, "none");
    }

    #[test]
    fn invalid_config_enters_failure_state_when_starting_task() {
        let state = AppState::with_invalid_config_for_test("豆包 Access Token未配置。");
        let outcome = state
            .begin_hotkey_task()
            .expect("task start should produce a snapshot")
            .expect("failed startup should still emit a snapshot");

        assert_eq!(outcome.snapshot.phase, "识别失败");
        assert!(outcome.snapshot.detail.contains("豆包 Access Token未配置"));
        assert_eq!(state.history_records().len(), 1);
        assert_eq!(state.history_records()[0].status, "error");
    }

    #[test]
    fn invalid_llm_config_enters_failure_state_before_recording_starts() {
        let mut settings = super::test_stored_settings();
        settings.llm_api_key.clear();
        let state = AppState::from_settings(settings);

        let outcome = state
            .begin_hotkey_task()
            .expect("task start should produce a snapshot")
            .expect("failed startup should still emit a snapshot");

        assert_eq!(outcome.snapshot.phase, "识别失败");
        assert_eq!(outcome.snapshot.detail, "LLM API Key 未配置。");
        assert_eq!(state.history_records().len(), 1);
        assert_eq!(state.history_records()[0].status, "error");
    }

    #[test]
    fn voice_settings_include_safe_doubao_runtime_fields() {
        let state = AppState::for_test();
        let serialized =
            serde_json::to_value(state.voice_settings()).expect("settings should serialize");

        assert_eq!(serialized["microphone_device_id"], "");
        assert_eq!(serialized["asr_provider"], "doubao");
        assert_eq!(serialized["asr_model"], "bigmodel");
        assert_eq!(serialized["asr_resource_id"], "volc.bigasr.sauc.duration");
        assert_eq!(serialized["asr_audio_rate"], json!(16_000));
    }

    #[test]
    fn error_event_preserves_partial_transcript() {
        let state = AppState::for_test();
        state.begin_hotkey_task().expect("task should start");
        state.apply_session_event_for_test(DoubaoSessionEvent::Partial {
            text: "正在说话".to_string(),
        });
        state
            .finish_hotkey_task()
            .expect("task should finish listening");

        let snapshot = state.apply_session_event_for_test(DoubaoSessionEvent::Error {
            message: "豆包鉴权失败。".to_string(),
        });

        assert_eq!(snapshot.phase, "识别失败");
        assert_eq!(snapshot.transcript, "正在说话");
        assert_eq!(snapshot.result, "识别失败");
        assert_eq!(snapshot.detail, "豆包鉴权失败。");
    }

    #[test]
    fn llm_failure_after_asr_completed_keeps_transcript_and_enters_error() {
        let state = AppState::for_test();
        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");

        let snapshot = state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "帮我生成一段总结".to_string(),
        });
        assert_eq!(snapshot.phase, "正在生成");

        let snapshot = state.fail_llm_generation_for_test("LLM 请求失败。".to_string());
        assert_eq!(snapshot.phase, "识别失败");
        assert_eq!(snapshot.transcript, "帮我生成一段总结");
        assert_eq!(snapshot.result, "生成失败");
        assert_eq!(snapshot.detail, "LLM 请求失败。");
    }

    #[test]
    fn llm_tool_execution_success_enters_done_and_persists_history() {
        let state = AppState::for_test();
        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "请打开 Rust 官网".to_string(),
        });

        let snapshot = state.complete_llm_tool_requests_for_test(vec![LlmToolRequest::Local(
            automation_core::ToolExecutionRequest::open_url("https://www.rust-lang.org"),
        )]);

        assert_eq!(snapshot.phase, "已完成");
        assert_eq!(snapshot.result, "已打开链接。");
        assert!(snapshot.detail.contains("工具执行已完成"));
        assert_eq!(snapshot.result_window_mode, "hidden");
        assert_eq!(state.history_records().len(), 1);
        assert_eq!(state.history_records()[0].status, "done");
    }

    #[test]
    fn llm_tool_execution_success_logs_local_tool_details() {
        let state = AppState::for_test();
        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "请打开 Rust 官网".to_string(),
        });

        let _ = state.complete_llm_tool_requests_for_test(vec![LlmToolRequest::Local(
            automation_core::ToolExecutionRequest::open_url("https://www.rust-lang.org"),
        )]);

        let logs = state.runtime_logs();
        assert!(logs.iter().any(|entry| {
            entry.message.contains("LLM 工具计划")
                && entry.message.contains("Local open_url")
                && entry.message.contains("https://www.rust-lang.org")
        }));
        assert!(logs.iter().any(|entry| {
            entry.message.contains("开始执行")
                && entry.message.contains("本地工具 open_url")
                && entry.message.contains("https://www.rust-lang.org")
        }));
        assert!(logs.iter().any(|entry| {
            entry.message.contains("本地工具 open_url 执行成功")
                && entry.message.contains("已打开链接。")
        }));
    }

    #[test]
    fn llm_tool_execution_failure_enters_error_and_preserves_transcript() {
        let state = AppState::with_failing_tool_executor_for_test("输入控制不可用。");
        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "输入你好".to_string(),
        });

        let snapshot = state.complete_llm_tool_requests_for_test(vec![LlmToolRequest::Local(
            automation_core::ToolExecutionRequest::type_text("你好"),
        )]);

        assert_eq!(snapshot.phase, "识别失败");
        assert_eq!(snapshot.transcript, "输入你好");
        assert_eq!(snapshot.result, "工具执行失败");
        assert_eq!(snapshot.detail, "输入控制不可用。");
    }

    #[test]
    fn llm_tool_execution_failure_logs_tool_details() {
        let state = AppState::with_failing_tool_executor_for_test("输入控制不可用。");
        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "输入你好".to_string(),
        });

        let _ = state.complete_llm_tool_requests_for_test(vec![LlmToolRequest::Local(
            automation_core::ToolExecutionRequest::type_text("你好"),
        )]);

        let logs = state.runtime_logs();
        assert!(logs.iter().any(|entry| {
            entry.message.contains("开始执行")
                && entry.message.contains("本地工具 type_text")
                && entry.message.contains("text=\"你好\"")
        }));
        assert!(logs.iter().any(|entry| {
            entry.message.contains("本地工具 type_text 执行失败")
                && entry.message.contains("输入控制不可用。")
        }));
    }

    #[test]
    fn llm_mcp_tool_execution_success_enters_done_and_uses_mcp_result() {
        let state = AppState::with_mcp_for_test();
        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "请通过 MCP 输出你好".to_string(),
        });

        let snapshot =
            state.complete_llm_tool_requests_for_test(vec![LlmToolRequest::Mcp(McpToolCall {
                server_id: "system-control".to_string(),
                tool_name: "type_text".to_string(),
                arguments: json!({ "text": "你好" }),
            })]);

        assert_eq!(snapshot.phase, "已完成");
        assert_eq!(snapshot.transcript, "请通过 MCP 输出你好");
        assert_eq!(snapshot.result, "MCP 已输出文本。");
        assert_eq!(snapshot.detail, "本地工具执行已完成。");
    }

    #[test]
    fn llm_mcp_tool_execution_success_logs_tool_name_and_arguments() {
        let state = AppState::with_mcp_for_test();
        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "帮我按 F5".to_string(),
        });

        let _ = state.complete_llm_tool_requests_for_test(vec![LlmToolRequest::Mcp(McpToolCall {
            server_id: "system-control".to_string(),
            tool_name: "keyboard_control".to_string(),
            arguments: json!({ "shortcut": "F5" }),
        })]);

        let logs = state.runtime_logs();
        assert!(logs.iter().any(|entry| {
            entry.message.contains("LLM 工具计划")
                && entry.message.contains("MCP keyboard_control")
                && entry.message.contains("shortcut=F5")
        }));
        assert!(logs.iter().any(|entry| {
            entry.message.contains("开始执行 MCP 工具 keyboard_control")
                && entry.message.contains("shortcut=F5")
        }));
        assert!(logs.iter().any(|entry| {
            entry.message.contains("MCP 工具 keyboard_control 执行成功")
                && entry.message.contains("MCP 已输出文本。")
        }));
    }

    #[test]
    fn configure_settings_store_syncs_saved_mcp_servers_into_runtime() {
        let state = AppState::with_mcp_for_test();
        let path = temp_settings_path("configure-settings-store-syncs-mcp");
        let mut settings = super::test_stored_settings();
        settings.mcp_servers = vec![super::test_mcp_server_config()];
        settings_core::SettingsStore::save(&path, &settings).expect("settings fixture should save");

        state
            .configure_settings_store(path)
            .expect("settings store should configure");

        let tools = state.available_mcp_tools_for_test();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].qualified_name, "mcp__system_control__type_text");
    }

    #[test]
    fn runtime_diagnostics_expose_active_mcp_servers_and_tools() {
        let state = AppState::with_mcp_for_test();

        let diagnostics = state.runtime_diagnostics();

        assert_eq!(diagnostics.configured_server_count, 1);
        assert_eq!(diagnostics.active_server_count, 1);
        assert_eq!(diagnostics.tool_count, 1);
        assert_eq!(diagnostics.mcp_servers[0].source, "settings.json");
        assert!(diagnostics.mcp_servers[0].active_in_runtime);
        assert_eq!(diagnostics.active_tools[0].server_id, "system-control");
        assert_eq!(
            diagnostics.active_tools[0].qualified_name,
            "mcp__system_control__type_text"
        );
    }

    #[test]
    fn sync_mcp_servers_includes_angrymiao_skill_bundle_runtime_when_enabled() {
        let state = AppState::for_test();
        let bundle_root = temp_skill_bundle_root("syncs-angrymiao-skill-bundle");
        seed_angrymiao_skill_bundle(&bundle_root);

        let mut settings = super::test_stored_settings();
        settings.mcp_servers = Vec::new();
        settings.angrymiao_skill_enabled = true;
        settings.keyboard_driver_path = String::new();
        let settings_path = temp_settings_path("syncs-angrymiao-skill-bundle");
        settings_core::SettingsStore::save(&settings_path, &settings)
            .expect("settings fixture should save");

        state.configure_skill_bundle_root(bundle_root);
        state
            .configure_settings_store(settings_path)
            .expect("settings store should configure");

        let tools = state.available_mcp_tools_for_test();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].server_id, "angrymiao-system-control");
        assert_eq!(tools[0].qualified_name, "mcp__system-control__type_text");
    }

    #[test]
    fn configure_history_store_loads_existing_records() {
        let state = AppState::for_test();
        let path = temp_history_path("history-loads-existing-records");
        let existing = vec![HistoryRecord::with_status(7, "旧转写", "旧结果", "done")];
        save_history_records(&path, &existing).expect("history fixture should be created");

        state
            .configure_history_store(path.clone())
            .expect("history store should load existing records");

        assert_eq!(state.history_records(), existing);
    }

    #[test]
    fn configure_history_store_keeps_legacy_history_records() {
        let state = AppState::for_test();
        let path = temp_history_path("history-keeps-legacy-records");
        std::fs::create_dir_all(path.parent().expect("parent should exist"))
            .expect("history parent should exist");
        std::fs::write(&path, r#"[{"transcript":"旧转写","result":"旧结果"}]"#)
            .expect("legacy history fixture should be written");

        state
            .configure_history_store(path.clone())
            .expect("legacy history should load");

        let history = state.history_records();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].id, 1);
        assert_eq!(history[0].status, "done");
        assert_eq!(history[0].transcript, "旧转写");

        let parent = path.parent().expect("parent should exist");
        let backup_count = std::fs::read_dir(parent)
            .expect("history directory should be readable")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".corrupted."))
            .count();
        assert_eq!(backup_count, 0);
    }

    #[test]
    fn completed_task_persists_history_records_to_disk() {
        let state = AppState::for_test();
        let path = temp_history_path("history-persists-completed-task");
        state
            .configure_history_store(path.clone())
            .expect("history store should be configured");

        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "帮我记录这段语音".to_string(),
        });
        state.complete_llm_generation_for_test("这是最终结果".to_string());

        let persisted = load_history_records(&path).expect("history should be persisted to disk");

        assert_eq!(persisted.len(), 1);
        assert_eq!(persisted[0].transcript, "帮我记录这段语音");
        assert_eq!(persisted[0].result, "这是最终结果");
    }

    #[test]
    fn configure_history_store_recovers_from_invalid_json() {
        let state = AppState::for_test();
        let path = temp_history_path("history-recovers-from-invalid-json");
        std::fs::create_dir_all(path.parent().expect("parent should exist"))
            .expect("history parent should exist");
        std::fs::write(&path, "{ broken json").expect("broken history fixture should be written");

        state
            .configure_history_store(path.clone())
            .expect("broken history should recover");

        assert!(state.history_records().is_empty());
        let parent = path.parent().expect("parent should exist");
        let backup_count = std::fs::read_dir(parent)
            .expect("history backup directory should be readable")
            .filter_map(Result::ok)
            .filter(|entry| entry.file_name().to_string_lossy().contains(".corrupted."))
            .count();
        assert_eq!(backup_count, 1);
    }

    #[test]
    fn configure_history_store_continues_task_ids_from_latest_record() {
        let state = AppState::for_test();
        let path = temp_history_path("history-continues-latest-task-id");
        let existing = vec![HistoryRecord::with_status(7, "旧转写", "旧结果", "done")];
        save_history_records(&path, &existing).expect("history fixture should be created");

        state
            .configure_history_store(path.clone())
            .expect("history store should load existing records");

        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "继续记录新语音".to_string(),
        });
        state.complete_llm_generation_for_test("这是新结果".to_string());

        let history = state.history_records();
        assert_eq!(history.len(), 2);
        assert_eq!(history[1].id, 8);
    }

    #[test]
    fn save_editable_settings_updates_runtime_snapshot() {
        let state = AppState::for_test();
        state
            .configure_settings_store(temp_settings_path("save-editable-settings-updates-runtime"))
            .expect("settings store should configure");

        let mut input = SaveEditableVoiceSettingsInput::from_snapshot(&state.editable_settings());
        input.default_hotkey = "LeftCtrl+RightShift+Space".to_string();
        input.llm_model = "gpt-4.1-mini".to_string();
        input.doubao_asr_access_token = EditableSecretValueInput::Unchanged;
        input.llm_api_key = EditableSecretValueInput::Unchanged;

        let saved = state
            .save_editable_settings(input)
            .expect("settings should save");

        assert_eq!(saved.default_hotkey, "LeftCtrl+RightShift+Space");
        assert_eq!(state.voice_settings().llm_model, "gpt-4.1-mini");
    }

    #[test]
    fn save_editable_settings_refreshes_runtime_snapshot_for_new_tasks() {
        let state = AppState::for_test();
        state
            .configure_settings_store(temp_settings_path(
                "save-editable-settings-refreshes-runtime",
            ))
            .expect("settings store should configure");

        let mut input = SaveEditableVoiceSettingsInput::from_snapshot(&state.editable_settings());
        input.llm_model = "gpt-4.1-mini".to_string();
        input.doubao_asr_access_token = EditableSecretValueInput::Unchanged;
        input.llm_api_key = EditableSecretValueInput::Replace("next-secret".to_string());

        state
            .save_editable_settings(input)
            .expect("settings should save");

        let runtime_settings = state.voice_settings();
        assert_eq!(runtime_settings.llm_model, "gpt-4.1-mini");
    }

    #[test]
    fn reset_editable_settings_reloads_saved_store() {
        let state = AppState::for_test();
        state
            .configure_settings_store(temp_settings_path("reset-editable-settings-reloads-store"))
            .expect("settings store should configure");

        let mut input = SaveEditableVoiceSettingsInput::from_snapshot(&state.editable_settings());
        input.llm_model = "gpt-4.1-mini".to_string();
        input.doubao_asr_access_token = EditableSecretValueInput::Unchanged;
        input.llm_api_key = EditableSecretValueInput::Unchanged;
        state
            .save_editable_settings(input)
            .expect("settings should save");

        let reset = state
            .reset_editable_settings()
            .expect("settings should reset");

        assert_eq!(reset.llm_model, "gpt-4.1-mini");
    }

    #[test]
    fn configured_hotkey_uses_latest_saved_setting() {
        let state = AppState::for_test();
        state
            .configure_settings_store(temp_settings_path("configured-hotkey-uses-latest"))
            .expect("settings store should configure");

        let mut input = SaveEditableVoiceSettingsInput::from_snapshot(&state.editable_settings());
        input.default_hotkey = "LeftCtrl+RightShift+Space".to_string();
        input.doubao_asr_access_token = EditableSecretValueInput::Unchanged;
        input.llm_api_key = EditableSecretValueInput::Unchanged;

        state
            .save_editable_settings(input)
            .expect("settings should save");

        let hotkey = state
            .configured_hotkey()
            .expect("updated hotkey should parse");

        assert_eq!(hotkey.display(), "LeftCtrl+RightShift+Space");
        assert_eq!(hotkey.accelerator(), "Control+Shift+Space");
    }

    #[test]
    fn runtime_logs_include_platform_diagnostics_on_startup() {
        let state = AppState::for_test();
        let logs = state.runtime_logs();

        assert!(logs
            .iter()
            .any(|entry| entry.message == "语音运行时已就绪。"));
        assert!(logs.iter().any(|entry| entry.message.contains("平台诊断")));
        assert!(logs.iter().any(|entry| entry.message.contains("TestOS")));
    }

    #[test]
    fn query_preview_retry_and_log_export_work_with_runtime_state() {
        let state = AppState::for_test();
        let history_path = temp_history_path("history-query-preview-retry");
        state
            .configure_history_store(history_path)
            .expect("history store should configure");
        state.configure_app_data_dir(temp_export_dir("log-export-dir"));

        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "帮我总结今天会议".to_string(),
        });
        state.complete_llm_generation_for_test("会议总结完成".to_string());

        let queried =
            state.query_history_records(Some("会议".to_string()), Some("done".to_string()));
        assert_eq!(queried.len(), 1);

        let preview = state
            .preview_history_record(queried[0].id)
            .expect("preview should succeed");
        assert_eq!(preview.transcript, "帮我总结今天会议");
        assert_eq!(preview.result, "会议总结完成");

        let retry = state
            .retry_history_record(queried[0].id)
            .expect("retry should start generating");
        assert_eq!(retry.snapshot.phase, "正在生成");
        assert!(retry.snapshot.detail.contains("重新生成"));

        let export_path = state
            .export_runtime_logs()
            .expect("runtime log export should succeed");
        let exported = fs::read_to_string(export_path).expect("exported logs should be readable");
        assert!(exported.contains("语音运行时已就绪。"));

        state.clear_runtime_logs();
        assert!(state.runtime_logs().is_empty());
    }

    #[test]
    fn retry_history_record_exposes_run_llm_follow_up_for_command_dispatch() {
        let state = AppState::for_test();
        let history_path = temp_history_path("history-retry-follow-up");
        state
            .configure_history_store(history_path)
            .expect("history store should configure");

        state.begin_hotkey_task().expect("task should start");
        state
            .finish_hotkey_task()
            .expect("task should finish listening");
        state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
            text: "帮我总结今天会议".to_string(),
        });
        state.complete_llm_generation_for_test("会议总结完成".to_string());

        let record_id = state
            .history_records()
            .last()
            .expect("history should contain completed task")
            .id;
        let retry = state
            .retry_history_record(record_id)
            .expect("retry should start generating");

        assert_eq!(retry.snapshot.phase, "正在生成");
        match retry.follow_up {
            Some(SessionFollowUp::RunLlm(transcript)) => {
                assert_eq!(transcript, "帮我总结今天会议");
            }
            Some(SessionFollowUp::CommitTranscription(_)) => {
                panic!("retry should continue into llm generation");
            }
            None => {
                panic!("retry should expose llm follow-up");
            }
        }
    }

    fn temp_history_path(case_name: &str) -> PathBuf {
        let dir = tempfile::tempdir().expect("temp dir should be created");
        let path = dir.path().join(case_name).join("history.json");
        let kept_dir = dir.keep();
        std::mem::forget(kept_dir);
        path
    }

    fn temp_settings_path(case_name: &str) -> PathBuf {
        let dir = tempfile::tempdir().expect("temp dir should be created");
        let path = dir.path().join(case_name).join("settings.json");
        let kept_dir = dir.keep();
        std::mem::forget(kept_dir);
        path
    }

    fn temp_export_dir(case_name: &str) -> PathBuf {
        let dir = tempfile::tempdir().expect("temp dir should be created");
        let path = dir.path().join(case_name);
        std::fs::create_dir_all(&path).expect("export dir should exist");
        let kept_dir = dir.keep();
        std::mem::forget(kept_dir);
        path
    }

    fn temp_skill_bundle_root(case_name: &str) -> PathBuf {
        let dir = tempfile::tempdir().expect("temp dir should be created");
        let path = dir.path().join(case_name);
        std::fs::create_dir_all(&path).expect("skill bundle root should exist");
        let kept_dir = dir.keep();
        std::mem::forget(kept_dir);
        path
    }

    fn seed_angrymiao_skill_bundle(bundle_root: &PathBuf) {
        let bundle_dir = bundle_root.join("angrymiao-voice-control");
        let runtime_dir = bundle_dir.join("runtime/system-control-mcp/dist");
        let driver_dir = bundle_dir.join("runtime/system-control-mcp/src/utils");
        let docs_dir = bundle_dir.join("docs");
        std::fs::create_dir_all(&runtime_dir).expect("runtime dir should exist");
        std::fs::create_dir_all(&driver_dir).expect("driver dir should exist");
        std::fs::create_dir_all(&docs_dir).expect("docs dir should exist");
        std::fs::write(runtime_dir.join("index.js"), "console.log('mcp runtime');")
            .expect("runtime entry should exist");
        std::fs::write(driver_dir.join("AIKeyBoardDriver.exe"), "")
            .expect("driver fixture should exist");
        std::fs::write(
            bundle_dir.join("SKILL.md"),
            "# Angrymiao Voice Control\n\nUse keyboard control.",
        )
        .expect("skill prompt should exist");
        std::fs::write(
            docs_dir.join("keyboard-hid-reference.md"),
            "KeyA => 11070004",
        )
        .expect("hid reference should exist");
        std::fs::write(
            bundle_dir.join("manifest.json"),
            r#"{
  "id": "angrymiao-voice-control",
  "version": "1.0.0",
  "name": "Angrymiao Voice Control",
  "description": "Voice-command skill bundle for desktop system control.",
  "prompt": {
    "file": "SKILL.md",
    "examplesFile": "examples.md"
  },
  "platforms": ["darwin", "win32"],
  "runtimes": [
    {
      "id": "system-control",
      "transport": "mcp-stdio",
      "launcher": "node-script",
      "entry": "runtime/system-control-mcp/dist/index.js",
      "name": "system-control",
      "server": {
        "id": "angrymiao-system-control",
        "name": "system-control"
      },
      "platforms": ["darwin", "win32"],
      "env": [
        {
          "name": "KEYBOARD_DRIVER_PATH",
          "source": "settings-path",
          "settingPath": "voice.keyboardDriverPath",
          "defaultBundlePath": "runtime/system-control-mcp/src/utils/AIKeyBoardDriver.exe",
          "required": false
        }
      ]
    }
  ]
}"#,
        )
        .expect("manifest fixture should exist");
    }
}
