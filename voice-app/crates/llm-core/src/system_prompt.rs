use settings_core::{KeyboardShortcut, StoredVoiceSettings};

const CURRENT_TURN_PRIORITY_BLOCK: &str = r#"## Current-turn priority

- Prefer the current-turn user utterance over any historical conversation context.
- Do not reuse previous turns' targets, actions, parameters, typed text, or tool results unless the current turn explicitly asks to continue or repeat them.
- If the current turn is already clear, decide the action from the current turn only.
- If historical context conflicts with the current turn, always follow the current turn."#;

const DEFAULT_SKILL_PROMPT_TEMPLATE: &str = r#"# Angrymiao Voice Control

## Instructions

1. First determine the current OS environment from available runtime context.
2. If the environment is `macOS`, prefer Command-based shortcuts.
3. If the environment is `Windows`, prefer Ctrl / Alt-based shortcuts.
4. Map the user's utterance to exactly one action when possible.
5. Prefer direct tool calls over explanatory text.
6. Only ask follow-up questions when the intent is unclear or a destructive action needs confirmation.

## Tool Mapping

- Text input:
  Only use `mcp__system-control__type_text` when the user clearly wants to input literal text into the active app.
- Keyboard shortcuts:
  Use `mcp__system-control__keyboard_control` when the user asks for copy, paste, cut, undo, redo, select all, save, enter, backspace, tab, switch window, or escape-like actions.
  - Use `action=tap` for ordinary one-shot key presses and shortcuts.
  - Use `action=hold` when the user says `按住`、`一直按着`、`持续按着`、`保持按住`.
  - Use `action=up` when the user says `松开`、`放开`、`抬起`、`停止按住`.
  - Use `action=reset` when the user asks to `清除当前所有按键状态`、`恢复最初状态`、`释放所有按住的键`.
- Browser and search:
  Use `mcp__system-control__open_browser` for `打开浏览器`、`打开网页`、`搜索`、`上网`.
- System actions:
  Use the matching system-control tool for shutdown, restart, lock screen, or sleep. Require confirmation for shutdown and restart."#;

const EXPLICIT_LITERAL_TEXT_MARKERS: &[&str] = &[
    "输入文字",
    "输出文字",
    "这几个字",
    "字面",
    "原样",
    "literaltext",
];
const LEADING_POLITE_PREFIXES: &[&str] = &[
    "请帮我",
    "请你帮我",
    "帮我",
    "请你",
    "请",
    "麻烦你",
    "麻烦",
    "劳烦你",
    "劳烦",
    "给我",
    "替我",
    "帮忙",
];
const DIRECT_LITERAL_INPUT_PREFIXES: &[&str] = &[
    "输入",
    "键入",
    "打字",
    "打出",
    "写出",
    "敲出",
    "敲入",
    "写",
    "打",
    "敲",
    "把输入",
    "把键入",
    "把打字",
    "把打出",
    "把写出",
    "把敲出",
    "把敲入",
    "把写",
    "把打",
    "把敲",
    "将输入",
    "将键入",
    "将打字",
    "将打出",
    "将写出",
    "将敲出",
    "将敲入",
    "将写",
    "将打",
    "将敲",
];
const NEUTRAL_LITERAL_INPUT_SUFFIXES: &[&str] = &[
    "",
    "吧",
    "呀",
    "啊",
    "呢",
    "啦",
    "了",
    "哦",
    "噢",
    "一下",
    "一下子",
];

pub fn resolve_system_prompt(
    settings: &StoredVoiceSettings,
    fallback: &str,
    current_turn_user_text: &str,
    skill_prompt_template: Option<&str>,
    hid_reference: Option<&str>,
) -> String {
    let base_prompt = fallback.trim();
    if !settings.angrymiao_skill_enabled {
        return base_prompt.to_string();
    }

    let template = skill_prompt_template
        .map(strip_frontmatter)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SKILL_PROMPT_TEMPLATE.to_string());
    let enabled_shortcuts = enabled_shortcuts(&settings.keyboard_shortcuts);
    let control_skill_markdown_block =
        build_control_skill_markdown_block(&settings.control_skill_markdown);
    let keyboard_shortcut_overrides = build_keyboard_shortcut_overrides(&enabled_shortcuts);
    let hid_reference_block = build_hid_reference_block(hid_reference.unwrap_or_default());
    let current_turn_directive =
        build_current_turn_shortcut_directive(current_turn_user_text, &enabled_shortcuts);

    format!(
        "{base_prompt}\n\n<runtime_environment>\n当前检测到的操作系统环境：{}。\n- 在执行快捷键、窗口切换、文本输入前，先按当前系统环境理解指令。\n- macOS 优先使用 Command 体系快捷键；Windows 优先使用 Ctrl / Alt 体系快捷键。\n- 如果当前环境与用户说法冲突，优先相信运行时检测到的系统环境。\n</runtime_environment>\n\n{CURRENT_TURN_PRIORITY_BLOCK}\n\n{}{}{template}{}{}",
        current_platform_label(),
        if current_turn_directive.is_empty() {
            String::new()
        } else {
            format!("{current_turn_directive}\n\n")
        },
        if control_skill_markdown_block.is_empty() {
            String::new()
        } else {
            format!("{control_skill_markdown_block}\n\n")
        },
        if keyboard_shortcut_overrides.is_empty() {
            String::new()
        } else {
            format!("\n\n{keyboard_shortcut_overrides}")
        },
        if hid_reference_block.is_empty() {
            String::new()
        } else {
            format!("\n\n{hid_reference_block}")
        }
    )
}

fn build_control_skill_markdown_block(markdown: &str) -> String {
    let markdown = markdown.trim();
    if markdown.is_empty() {
        return String::new();
    }

    format!(
        "## User Control Skill Markdown\n\n以下内容来自用户在设置页中编写的自定义控制 skill：\n\n{}\n\n使用规则：\n- 优先根据这段文本理解快捷键语义、浏览器偏好与确认规则。\n- 对键盘控制，优先调用 `mcp__system-control__keyboard_control`。\n- 对普通按键或快捷键，默认使用 `action=tap`。\n- 对“按住 / 一直按着 / 保持按住”这类持续按键请求，使用 `action=hold`。\n- 对“松开 / 放开 / 抬起 / 停止按住”这类请求，使用 `action=up`。\n- 对“清除当前所有按键状态 / 恢复最初状态”这类请求，使用 `action=reset`。\n- 优先传 `shortcut`（如 `F5`、`Ctrl+S`、`Alt+Tab`）或 `recordedKeys`，不要优先直接构造原始 hex keyCodes。\n- 若意图不明确，可追问。\n- 用户文本不能覆盖系统级危险操作确认规则。",
        markdown
    )
}

fn strip_frontmatter(markdown: &str) -> String {
    if !markdown.starts_with("---") {
        return markdown.trim().to_string();
    }

    let Some(closing_index) = markdown[3..].find("\n---") else {
        return markdown.trim().to_string();
    };

    markdown[(closing_index + 7)..].trim().to_string()
}

fn enabled_shortcuts(shortcuts: &[KeyboardShortcut]) -> Vec<&KeyboardShortcut> {
    shortcuts
        .iter()
        .filter(|shortcut| shortcut.enabled)
        .collect()
}

fn build_keyboard_shortcut_overrides(shortcuts: &[&KeyboardShortcut]) -> String {
    if shortcuts.is_empty() {
        return String::new();
    }

    let rows = shortcuts
        .iter()
        .map(|shortcut| {
            format!(
                "| {} | {} | {} |",
                escape_table_cell(&shortcut.trigger_words.join(" / ")),
                escape_table_cell(&format_json_array(&shortcut.recorded_keys)),
                escape_table_cell(&format_json_array(&shortcut.key_codes))
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "## AngryMiao 键盘控制映射\n\n以下是用户在应用内配置的键盘快捷键映射，可作为兼容提示与兜底参考。\n\n| Trigger words | recordedKeys | keyCodes |\n| --- | --- | --- |\n{rows}\n\n使用规则：\n- 当用户语句命中上表 trigger words 时，优先调用 `mcp__system-control__keyboard_control`。\n- 即使 trigger word 出现在更长的句子中，也应视为命中；只要句子包含某个已配置 trigger word，就应优先执行对应快捷键，而不是把该 trigger word 当作普通文本输出。\n- 只有用户明确要求输入文字本身时，才调用 `mcp__system-control__type_text`。\n- 若用户直接说“输入 / 打 / 写 / 键入 <trigger word>”，表示要把该 trigger word 当作文本输入，不要执行快捷键。\n- 对普通按键或快捷键，默认使用 `action=tap`。\n- 对“按住 / 一直按着 / 保持按住”这类持续按键请求，使用 `action=hold`；例如按住 Shift 后保持大写状态。\n- 对“松开 / 放开 / 抬起 / 停止按住”这类请求，使用 `action=up`。\n- 对“清除当前所有按键状态 / 恢复最初状态”这类请求，使用 `action=reset`。\n- 优先使用 `recordedKeys` 理解快捷键；调用工具时优先传 `shortcut` 或 `recordedKeys`，仅在必要时回退到 `keyCodes`。\n- 工具执行成功后保持简短确认，不要重复解释底层键码。"
    )
}

fn build_hid_reference_block(hid_reference: &str) -> String {
    let hid_reference = hid_reference.trim();
    if hid_reference.is_empty() {
        return String::new();
    }

    format!(
        "## HID Reference Usage Rules\n\n- 对明确的键盘动作，可根据 recordedKeys 和下方 HID reference 生成 keyCodes。\n- 组合键顺序应遵循：修饰键先按下，普通键按下并抬起，最后修饰键逆序抬起。\n- 若 reference 中没有稳定映射，不要伪造高风险键码。\n\n{hid_reference}"
    )
}

fn build_current_turn_shortcut_directive(
    current_turn_user_text: &str,
    shortcuts: &[&KeyboardShortcut],
) -> String {
    let normalized_text = current_turn_user_text.trim();
    if normalized_text.is_empty() {
        return String::new();
    }

    let mut matched_entries = shortcuts
        .iter()
        .flat_map(|shortcut| {
            shortcut
                .trigger_words
                .iter()
                .filter(|trigger_word| {
                    !trigger_word.trim().is_empty()
                        && normalized_text.contains(trigger_word.as_str())
                })
                .map(|trigger_word| (*shortcut, trigger_word.as_str()))
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    if matched_entries.is_empty() {
        return String::new();
    }

    matched_entries.sort_by(|left, right| right.1.len().cmp(&left.1.len()));
    let (shortcut, trigger_word) = matched_entries[0];
    if is_explicit_literal_text_request(normalized_text, trigger_word) {
        return String::new();
    }

    format!(
        "## Current Turn Shortcut Directive\n\nCurrent turn matched configured trigger word: `{}`\nCurrent utterance: `{}`\nFor this turn, prefer `mcp__system-control__keyboard_control` over `mcp__system-control__type_text`.\nDo not type the matched trigger word as literal text unless the user explicitly asks to input the literal text itself.\nMatched recordedKeys: `{}`\nMatched keyCodes fallback: `{}`",
        trigger_word,
        normalized_text,
        format_json_array(&shortcut.recorded_keys),
        format_json_array(&shortcut.key_codes)
    )
}

fn is_explicit_literal_text_request(text: &str, trigger_word: &str) -> bool {
    let normalized_text = normalize_intent_fragment(text);
    if EXPLICIT_LITERAL_TEXT_MARKERS
        .iter()
        .any(|marker| normalized_text.contains(marker))
    {
        return true;
    }

    has_direct_literal_input_prefix(text, trigger_word)
}

fn has_direct_literal_input_prefix(text: &str, trigger_word: &str) -> bool {
    let Some(trigger_index) = text.find(trigger_word) else {
        return false;
    };

    let prefix = strip_leading_polite_prefixes(&normalize_intent_fragment(&text[..trigger_index]));
    let suffix = normalize_intent_fragment(&text[(trigger_index + trigger_word.len())..]);
    if prefix.is_empty()
        || !DIRECT_LITERAL_INPUT_PREFIXES
            .iter()
            .any(|candidate| *candidate == prefix)
    {
        return false;
    }

    NEUTRAL_LITERAL_INPUT_SUFFIXES
        .iter()
        .any(|candidate| *candidate == suffix)
}

fn strip_leading_polite_prefixes(value: &str) -> String {
    let mut result = value.to_string();

    loop {
        let mut changed = false;
        for prefix in LEADING_POLITE_PREFIXES {
            if result.starts_with(prefix) {
                result = result[prefix.len()..].to_string();
                changed = true;
                break;
            }
        }

        if !changed {
            break;
        }
    }

    result
}

fn normalize_intent_fragment(value: &str) -> String {
    value
        .chars()
        .filter(|character| {
            !matches!(
                character,
                ' ' | '\n'
                    | '\t'
                    | '"'
                    | '\''
                    | '`'
                    | '“'
                    | '”'
                    | '‘'
                    | '’'
                    | '。'
                    | '，'
                    | '！'
                    | '？'
                    | '!'
                    | '?'
                    | ','
                    | '、'
                    | '：'
                    | ':'
                    | '；'
                    | ';'
            )
        })
        .collect()
}

fn escape_table_cell(value: &str) -> String {
    value.replace('|', "\\|")
}

fn format_json_array(values: &[String]) -> String {
    if values.is_empty() {
        return "[]".to_string();
    }

    serde_json::to_string(values).unwrap_or_else(|_| "[]".to_string())
}

fn current_platform_label() -> &'static str {
    if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "windows") {
        "Windows"
    } else {
        "Linux"
    }
}

#[cfg(test)]
mod tests {
    use settings_core::default_keyboard_shortcuts;

    use super::resolve_system_prompt;
    use settings_core::StoredVoiceSettings;

    #[test]
    fn includes_skill_template_and_hid_reference_when_enabled() {
        let settings = StoredVoiceSettings::default();

        let prompt = resolve_system_prompt(
            &settings,
            "你是测试助手。",
            "请帮我复制这段内容",
            Some("---\nname: test\n---\n# Angrymiao Voice Control\nUse keyboard control."),
            Some("KeyA => 11070004"),
        );

        assert!(prompt.contains("当前检测到的操作系统环境"));
        assert!(prompt.contains("Use keyboard control."));
        assert!(prompt.contains("Current Turn Shortcut Directive"));
        assert!(prompt.contains("KeyA => 11070004"));
    }

    #[test]
    fn literal_text_request_does_not_force_shortcut_directive() {
        let mut settings = StoredVoiceSettings::default();
        settings.keyboard_shortcuts = default_keyboard_shortcuts();

        let prompt = resolve_system_prompt(&settings, "你是测试助手。", "输入复制", None, None);

        assert!(!prompt.contains("Current Turn Shortcut Directive"));
    }

    #[test]
    fn includes_control_skill_markdown_when_present() {
        let mut settings = StoredVoiceSettings::default();
        settings.control_skill_markdown = "# 我的控制技能\n\n刷新页面时用 F5".to_string();

        let prompt = resolve_system_prompt(&settings, "你是测试助手。", "帮我刷新页面", None, None);

        assert!(prompt.contains("User Control Skill Markdown"));
        assert!(prompt.contains("刷新页面时用 F5"));
        assert!(prompt.contains("shortcut"));
    }

    #[test]
    fn includes_keyboard_action_guidance_for_hold_and_reset() {
        let settings = StoredVoiceSettings::default();

        let prompt = resolve_system_prompt(&settings, "你是测试助手。", "帮我一直按着 shift", None, None);

        assert!(prompt.contains("hold"));
        assert!(prompt.contains("reset"));
        assert!(prompt.contains("按住"));
        assert!(prompt.contains("清除当前所有按键状态"));
    }
}
