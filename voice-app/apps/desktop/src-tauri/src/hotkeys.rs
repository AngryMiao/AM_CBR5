use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use automation_core::{
    create_platform_keyboard_hook_backend, GlobalHotkey, KeyboardHookEvent, KeyboardHookHandle,
    HOTKEY_RESTART_THRESHOLD_MS,
};
use tauri::{App, AppHandle, Emitter, Manager};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Builder, GlobalShortcutExt, ShortcutState};

use crate::app_state::AppState;
use crate::{commands, platform_runtime};

const DUPLICATE_HOTKEY_EVENT_WINDOW_MS: u64 = 40;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HotkeyBackendDiagnostics {
    pub backend_label: String,
    pub error_message: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HotkeyBackendMode {
    NativeHook,
    GlobalShortcutFallback,
    Unavailable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HookEventRoutingDecision {
    Pressed { ts_ms: u64 },
    Released { ts_ms: u64 },
    Ignore,
}

#[derive(Default)]
pub struct HotkeyRuntimeState {
    active_runtime: Mutex<Option<ActiveHotkeyRuntime>>,
    event_deduper: Mutex<HotkeyEventDeduper>,
}

enum ActiveHotkeyRuntime {
    Native { handle: Box<dyn KeyboardHookHandle> },
    GlobalShortcut,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HotkeyEdge {
    Pressed,
    Released,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct HotkeyEventDeduper {
    last_edge: Option<HotkeyEdge>,
    last_wall_clock_ms: u64,
}

impl HotkeyEventDeduper {
    fn should_skip(&mut self, edge: HotkeyEdge, now_ms: u64) -> bool {
        let should_skip = self.last_edge == Some(edge)
            && now_ms.saturating_sub(self.last_wall_clock_ms) <= DUPLICATE_HOTKEY_EVENT_WINDOW_MS;
        self.last_edge = Some(edge);
        self.last_wall_clock_ms = now_ms;
        should_skip
    }
}

pub fn resolve_hotkey_backend_mode(
    native_hook_available: bool,
    fallback_available: bool,
) -> HotkeyBackendMode {
    if native_hook_available {
        return HotkeyBackendMode::NativeHook;
    }
    if fallback_available {
        return HotkeyBackendMode::GlobalShortcutFallback;
    }
    HotkeyBackendMode::Unavailable
}

pub fn resolve_hotkey_backend_diagnostics(
    mode: HotkeyBackendMode,
    native_error: Option<&str>,
) -> HotkeyBackendDiagnostics {
    match mode {
        HotkeyBackendMode::NativeHook => HotkeyBackendDiagnostics {
            backend_label: "原生键盘 Hook".to_string(),
            error_message: None,
        },
        HotkeyBackendMode::GlobalShortcutFallback => HotkeyBackendDiagnostics {
            backend_label: "全局快捷键降级".to_string(),
            error_message: native_error.map(str::to_string),
        },
        HotkeyBackendMode::Unavailable => HotkeyBackendDiagnostics {
            backend_label: "不可用".to_string(),
            error_message: native_error.map(str::to_string),
        },
    }
}

pub fn route_native_hook_event(
    hotkey: &GlobalHotkey,
    event: &KeyboardHookEvent,
) -> HookEventRoutingDecision {
    if hotkey.matches_pressed_event(event) {
        return HookEventRoutingDecision::Pressed {
            ts_ms: event.timestamp_ms(),
        };
    }
    if hotkey.matches_released_event(event) {
        return HookEventRoutingDecision::Released {
            ts_ms: event.timestamp_ms(),
        };
    }
    HookEventRoutingDecision::Ignore
}

pub fn fallback_hotkey_validation_error(hotkey: &GlobalHotkey) -> Option<String> {
    hotkey.is_modifier_only_key().then_some(
        "当前热键为单独修饰键，仅原生键盘 Hook 支持；请改用组合键或恢复原生 Hook。".to_string(),
    )
}

pub fn configure_global_hotkeys(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(desktop)]
    {
        app.handle().plugin(Builder::new().build())?;
        let _ = refresh_primary_hotkey(&app.handle(), None);
    }
    Ok(())
}

#[cfg(desktop)]
pub fn refresh_primary_hotkey(
    app: &AppHandle,
    fallback_hotkey_label: Option<&str>,
) -> Result<(), String> {
    teardown_hotkey_runtime(app)?;
    let hotkey_label = app
        .state::<AppState>()
        .configured_hotkey()
        .map_err(|cause| cause.to_string())?
        .display()
        .to_string();

    match activate_hotkey_label(app, &hotkey_label) {
        Ok(()) => Ok(()),
        Err(cause) => {
            if let Some(previous_hotkey) = fallback_hotkey_label {
                if let Err(rollback_cause) = activate_hotkey_label(app, previous_hotkey) {
                    let state = app.state::<AppState>();
                    state.push_error_log(format!("回滚上一条热键失败: {rollback_cause}"));
                }
            }
            Err(cause)
        }
    }
}

#[cfg(not(desktop))]
pub fn refresh_primary_hotkey(
    _app: &AppHandle,
    _fallback_hotkey_label: Option<&str>,
) -> Result<(), String> {
    Ok(())
}

#[cfg(desktop)]
fn activate_hotkey_label(app: &AppHandle, hotkey_label: &str) -> Result<(), String> {
    let hotkey = GlobalHotkey::parse(hotkey_label).map_err(|cause| cause.to_string())?;
    let state = app.state::<AppState>();

    match start_native_hook_runtime(app, hotkey.clone()) {
        Ok(handle) => {
            let supplemental_registered = register_supplemental_single_key_shortcut(app, &hotkey)
                .unwrap_or_else(|cause| {
                    state.push_error_log(format!(
                        "单键热键辅助注册失败，将继续使用原生键盘 Hook：{cause}"
                    ));
                    false
                });
            {
                let runtime_state = app.state::<HotkeyRuntimeState>();
                let mut runtime = runtime_state
                    .active_runtime
                    .lock()
                    .expect("hotkey runtime state lock poisoned");
                *runtime = Some(ActiveHotkeyRuntime::Native { handle });
            }
            let diagnostics =
                resolve_hotkey_backend_diagnostics(HotkeyBackendMode::NativeHook, None);
            platform_runtime::sync_hotkey_backend_diagnostics(
                app,
                diagnostics.backend_label,
                diagnostics.error_message,
            )?;
            state.push_info_log(format!("原生键盘 Hook 已就绪: {}。", hotkey.display()));
            if supplemental_registered {
                state.push_info_log(format!("已启用单键热键辅助注册: {}。", hotkey.display()));
            }
            emit_logs_updated(app, &state)?;
            Ok(())
        }
        Err(native_error) => match register_fallback_hotkey(app, &hotkey) {
            Ok(()) => {
                {
                    let runtime_state = app.state::<HotkeyRuntimeState>();
                    let mut runtime = runtime_state
                        .active_runtime
                        .lock()
                        .expect("hotkey runtime state lock poisoned");
                    *runtime = Some(ActiveHotkeyRuntime::GlobalShortcut);
                }
                let diagnostics = resolve_hotkey_backend_diagnostics(
                    HotkeyBackendMode::GlobalShortcutFallback,
                    Some(&native_error),
                );
                platform_runtime::sync_hotkey_backend_diagnostics(
                    app,
                    diagnostics.backend_label,
                    diagnostics.error_message,
                )?;
                state.push_error_log(format!("原生键盘 Hook 启动失败: {native_error}"));
                state.push_info_log(format!("已降级到全局快捷键: {}。", hotkey.display()));
                emit_logs_updated(app, &state)?;
                Ok(())
            }
            Err(fallback_error) => {
                let combined_error = format!(
                    "原生键盘 Hook 启动失败: {native_error}；全局快捷键注册失败: {fallback_error}"
                );
                let diagnostics = resolve_hotkey_backend_diagnostics(
                    HotkeyBackendMode::Unavailable,
                    Some(&combined_error),
                );
                platform_runtime::sync_hotkey_backend_diagnostics(
                    app,
                    diagnostics.backend_label,
                    diagnostics.error_message,
                )?;
                state.push_error_log(combined_error.clone());
                emit_logs_updated(app, &state)?;
                Err(combined_error)
            }
        },
    }
}

#[cfg(desktop)]
fn start_native_hook_runtime(
    app: &AppHandle,
    hotkey: GlobalHotkey,
) -> Result<Box<dyn KeyboardHookHandle>, String> {
    let backend = create_platform_keyboard_hook_backend().map_err(|cause| cause.to_string())?;
    let app_handle = app.clone();
    let callback_hotkey = hotkey.clone();
    let callback = Arc::new(move |event: KeyboardHookEvent| {
        if let Some(reason) = event.cancellation_reason() {
            let state = app_handle.state::<AppState>();
            state.push_error_log(format!("原生键盘 Hook 已停止: {reason}"));
            let diagnostics =
                resolve_hotkey_backend_diagnostics(HotkeyBackendMode::Unavailable, Some(reason));
            let _ = platform_runtime::sync_hotkey_backend_diagnostics(
                &app_handle,
                diagnostics.backend_label,
                diagnostics.error_message,
            );
            let _ = emit_logs_updated(&app_handle, &state);
            return;
        }

        match route_native_hook_event(&callback_hotkey, &event) {
            HookEventRoutingDecision::Pressed { ts_ms } => {
                let _ = handle_hotkey_pressed(&app_handle, ts_ms);
            }
            HookEventRoutingDecision::Released { ts_ms } => {
                let _ = handle_hotkey_released(&app_handle, ts_ms);
            }
            HookEventRoutingDecision::Ignore => {}
        }
    });

    backend.start(callback).map_err(|cause| cause.to_string())
}

#[cfg(desktop)]
fn teardown_hotkey_runtime(app: &AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|cause| format!("清理旧热键失败: {cause}"))?;

    reset_hotkey_event_deduper(app);

    if let Some(runtime) = app
        .state::<HotkeyRuntimeState>()
        .active_runtime
        .lock()
        .expect("hotkey runtime state lock poisoned")
        .take()
    {
        if let ActiveHotkeyRuntime::Native { mut handle } = runtime {
            handle.close().map_err(|cause| cause.to_string())?;
        }
    }

    Ok(())
}

#[cfg(desktop)]
fn register_supplemental_single_key_shortcut(
    app: &AppHandle,
    hotkey: &GlobalHotkey,
) -> Result<bool, String> {
    if !should_register_supplemental_single_key_shortcut(hotkey) {
        return Ok(false);
    }

    // 单键热键沿用 TS 版本的“原生 Hook + 全局快捷键辅助注册”策略，
    // 提升 Home / PageDown / 字符键这类按键在系统层的触发稳定性。
    register_fallback_hotkey(app, hotkey)
        .map(|_| true)
        .map_err(|cause| cause.to_string())
}

fn should_register_supplemental_single_key_shortcut(hotkey: &GlobalHotkey) -> bool {
    hotkey.modifier_count() == 0 && !hotkey.is_modifier_only_key()
}

#[cfg(desktop)]
fn register_fallback_hotkey(
    app: &AppHandle,
    hotkey: &GlobalHotkey,
) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(message) = fallback_hotkey_validation_error(hotkey) {
        return Err(std::io::Error::other(message).into());
    }

    app.global_shortcut()
        .on_shortcut(hotkey.accelerator(), move |app, _, event| {
            match event.state {
                ShortcutState::Pressed => {
                    let _ = handle_hotkey_pressed(app, current_time_ms());
                }
                ShortcutState::Released => {
                    let _ = handle_hotkey_released(app, current_time_ms());
                }
            }
        })?;
    Ok(())
}

#[cfg(desktop)]
fn handle_hotkey_pressed(app: &AppHandle, ts_ms: u64) -> Result<(), String> {
    if should_skip_duplicate_hotkey_event(app, HotkeyEdge::Pressed) {
        return Ok(());
    }
    let state = app.state::<AppState>();
    if let Some(outcome) = state.handle_hotkey_pressed(ts_ms)? {
        let _ = commands::handle_task_start_outcome(app, &state, outcome)?;
    }
    schedule_interrupt_restart(app.clone());
    Ok(())
}

#[cfg(desktop)]
fn handle_hotkey_released(app: &AppHandle, ts_ms: u64) -> Result<(), String> {
    if should_skip_duplicate_hotkey_event(app, HotkeyEdge::Released) {
        return Ok(());
    }
    let state = app.state::<AppState>();
    if let Some(outcome) = state.handle_hotkey_released(ts_ms)? {
        match outcome {
            crate::app_state::HotkeyReleaseOutcome::TaskStarted(outcome) => {
                let _ = commands::handle_task_start_outcome(app, &state, outcome)?;
            }
            crate::app_state::HotkeyReleaseOutcome::Snapshot(snapshot) => {
                let _ = commands::sync_and_emit_runtime(app, &state, snapshot)?;
            }
        }
    }
    Ok(())
}

#[cfg(desktop)]
fn schedule_interrupt_restart(app: AppHandle) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(HOTKEY_RESTART_THRESHOLD_MS));
        let state = app.state::<AppState>();
        if let Ok(Some(outcome)) = state.continue_hotkey_task(current_time_ms()) {
            let _ = commands::handle_task_start_outcome(&app, &state, outcome);
        }
    });
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default()
}

fn should_skip_duplicate_hotkey_event(app: &AppHandle, edge: HotkeyEdge) -> bool {
    let runtime_state = app.state::<HotkeyRuntimeState>();
    let mut deduper = runtime_state
        .event_deduper
        .lock()
        .expect("hotkey runtime state lock poisoned");
    deduper.should_skip(edge, current_time_ms())
}

fn reset_hotkey_event_deduper(app: &AppHandle) {
    let runtime_state = app.state::<HotkeyRuntimeState>();
    let mut deduper = runtime_state
        .event_deduper
        .lock()
        .expect("hotkey runtime state lock poisoned");
    *deduper = HotkeyEventDeduper::default();
}

fn emit_logs_updated(app: &AppHandle, state: &AppState) -> Result<(), String> {
    app.emit("logs-updated", state.runtime_logs())
        .map_err(|cause| cause.to_string())
}

#[cfg(test)]
mod tests {
    use automation_core::GlobalHotkey;

    use super::{
        should_register_supplemental_single_key_shortcut, HotkeyEdge, HotkeyEventDeduper,
        DUPLICATE_HOTKEY_EVENT_WINDOW_MS,
    };

    #[test]
    fn supplemental_shortcut_is_enabled_for_single_home_key() {
        let hotkey = GlobalHotkey::parse("Home").expect("hotkey should parse");

        assert!(should_register_supplemental_single_key_shortcut(&hotkey));
    }

    #[test]
    fn supplemental_shortcut_skips_modifier_only_hotkeys() {
        let hotkey = GlobalHotkey::parse("RightAlt").expect("hotkey should parse");

        assert!(!should_register_supplemental_single_key_shortcut(&hotkey));
    }

    #[test]
    fn supplemental_shortcut_skips_multi_key_combinations() {
        let hotkey = GlobalHotkey::parse("LeftCtrl+K").expect("hotkey should parse");

        assert!(!should_register_supplemental_single_key_shortcut(&hotkey));
    }

    #[test]
    fn event_deduper_skips_same_edge_within_window() {
        let mut deduper = HotkeyEventDeduper::default();

        assert!(!deduper.should_skip(HotkeyEdge::Pressed, 1_000));
        assert!(deduper.should_skip(
            HotkeyEdge::Pressed,
            1_000 + DUPLICATE_HOTKEY_EVENT_WINDOW_MS
        ));
        assert!(!deduper.should_skip(
            HotkeyEdge::Released,
            1_000 + DUPLICATE_HOTKEY_EVENT_WINDOW_MS
        ));
        assert!(!deduper.should_skip(
            HotkeyEdge::Pressed,
            1_000 + DUPLICATE_HOTKEY_EVENT_WINDOW_MS * 2 + 1
        ));
    }
}
