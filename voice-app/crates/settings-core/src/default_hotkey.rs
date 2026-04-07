pub const DEFAULT_HOTKEY: &str = "RightAlt";
pub const INVALID_DEFAULT_HOTKEY_MESSAGE: &str =
    "默认热键格式无效，请使用类似 RightAlt 或 LeftCtrl+K 的格式。";

const EXACT_MODIFIER_ORDER: [(&str, u8); 8] = [
    ("LeftCtrl", 10),
    ("RightCtrl", 11),
    ("LeftShift", 20),
    ("RightShift", 21),
    ("LeftAlt", 30),
    ("RightAlt", 31),
    ("LeftMeta", 40),
    ("RightMeta", 41),
];

pub fn normalize_stored_default_hotkey(value: &str) -> String {
    canonicalize_default_hotkey(value).unwrap_or_else(|| DEFAULT_HOTKEY.to_string())
}

pub fn parse_save_default_hotkey(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("默认热键不能为空。".to_string());
    }

    canonicalize_default_hotkey(trimmed).ok_or_else(|| INVALID_DEFAULT_HOTKEY_MESSAGE.to_string())
}

fn canonicalize_default_hotkey(value: &str) -> Option<String> {
    let trimmed = strip_legacy_prefix(value.trim());
    if trimmed.is_empty() {
        return None;
    }

    let mut tokens = trimmed
        .split('+')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(normalize_exact_token)
        .collect::<Option<Vec<_>>>()?;

    if tokens.is_empty() {
        return None;
    }

    tokens.sort_by(|left, right| {
        token_order(left)
            .cmp(&token_order(right))
            .then_with(|| left.cmp(right))
    });
    tokens.dedup();

    Some(tokens.join("+"))
}

fn strip_legacy_prefix(value: &str) -> &str {
    strip_prefix_ascii_case(value, "Hold ")
        .or_else(|| strip_prefix_ascii_case(value, "Press "))
        .unwrap_or(value)
}

fn strip_prefix_ascii_case<'a>(value: &'a str, prefix: &str) -> Option<&'a str> {
    let value_bytes = value.as_bytes();
    let prefix_bytes = prefix.as_bytes();
    if value_bytes.len() < prefix_bytes.len() {
        return None;
    }

    if value_bytes[..prefix_bytes.len()].eq_ignore_ascii_case(prefix_bytes) {
        return Some(&value[prefix.len()..]);
    }

    None
}

fn token_order(token: &str) -> u8 {
    EXACT_MODIFIER_ORDER
        .iter()
        .find_map(|(candidate, order)| (*candidate == token).then_some(*order))
        .unwrap_or(100)
}

fn normalize_exact_token(value: &str) -> Option<String> {
    let compact = value.trim().replace(' ', "");
    if compact.is_empty() {
        return None;
    }

    let lower = compact.to_ascii_lowercase();
    if is_generic_modifier_token(&lower) {
        return None;
    }

    match lower.as_str() {
        "leftcontrol" | "controlleft" | "leftctrl" | "ctrlleft" => Some("LeftCtrl".to_string()),
        "rightcontrol" | "controlright" | "rightctrl" | "ctrlright" => {
            Some("RightCtrl".to_string())
        }
        "leftshift" | "shiftleft" => Some("LeftShift".to_string()),
        "rightshift" | "shiftright" => Some("RightShift".to_string()),
        "leftalt" | "altleft" | "optionleft" => Some("LeftAlt".to_string()),
        "rightalt" | "altright" | "optionright" => Some("RightAlt".to_string()),
        "leftmeta" | "metaleft" | "leftcmd" | "cmdleft" | "leftcommand" | "commandleft"
        | "leftsuper" | "superleft" | "leftwin" | "winleft" | "leftwindows" | "windowsleft" => {
            Some("LeftMeta".to_string())
        }
        "rightmeta" | "metaright" | "rightcmd" | "cmdright" | "rightcommand" | "commandright"
        | "rightsuper" | "superright" | "rightwin" | "winright" | "rightwindows"
        | "windowsright" => Some("RightMeta".to_string()),
        "capslock" => Some("CapsLock".to_string()),
        "enter" | "return" => Some("Enter".to_string()),
        "space" | "spacebar" => Some("Space".to_string()),
        "tab" => Some("Tab".to_string()),
        "escape" | "esc" => Some("Escape".to_string()),
        "backspace" => Some("Backspace".to_string()),
        "insert" => Some("Insert".to_string()),
        "delete" | "forwarddelete" => Some("Delete".to_string()),
        "home" => Some("Home".to_string()),
        "end" => Some("End".to_string()),
        "pageup" => Some("PageUp".to_string()),
        "pagedown" => Some("PageDown".to_string()),
        "printscreen" => Some("PrintScreen".to_string()),
        "numlock" => Some("NumLock".to_string()),
        "scrolllock" => Some("ScrollLock".to_string()),
        "arrowleft" | "left" => Some("ArrowLeft".to_string()),
        "arrowright" | "right" => Some("ArrowRight".to_string()),
        "arrowup" | "up" => Some("ArrowUp".to_string()),
        "arrowdown" | "down" => Some("ArrowDown".to_string()),
        "backquote" | "grave" | "`" => Some("`".to_string()),
        "minus" | "-" => Some("-".to_string()),
        "equal" | "=" => Some("=".to_string()),
        "bracketleft" | "[" => Some("[".to_string()),
        "bracketright" | "]" => Some("]".to_string()),
        "backslash" | "\\" => Some("\\".to_string()),
        "semicolon" | ";" => Some(";".to_string()),
        "quote" | "'" => Some("'".to_string()),
        "comma" | "," => Some(",".to_string()),
        "period" | "." => Some(".".to_string()),
        "slash" | "/" => Some("/".to_string()),
        _ => normalize_letter_digit_or_function_key(&compact, &lower),
    }
}

fn normalize_letter_digit_or_function_key(compact: &str, lower: &str) -> Option<String> {
    if compact.len() == 1 && compact.chars().all(|value| value.is_ascii_alphabetic()) {
        return Some(compact.to_ascii_uppercase());
    }

    if compact.len() == 1 && compact.chars().all(|value| value.is_ascii_digit()) {
        return Some(compact.to_string());
    }

    if let Some(letter) = lower.strip_prefix("key") {
        if letter.len() == 1 && letter.chars().all(|value| value.is_ascii_alphabetic()) {
            return Some(letter.to_ascii_uppercase());
        }
    }

    if let Some(digit) = lower.strip_prefix("digit") {
        if digit.len() == 1 && digit.chars().all(|value| value.is_ascii_digit()) {
            return Some(digit.to_string());
        }
    }

    let function_key = lower.strip_prefix('f')?;
    let number = function_key.parse::<u8>().ok()?;
    (1..=24).contains(&number).then(|| format!("F{number}"))
}

fn is_generic_modifier_token(value: &str) -> bool {
    matches!(
        value,
        "ctrl"
            | "control"
            | "shift"
            | "alt"
            | "meta"
            | "command"
            | "cmd"
            | "commandorcontrol"
            | "option"
            | "super"
            | "win"
            | "windows"
    )
}

#[cfg(test)]
mod tests {
    use super::{normalize_stored_default_hotkey, parse_save_default_hotkey, DEFAULT_HOTKEY};

    #[test]
    fn normalize_stored_hotkey_falls_back_for_legacy_generic_modifier_format() {
        assert_eq!(
            normalize_stored_default_hotkey("Hold Alt+Space"),
            DEFAULT_HOTKEY
        );
    }

    #[test]
    fn normalize_stored_hotkey_canonicalizes_exact_side_tokens() {
        assert_eq!(
            normalize_stored_default_hotkey(" keyk + controlleft "),
            "LeftCtrl+K"
        );
    }

    #[test]
    fn parse_save_hotkey_rejects_generic_modifier_tokens() {
        assert!(parse_save_default_hotkey("Alt+Space").is_err());
    }
}
