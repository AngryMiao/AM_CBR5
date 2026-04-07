use std::fmt::{Display, Formatter};
use std::sync::Arc;

#[cfg(target_os = "macos")]
use crate::macos_keyboard_hook::MacosKeyboardHookBackend;
#[cfg(target_os = "windows")]
use crate::windows_keyboard_hook::WindowsKeyboardHookBackend;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum KeyboardHookEvent {
    Pressed {
        key: String,
        modifiers: Vec<String>,
        ts_ms: u64,
    },
    Released {
        key: String,
        modifiers: Vec<String>,
        ts_ms: u64,
    },
    Cancelled {
        reason: String,
        ts_ms: u64,
    },
}

impl KeyboardHookEvent {
    pub fn pressed(
        key: impl Into<String>,
        modifiers: impl IntoIterator<Item = impl Into<String>>,
        ts_ms: u64,
    ) -> Self {
        Self::Pressed {
            key: normalize_key_token(key),
            modifiers: normalize_modifier_tokens(modifiers),
            ts_ms,
        }
    }

    pub fn released(
        key: impl Into<String>,
        modifiers: impl IntoIterator<Item = impl Into<String>>,
        ts_ms: u64,
    ) -> Self {
        Self::Released {
            key: normalize_key_token(key),
            modifiers: normalize_modifier_tokens(modifiers),
            ts_ms,
        }
    }

    pub fn cancelled(reason: impl Into<String>, ts_ms: u64) -> Self {
        Self::Cancelled {
            reason: reason.into().trim().to_string(),
            ts_ms,
        }
    }

    pub fn key(&self) -> Option<&str> {
        match self {
            Self::Pressed { key, .. } | Self::Released { key, .. } => Some(key.as_str()),
            Self::Cancelled { .. } => None,
        }
    }

    pub fn modifiers(&self) -> &[String] {
        match self {
            Self::Pressed { modifiers, .. } | Self::Released { modifiers, .. } => modifiers,
            Self::Cancelled { .. } => &[],
        }
    }

    pub fn timestamp_ms(&self) -> u64 {
        match self {
            Self::Pressed { ts_ms, .. }
            | Self::Released { ts_ms, .. }
            | Self::Cancelled { ts_ms, .. } => *ts_ms,
        }
    }

    pub fn is_pressed(&self) -> bool {
        matches!(self, Self::Pressed { .. })
    }

    pub fn is_released(&self) -> bool {
        matches!(self, Self::Released { .. })
    }

    pub fn cancellation_reason(&self) -> Option<&str> {
        match self {
            Self::Cancelled { reason, .. } => Some(reason.as_str()),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct KeyboardHookError {
    message: String,
}

impl KeyboardHookError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into().trim().to_string(),
        }
    }
}

impl Display for KeyboardHookError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for KeyboardHookError {}

pub type KeyboardHookEventCallback = Arc<dyn Fn(KeyboardHookEvent) + Send + Sync + 'static>;

pub trait KeyboardHookHandle: Send {
    fn close(&mut self) -> Result<(), KeyboardHookError>;
}

pub trait KeyboardHookBackend: Send + Sync {
    fn start(
        &self,
        callback: KeyboardHookEventCallback,
    ) -> Result<Box<dyn KeyboardHookHandle>, KeyboardHookError>;
}

pub fn create_platform_keyboard_hook_backend(
) -> Result<Box<dyn KeyboardHookBackend>, KeyboardHookError> {
    #[cfg(target_os = "windows")]
    {
        return Ok(Box::new(WindowsKeyboardHookBackend::new()));
    }

    #[cfg(target_os = "macos")]
    {
        return Ok(Box::new(MacosKeyboardHookBackend::new()));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Err(KeyboardHookError::new(
            "当前平台不支持原生键盘 Hook，仅支持 Windows 与 macOS。",
        ))
    }
}

pub fn native_keyboard_hook_supported() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos"))
}

pub fn current_platform_keyboard_hook_backend_label() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        return "Windows 原生键盘 Hook";
    }

    #[cfg(target_os = "macos")]
    {
        return "macOS 原生键盘 Hook";
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        "当前平台不支持原生键盘 Hook"
    }
}

pub(crate) fn normalize_key_token(value: impl Into<String>) -> String {
    normalize_token(value, false)
}

pub(crate) fn normalize_modifier_token(value: impl Into<String>) -> String {
    normalize_token(value, true)
}

fn normalize_modifier_tokens(
    modifiers: impl IntoIterator<Item = impl Into<String>>,
) -> Vec<String> {
    let mut normalized = modifiers
        .into_iter()
        .map(normalize_modifier_token)
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();
    normalized
}

fn normalize_token(value: impl Into<String>, modifier: bool) -> String {
    let raw = value.into();
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let compact = trimmed.replace(' ', "");
    let lower = compact.to_ascii_lowercase();

    match lower.as_str() {
        "leftalt" | "altleft" | "optionleft" => "LeftAlt".to_string(),
        "rightalt" | "altright" | "optionright" => "RightAlt".to_string(),
        "leftcontrol" | "controlleft" | "leftctrl" | "ctrlleft" => "LeftCtrl".to_string(),
        "rightcontrol" | "controlright" | "rightctrl" | "ctrlright" => "RightCtrl".to_string(),
        "leftshift" | "shiftleft" => "LeftShift".to_string(),
        "rightshift" | "shiftright" => "RightShift".to_string(),
        "leftmeta" | "metaleft" | "leftcmd" | "cmdleft" | "leftcommand" | "commandleft"
        | "leftsuper" | "superleft" | "leftwin" | "winleft" | "leftwindows" | "windowsleft" => {
            "LeftMeta".to_string()
        }
        "rightmeta" | "metaright" | "rightcmd" | "cmdright" | "rightcommand" | "commandright"
        | "rightsuper" | "superright" | "rightwin" | "winright" | "rightwindows"
        | "windowsright" => "RightMeta".to_string(),
        "alt" | "option" => "Alt".to_string(),
        "control" | "ctrl" => "Control".to_string(),
        "shift" => "Shift".to_string(),
        "meta" | "cmd" | "command" | "super" | "win" | "windows" => "Meta".to_string(),
        "space" | "spacebar" => "Space".to_string(),
        "enter" | "return" => "Enter".to_string(),
        "escape" | "esc" => "Escape".to_string(),
        "backspace" => "Backspace".to_string(),
        "delete" | "forwarddelete" => "Delete".to_string(),
        "tab" => "Tab".to_string(),
        "home" => "Home".to_string(),
        "end" => "End".to_string(),
        "pageup" => "PageUp".to_string(),
        "pagedown" => "PageDown".to_string(),
        "insert" => "Insert".to_string(),
        "arrowup" | "up" => "Up".to_string(),
        "arrowdown" | "down" => "Down".to_string(),
        "arrowleft" | "left" => "Left".to_string(),
        "arrowright" | "right" => "Right".to_string(),
        "minus" => "Minus".to_string(),
        "equal" => "Equal".to_string(),
        "backquote" | "grave" => "Backquote".to_string(),
        "bracketleft" => "BracketLeft".to_string(),
        "bracketright" => "BracketRight".to_string(),
        "backslash" => "Backslash".to_string(),
        "semicolon" => "Semicolon".to_string(),
        "quote" => "Quote".to_string(),
        "comma" => "Comma".to_string(),
        "period" => "Period".to_string(),
        "slash" => "Slash".to_string(),
        _ if modifier => compact,
        _ => {
            if let Some(letter) = normalize_letter_alias(&lower) {
                return letter;
            }

            if let Some(digit) = normalize_digit_alias(&lower) {
                return digit;
            }

            if let Some(function_key) = normalize_function_key_alias(&lower) {
                return function_key;
            }

            if compact.len() == 1 && compact.chars().all(|value| value.is_ascii_alphabetic()) {
                return compact.to_ascii_uppercase();
            }

            compact
        }
    }
}

fn normalize_letter_alias(value: &str) -> Option<String> {
    let normalized = value.strip_prefix("key").unwrap_or(value);
    if normalized.len() == 1 && normalized.chars().all(|item| item.is_ascii_alphabetic()) {
        return Some(normalized.to_ascii_uppercase());
    }

    None
}

fn normalize_digit_alias(value: &str) -> Option<String> {
    let normalized = value.strip_prefix("digit").unwrap_or(value);
    if normalized.len() == 1 && normalized.chars().all(|item| item.is_ascii_digit()) {
        return Some(normalized.to_string());
    }

    None
}

fn normalize_function_key_alias(value: &str) -> Option<String> {
    let normalized = value.strip_prefix('f')?;
    let number = normalized.parse::<u8>().ok()?;
    if (1..=24).contains(&number) {
        return Some(format!("F{number}"));
    }

    None
}
