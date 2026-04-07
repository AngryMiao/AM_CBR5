use std::error::Error;
use std::fmt::{Display, Formatter};

use crate::keyboard_hook::{normalize_key_token, normalize_modifier_token};
use crate::KeyboardHookEvent;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlobalHotkey {
    display: String,
    accelerator: String,
    primary_key: String,
    modifier_count: usize,
    modifiers: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HotkeyParseError {
    message: String,
}

impl Display for HotkeyParseError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for HotkeyParseError {}

impl GlobalHotkey {
    pub fn parse(display_label: &str) -> Result<Self, HotkeyParseError> {
        let display = display_label.trim();

        if display.is_empty() {
            return Err(HotkeyParseError {
                message: "热键不能为空。".to_string(),
            });
        }

        let shortcut = display
            .strip_prefix("Hold ")
            .or_else(|| display.strip_prefix("Press "))
            .unwrap_or(display);

        let tokens = shortcut
            .split('+')
            .map(str::trim)
            .filter(|token| !token.is_empty())
            .collect::<Vec<_>>();

        if tokens.is_empty() {
            return Err(HotkeyParseError {
                message: "热键至少需要一个有效按键。".to_string(),
            });
        }

        let primary_key = tokens
            .last()
            .expect("tokens should not be empty")
            .to_string();
        let mut modifiers = tokens[..tokens.len().saturating_sub(1)]
            .iter()
            .map(|token| normalize_modifier_token(*token))
            .collect::<Vec<_>>();
        modifiers.sort();
        modifiers.dedup();
        let modifier_count = modifiers.len();
        let accelerator = tokens
            .iter()
            .map(|token| normalize_accelerator_token(token))
            .collect::<Vec<_>>()
            .join("+");

        Ok(Self {
            display: display.to_string(),
            accelerator,
            primary_key: normalize_key_token(primary_key),
            modifier_count,
            modifiers,
        })
    }

    pub fn display(&self) -> &str {
        &self.display
    }

    pub fn accelerator(&self) -> &str {
        &self.accelerator
    }

    pub fn primary_key(&self) -> &str {
        &self.primary_key
    }

    pub fn modifier_count(&self) -> usize {
        self.modifier_count
    }

    pub fn needs_input_echo_cleanup(&self) -> bool {
        if self.modifier_count > 0 {
            return false;
        }

        let normalized = self.primary_key.to_ascii_lowercase();
        normalized == "space" || normalized.chars().count() == 1
    }

    pub fn is_modifier_only_key(&self) -> bool {
        matches!(
            self.primary_key.as_str(),
            "Alt"
                | "Control"
                | "Shift"
                | "Meta"
                | "LeftAlt"
                | "RightAlt"
                | "LeftCtrl"
                | "RightCtrl"
                | "LeftShift"
                | "RightShift"
                | "LeftMeta"
                | "RightMeta"
        )
    }

    pub fn matches_pressed_event(&self, event: &KeyboardHookEvent) -> bool {
        self.matches_event(event, true)
    }

    pub fn matches_released_event(&self, event: &KeyboardHookEvent) -> bool {
        self.matches_event(event, false)
    }

    fn matches_event(&self, event: &KeyboardHookEvent, pressed: bool) -> bool {
        if pressed && !event.is_pressed() {
            return false;
        }

        if !pressed && !event.is_released() {
            return false;
        }

        let Some(key) = event.key() else {
            return false;
        };

        if !hotkey_token_matches(self.primary_key(), &normalize_key_token(key)) {
            return false;
        }

        let mut actual_modifiers = event
            .modifiers()
            .iter()
            .map(|value| normalize_modifier_token(value.as_str()))
            .collect::<Vec<_>>();
        actual_modifiers.sort();
        actual_modifiers.dedup();

        hotkey_tokens_match(self.modifiers.as_slice(), actual_modifiers.as_slice())
    }
}

fn normalize_accelerator_token(value: &str) -> String {
    match normalize_key_token(value).as_str() {
        "LeftAlt" | "RightAlt" => "Alt".to_string(),
        "LeftCtrl" | "RightCtrl" => "Control".to_string(),
        "LeftShift" | "RightShift" => "Shift".to_string(),
        "LeftMeta" | "RightMeta" => "Meta".to_string(),
        normalized => normalized.to_string(),
    }
}

fn hotkey_tokens_match(expected: &[String], actual: &[String]) -> bool {
    if expected.len() != actual.len() {
        return false;
    }

    let mut remaining = actual.to_vec();
    for expected_token in expected {
        let Some(index) = remaining
            .iter()
            .position(|actual_token| hotkey_token_matches(expected_token, actual_token))
        else {
            return false;
        };
        remaining.remove(index);
    }

    remaining.is_empty()
}

fn hotkey_token_matches(expected: &str, actual: &str) -> bool {
    if expected == actual {
        return true;
    }

    match expected {
        "Alt" => matches!(actual, "Alt" | "LeftAlt" | "RightAlt"),
        "Control" => matches!(actual, "Control" | "LeftCtrl" | "RightCtrl"),
        "Shift" => matches!(actual, "Shift" | "LeftShift" | "RightShift"),
        "Meta" => matches!(actual, "Meta" | "LeftMeta" | "RightMeta"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::GlobalHotkey;

    #[test]
    fn recognizes_modifier_only_hotkeys() {
        let hotkey = GlobalHotkey::parse("RightAlt").expect("hotkey should parse");

        assert!(hotkey.is_modifier_only_key());
    }

    #[test]
    fn recognizes_combination_hotkeys_as_non_modifier_only() {
        let hotkey = GlobalHotkey::parse("LeftCtrl+Space").expect("hotkey should parse");

        assert!(!hotkey.is_modifier_only_key());
    }
}
