use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use asr_core::{list_microphone_input_devices, DoubaoSessionEvent, MicrophoneInputDevice};
use history_core::HistoryRecord;
use ipc_contract::RuntimeSnapshot;
use logging_core::RuntimeLogEntry;
use platform_core::PlatformDiagnostics;
use serde::Serialize;
use settings_core::{EditableVoiceSettings, SaveEditableVoiceSettingsInput, VoiceSettings};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app_state::{
    AppState, LlmRunOutcome, RuntimeDiagnostics, SessionFollowUp, TaskStartOutcome,
};
use crate::skill_bundles::SkillBundleInventoryItem;
use crate::{hotkeys, platform_runtime, windowing};

#[derive(Clone, Debug, Serialize)]
pub struct EditableSettingsMutationResult {
    pub settings: EditableVoiceSettings,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn get_runtime_snapshot(state: State<'_, AppState>) -> RuntimeSnapshot {
    state.runtime_snapshot()
}

#[tauri::command]
pub fn get_history_records(state: State<'_, AppState>) -> Vec<HistoryRecord> {
    state.history_records()
}

#[tauri::command]
pub fn query_history_records(
    state: State<'_, AppState>,
    keyword: Option<String>,
    status: Option<String>,
) -> Vec<HistoryRecord> {
    state.query_history_records(keyword, status)
}

#[tauri::command]
pub fn preview_history_record(
    state: State<'_, AppState>,
    app: AppHandle,
    record_id: usize,
) -> Result<RuntimeSnapshot, String> {
    let snapshot = state.preview_history_record(record_id)?;
    sync_and_emit_runtime(&app, &state, snapshot)
}

#[tauri::command]
pub fn retry_history_record(
    state: State<'_, AppState>,
    app: AppHandle,
    record_id: usize,
) -> Result<RuntimeSnapshot, String> {
    let outcome = state.retry_history_record(record_id)?;
    handle_task_start_outcome(&app, &state, outcome)
}

#[tauri::command]
pub fn get_voice_settings(state: State<'_, AppState>) -> VoiceSettings {
    state.voice_settings()
}

#[tauri::command]
pub fn get_editable_settings(state: State<'_, AppState>) -> EditableVoiceSettings {
    state.editable_settings()
}

#[tauri::command]
pub fn list_microphone_inputs(
    state: State<'_, AppState>,
) -> Result<Vec<MicrophoneInputDevice>, String> {
    list_microphone_input_devices().map_err(|cause| {
        let message = format!("读取麦克风列表失败: {cause}");
        state.push_error_log(message.clone());
        message
    })
}

#[tauri::command]
pub fn save_editable_settings(
    state: State<'_, AppState>,
    app: AppHandle,
    input: SaveEditableVoiceSettingsInput,
) -> Result<EditableSettingsMutationResult, String> {
    let previous_settings = state.stored_settings();
    let settings = state.save_editable_settings(input)?;
    let warnings = sync_runtime_settings(
        &app,
        &state,
        Some(previous_settings.default_hotkey.as_str()),
    )?;
    Ok(EditableSettingsMutationResult { settings, warnings })
}

#[tauri::command]
pub fn reset_editable_settings(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<EditableSettingsMutationResult, String> {
    let previous_settings = state.stored_settings();
    let settings = state.reset_editable_settings()?;
    let warnings = sync_runtime_settings(
        &app,
        &state,
        Some(previous_settings.default_hotkey.as_str()),
    )?;
    Ok(EditableSettingsMutationResult { settings, warnings })
}

#[tauri::command]
pub fn get_runtime_logs(state: State<'_, AppState>) -> Vec<RuntimeLogEntry> {
    state.runtime_logs()
}

#[tauri::command]
pub fn clear_runtime_logs(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    state.clear_runtime_logs();
    app.emit("logs-updated", state.runtime_logs())
        .map_err(|cause| cause.to_string())
}

#[tauri::command]
pub fn export_runtime_logs(state: State<'_, AppState>, app: AppHandle) -> Result<String, String> {
    let path = state.export_runtime_logs()?;
    state.push_info_log(format!("运行日志已导出到 {}。", path.display()));
    app.emit("logs-updated", state.runtime_logs())
        .map_err(|cause| cause.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
pub fn get_platform_diagnostics(state: State<'_, AppState>) -> PlatformDiagnostics {
    state.platform_diagnostics()
}

#[tauri::command]
pub fn get_runtime_diagnostics(state: State<'_, AppState>) -> RuntimeDiagnostics {
    state.runtime_diagnostics()
}

#[tauri::command]
pub fn list_skill_bundles(
    state: State<'_, AppState>,
) -> Result<Vec<SkillBundleInventoryItem>, String> {
    crate::skill_bundles::list_installed_skill_bundles(
        state.skill_bundle_root().as_deref(),
        &state.stored_settings(),
    )
}

#[tauri::command]
pub fn read_skill_bundle_text(
    state: State<'_, AppState>,
    bundle_id: String,
    relative_path: String,
) -> Result<String, String> {
    crate::skill_bundles::read_skill_bundle_text_file(
        state.skill_bundle_root().as_deref(),
        &bundle_id,
        &relative_path,
    )
}

#[tauri::command]
pub fn install_skill_bundle(
    state: State<'_, AppState>,
    bundle_source_dir: String,
) -> Result<SkillBundleInventoryItem, String> {
    crate::skill_bundles::install_skill_bundle_from_dir(
        state.skill_bundle_root().as_deref(),
        std::path::Path::new(&bundle_source_dir),
        &state.stored_settings(),
    )
}

#[tauri::command]
pub fn start_microphone_capture(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<RuntimeSnapshot, String> {
    let outcome = state.start_voice_task()?;
    handle_task_start_outcome(&app, &state, outcome)
}

#[tauri::command]
pub fn stop_microphone_capture(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<RuntimeSnapshot, String> {
    let snapshot = state.finish_voice_task()?;
    sync_and_emit_runtime(&app, &state, snapshot)
}

#[tauri::command]
pub fn dismiss_runtime_result(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<RuntimeSnapshot, String> {
    let snapshot = state.dismiss_runtime_result("已关闭任务结果。");
    sync_and_emit_runtime(&app, &state, snapshot)
}

pub(crate) fn handle_task_start_outcome(
    app: &AppHandle,
    state: &AppState,
    outcome: TaskStartOutcome,
) -> Result<RuntimeSnapshot, String> {
    let snapshot = sync_and_emit_runtime(app, state, outcome.snapshot)?;

    maybe_schedule_transcription_silence_timeout(app, state, outcome.operation_id, &snapshot);

    if let Some(events) = outcome.events {
        spawn_session_event_listener(app.clone(), outcome.operation_id, events);
    }

    Ok(snapshot)
}

pub(crate) fn spawn_session_event_listener(
    app: AppHandle,
    operation_id: u64,
    events: mpsc::Receiver<DoubaoSessionEvent>,
) {
    thread::spawn(move || {
        while let Ok(event) = events.recv() {
            let state = app.state::<AppState>();
            let Some(outcome) = state.apply_session_event(operation_id, event) else {
                break;
            };
            let snapshot = outcome.snapshot;
            let phase = snapshot.phase.clone();
            let follow_up = outcome.follow_up;
            let _ = sync_and_emit_runtime(&app, &state, snapshot.clone());
            maybe_schedule_transcription_silence_timeout(
                &app,
                &state,
                outcome.operation_id,
                &snapshot,
            );

            match follow_up {
                Some(SessionFollowUp::RunLlm(transcript)) => {
                    spawn_llm_generation(app.clone(), outcome.operation_id, transcript);
                    break;
                }
                Some(SessionFollowUp::CommitTranscription(transcript)) => {
                    if let Some(snapshot) =
                        state.commit_transcription_insert(outcome.operation_id, transcript)
                    {
                        let _ = sync_and_emit_runtime(&app, &state, snapshot);
                    }
                    break;
                }
                None => {
                    if phase == "已完成" || phase == "识别失败" {
                        break;
                    }
                }
            }
        }
    });
}

fn maybe_schedule_transcription_silence_timeout(
    app: &AppHandle,
    state: &AppState,
    operation_id: u64,
    snapshot: &RuntimeSnapshot,
) {
    if snapshot.input_mode != "transcription" {
        return;
    }

    let Some((token, timeout_ms)) = state.arm_transcription_silence_timeout(operation_id) else {
        return;
    };

    schedule_transcription_silence_timeout(app.clone(), operation_id, token, timeout_ms);
}

fn schedule_transcription_silence_timeout(
    app: AppHandle,
    operation_id: u64,
    token: u64,
    timeout_ms: u64,
) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(timeout_ms));
        let state = app.state::<AppState>();
        if let Some(snapshot) = state.finish_transcription_if_silence_timeout(operation_id, token) {
            let _ = sync_and_emit_runtime(&app, &state, snapshot);
        }
    });
}

pub(crate) fn spawn_llm_generation(app: AppHandle, operation_id: u64, transcript: String) {
    thread::spawn(move || {
        let state = app.state::<AppState>();
        if let Some(outcome) = state.run_llm_generation(operation_id, transcript) {
            match outcome {
                LlmRunOutcome::Completed { snapshot } => {
                    let _ = sync_and_emit_runtime(&app, &state, snapshot);
                }
                LlmRunOutcome::ToolExecutionPending {
                    progress_snapshot,
                    requests,
                } => {
                    let _ = sync_and_emit_runtime(&app, &state, progress_snapshot);
                    if let Some(final_snapshot) =
                        state.execute_tool_requests(operation_id, requests)
                    {
                        let _ = sync_and_emit_runtime(&app, &state, final_snapshot);
                    }
                }
            }
        }
    });
}

pub(crate) fn sync_and_emit_runtime(
    app: &AppHandle,
    state: &AppState,
    snapshot: RuntimeSnapshot,
) -> Result<RuntimeSnapshot, String> {
    windowing::sync_runtime_windows(app, &snapshot).map_err(|cause| cause.to_string())?;
    app.emit("runtime-snapshot", snapshot.clone())
        .map_err(|cause| cause.to_string())?;
    app.emit("history-updated", state.history_records())
        .map_err(|cause| cause.to_string())?;
    app.emit("logs-updated", state.runtime_logs())
        .map_err(|cause| cause.to_string())?;
    app.emit("platform-diagnostics-updated", state.platform_diagnostics())
        .map_err(|cause| cause.to_string())?;

    Ok(snapshot)
}

fn sync_runtime_settings(
    app: &AppHandle,
    state: &AppState,
    fallback_hotkey: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut warnings = Vec::new();

    if let Err(cause) = platform_runtime::sync_auto_launch_setting(app, state) {
        let warning = format!("开机自启动设置未即时生效：{cause}");
        state.push_error_log(warning.clone());
        warnings.push(warning);
    }

    if let Err(cause) = state.sync_mcp_servers() {
        let warning = format!("MCP 运行时未即时刷新：{cause}");
        state.push_error_log(warning.clone());
        warnings.push(warning);
    }

    if let Err(cause) = hotkeys::refresh_primary_hotkey(app, fallback_hotkey) {
        warnings.push(format!("热键已保存，但当前系统无法立即启用：{cause}"));
    }

    app.emit("logs-updated", state.runtime_logs())
        .map_err(|cause| cause.to_string())?;
    app.emit("platform-diagnostics-updated", state.platform_diagnostics())
        .map_err(|cause| cause.to_string())?;

    Ok(warnings)
}
