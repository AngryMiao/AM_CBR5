use automation_core::{GlobalHotkey, KeyboardHookEvent};
use voice_app_desktop_lib::{
    fallback_hotkey_validation_error, resolve_hotkey_backend_diagnostics,
    resolve_hotkey_backend_mode, route_native_hook_event, HookEventRoutingDecision,
    HotkeyBackendDiagnostics, HotkeyBackendMode,
};

#[test]
fn prefers_native_hook_when_it_is_available() {
    assert_eq!(
        resolve_hotkey_backend_mode(true, true),
        HotkeyBackendMode::NativeHook
    );
}

#[test]
fn falls_back_to_global_shortcut_when_native_hook_is_unavailable() {
    assert_eq!(
        resolve_hotkey_backend_mode(false, true),
        HotkeyBackendMode::GlobalShortcutFallback
    );
}

#[test]
fn reports_unavailable_when_no_backend_can_start() {
    assert_eq!(
        resolve_hotkey_backend_mode(false, false),
        HotkeyBackendMode::Unavailable
    );
}

#[test]
fn routes_matching_pressed_native_hook_event() {
    let hotkey = GlobalHotkey::parse("Hold Alt+Space").expect("hotkey should parse");
    let event = KeyboardHookEvent::pressed("Space", ["Alt"], 1_000);

    assert_eq!(
        route_native_hook_event(&hotkey, &event),
        HookEventRoutingDecision::Pressed { ts_ms: 1_000 }
    );
}

#[test]
fn routes_matching_released_native_hook_event() {
    let hotkey = GlobalHotkey::parse("Hold Alt+Space").expect("hotkey should parse");
    let event = KeyboardHookEvent::released("Space", ["Alt"], 1_200);

    assert_eq!(
        route_native_hook_event(&hotkey, &event),
        HookEventRoutingDecision::Released { ts_ms: 1_200 }
    );
}

#[test]
fn ignores_non_matching_native_hook_event() {
    let hotkey = GlobalHotkey::parse("Hold Alt+Space").expect("hotkey should parse");
    let event = KeyboardHookEvent::pressed("KeyA", ["Alt"], 1_000);

    assert_eq!(
        route_native_hook_event(&hotkey, &event),
        HookEventRoutingDecision::Ignore
    );
}

#[test]
fn native_backend_diagnostics_clear_previous_error() {
    assert_eq!(
        resolve_hotkey_backend_diagnostics(HotkeyBackendMode::NativeHook, Some("native failed")),
        HotkeyBackendDiagnostics {
            backend_label: "原生键盘 Hook".to_string(),
            error_message: None,
        }
    );
}

#[test]
fn fallback_backend_diagnostics_preserve_native_error() {
    assert_eq!(
        resolve_hotkey_backend_diagnostics(
            HotkeyBackendMode::GlobalShortcutFallback,
            Some("native failed"),
        ),
        HotkeyBackendDiagnostics {
            backend_label: "全局快捷键降级".to_string(),
            error_message: Some("native failed".to_string()),
        }
    );
}

#[test]
fn unavailable_backend_diagnostics_marks_runtime_as_unavailable() {
    assert_eq!(
        resolve_hotkey_backend_diagnostics(HotkeyBackendMode::Unavailable, Some("all failed")),
        HotkeyBackendDiagnostics {
            backend_label: "不可用".to_string(),
            error_message: Some("all failed".to_string()),
        }
    );
}

#[test]
fn routes_exact_right_alt_pressed_without_left_alt_alias() {
    let hotkey = GlobalHotkey::parse("RightAlt").expect("hotkey should parse");

    assert_eq!(
        route_native_hook_event(
            &hotkey,
            &KeyboardHookEvent::pressed("RightAlt", Vec::<&str>::new(), 2_000),
        ),
        HookEventRoutingDecision::Pressed { ts_ms: 2_000 }
    );
    assert_eq!(
        route_native_hook_event(
            &hotkey,
            &KeyboardHookEvent::pressed("LeftAlt", Vec::<&str>::new(), 2_100),
        ),
        HookEventRoutingDecision::Ignore
    );
}

#[test]
fn routes_single_home_key_pressed_event() {
    let hotkey = GlobalHotkey::parse("Home").expect("hotkey should parse");

    assert_eq!(
        route_native_hook_event(
            &hotkey,
            &KeyboardHookEvent::pressed("Home", Vec::<&str>::new(), 3_000),
        ),
        HookEventRoutingDecision::Pressed { ts_ms: 3_000 }
    );
}

#[test]
fn routes_single_home_key_released_event() {
    let hotkey = GlobalHotkey::parse("Home").expect("hotkey should parse");

    assert_eq!(
        route_native_hook_event(
            &hotkey,
            &KeyboardHookEvent::released("Home", Vec::<&str>::new(), 3_120),
        ),
        HookEventRoutingDecision::Released { ts_ms: 3_120 }
    );
}

#[test]
fn fallback_backend_rejects_modifier_only_hotkeys_with_clear_message() {
    let hotkey = GlobalHotkey::parse("RightAlt").expect("hotkey should parse");

    assert_eq!(
        fallback_hotkey_validation_error(&hotkey).as_deref(),
        Some("当前热键为单独修饰键，仅原生键盘 Hook 支持；请改用组合键或恢复原生 Hook。")
    );
}

#[test]
fn fallback_backend_allows_combination_hotkeys() {
    let hotkey = GlobalHotkey::parse("LeftCtrl+Space").expect("hotkey should parse");

    assert_eq!(fallback_hotkey_validation_error(&hotkey), None);
}
