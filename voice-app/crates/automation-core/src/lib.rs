mod global_hotkey;
mod hold_to_talk;
mod keyboard_hook;
#[cfg(target_os = "macos")]
mod macos_keyboard_hook;
mod tool_execution;
#[cfg(target_os = "windows")]
mod windows_keyboard_hook;

pub use global_hotkey::{GlobalHotkey, HotkeyParseError};
pub use hold_to_talk::{
    HoldToTalkController, HotkeyPressDecision, HotkeyReleaseDecision, RuntimeHotkeyPhase,
    HOTKEY_RESTART_THRESHOLD_MS,
};
pub use keyboard_hook::{
    create_platform_keyboard_hook_backend, current_platform_keyboard_hook_backend_label,
    native_keyboard_hook_supported, KeyboardHookBackend, KeyboardHookError, KeyboardHookEvent,
    KeyboardHookEventCallback, KeyboardHookHandle,
};
pub use tool_execution::{
    SystemToolExecutor, ToolExecutionRequest, ToolExecutionRuntimePhase, ToolExecutor,
};
