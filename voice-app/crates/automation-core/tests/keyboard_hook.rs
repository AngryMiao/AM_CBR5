use automation_core::{
    create_platform_keyboard_hook_backend, current_platform_keyboard_hook_backend_label,
    native_keyboard_hook_supported, KeyboardHookEvent,
};

#[test]
fn keyboard_hook_pressed_event_normalizes_primary_key_and_modifiers() {
    let event = KeyboardHookEvent::pressed(" space ", ["Alt", " Shift "], 1_000);

    assert_eq!(event.key(), Some("Space"));
    assert_eq!(event.modifiers(), ["Alt", "Shift"]);
    assert_eq!(event.timestamp_ms(), 1_000);
    assert!(event.is_pressed());
    assert!(!event.is_released());
}

#[test]
fn keyboard_hook_released_event_preserves_timestamp() {
    let event = KeyboardHookEvent::released("KeyA", ["Control"], 1_250);

    assert_eq!(event.key(), Some("A"));
    assert_eq!(event.modifiers(), ["Control"]);
    assert_eq!(event.timestamp_ms(), 1_250);
    assert!(event.is_released());
    assert!(!event.is_pressed());
}

#[test]
fn keyboard_hook_cancelled_event_has_no_key_or_modifiers() {
    let event = KeyboardHookEvent::cancelled("hook thread exited", 1_500);

    assert_eq!(event.key(), None);
    assert!(event.modifiers().is_empty());
    assert_eq!(event.timestamp_ms(), 1_500);
    assert_eq!(event.cancellation_reason(), Some("hook thread exited"));
}

#[test]
fn platform_keyboard_hook_factory_matches_current_support_matrix() {
    let backend = create_platform_keyboard_hook_backend();

    if native_keyboard_hook_supported() {
        assert!(
            backend.is_ok(),
            "supported platform should construct backend"
        );
        assert!(!current_platform_keyboard_hook_backend_label().is_empty());
    } else {
        match backend {
            Ok(_) => panic!("unsupported platform should return error"),
            Err(error) => assert!(error.to_string().contains("不支持")),
        }
    }
}
