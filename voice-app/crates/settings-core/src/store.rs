use std::collections::BTreeSet;
use std::path::Path;

use automation_core::GlobalHotkey;
use mcp_core::{McpServerConfig, McpTransportConfig};
use url::Url;

use crate::{
    normalize_stored_default_hotkey, parse_save_default_hotkey, EditableVoiceSettings,
    KeyboardShortcut, SaveEditableVoiceSettingsInput, StoredVoiceSettings,
};

pub struct SettingsStore;

impl SettingsStore {
    pub fn load_or_create(path: &Path) -> Result<StoredVoiceSettings, String> {
        if path.exists() {
            match Self::load(path) {
                Ok(settings) => {
                    Self::save(path, &settings)?;
                    return Ok(settings);
                }
                Err(_) => {
                    let settings = StoredVoiceSettings::default();
                    Self::save(path, &settings)?;
                    return Ok(settings);
                }
            }
        }

        let settings = StoredVoiceSettings::default();
        Self::save(path, &settings)?;
        Ok(settings)
    }

    pub fn load(path: &Path) -> Result<StoredVoiceSettings, String> {
        let raw = std::fs::read_to_string(path)
            .map_err(|cause| format!("读取 settings.json 失败: {cause}"))?;

        let mut settings = serde_json::from_str::<StoredVoiceSettings>(&raw)
            .map_err(|cause| format!("解析 settings.json 失败: {cause}"))?;
        settings.default_hotkey = normalize_stored_default_hotkey(&settings.default_hotkey);
        settings.normalize_code_owned_doubao_defaults();
        Ok(settings)
    }

    pub fn save(path: &Path, settings: &StoredVoiceSettings) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|cause| format!("创建 settings.json 目录失败: {cause}"))?;
        }

        let payload = serde_json::to_string_pretty(settings)
            .map_err(|cause| format!("序列化 settings.json 失败: {cause}"))?;

        std::fs::write(path, payload).map_err(|cause| format!("写入 settings.json 失败: {cause}"))
    }

    pub fn snapshot(settings: &StoredVoiceSettings) -> EditableVoiceSettings {
        EditableVoiceSettings::from_settings(settings)
    }

    pub fn apply_input(
        current: &StoredVoiceSettings,
        input: SaveEditableVoiceSettingsInput,
    ) -> Result<StoredVoiceSettings, String> {
        let mcp_servers = parse_mcp_servers_json(&input.mcp_servers_json)?;
        let mut next_settings = current.clone();

        next_settings.schema_version = crate::SETTINGS_SCHEMA_VERSION;
        next_settings.history_enabled = input.history_enabled;
        next_settings.auto_launch_enabled = input.auto_launch_enabled;
        next_settings.default_hotkey = input.default_hotkey.trim().to_string();
        next_settings.microphone_device_id = input.microphone_device_id.trim().to_string();
        next_settings.doubao_asr_url = input.doubao_asr_url.trim().to_string();
        next_settings.doubao_asr_app_id = input.doubao_asr_app_id.trim().to_string();
        next_settings.doubao_asr_resource_id = input.doubao_asr_resource_id.trim().to_string();
        next_settings.doubao_asr_model = input.doubao_asr_model.trim().to_string();
        next_settings.doubao_asr_access_token = input
            .doubao_asr_access_token
            .resolve(&current.doubao_asr_access_token);
        next_settings.transcription_silence_timeout_ms = input.transcription_silence_timeout_ms;
        next_settings.llm_base_url = input.llm_base_url.trim().to_string();
        next_settings.llm_api_key = input.llm_api_key.resolve(&current.llm_api_key);
        next_settings.llm_model = input.llm_model.trim().to_string();
        next_settings.llm_system_prompt = input.llm_system_prompt.trim().to_string();
        next_settings.angrymiao_skill_enabled = input.angrymiao_skill_enabled;
        next_settings.keyboard_driver_path = input.keyboard_driver_path.trim().to_string();
        next_settings.keyboard_shortcuts = sanitize_keyboard_shortcuts(input.keyboard_shortcuts);
        next_settings.control_skill_markdown = input.control_skill_markdown;
        next_settings.mcp_servers = mcp_servers;
        next_settings.normalize_code_owned_doubao_defaults();

        validate_settings_for_save(&next_settings)?;
        next_settings.default_hotkey = parse_save_default_hotkey(&next_settings.default_hotkey)?;

        Ok(next_settings)
    }
}

fn validate_settings_for_save(settings: &StoredVoiceSettings) -> Result<(), String> {
    let mut errors = Vec::new();

    validate_hotkey(&settings.default_hotkey, &mut errors);
    validate_url(
        "豆包 WebSocket URL",
        &settings.doubao_asr_url,
        &["ws", "wss"],
        &mut errors,
    );
    validate_required(
        "豆包 Resource ID",
        &settings.doubao_asr_resource_id,
        &mut errors,
    );
    validate_required("豆包模型", &settings.doubao_asr_model, &mut errors);
    validate_transcription_silence_timeout(
        settings.transcription_silence_timeout_ms,
        &mut errors,
    );
    validate_url(
        "LLM Base URL",
        &settings.llm_base_url,
        &["http", "https"],
        &mut errors,
    );
    validate_required("LLM 模型", &settings.llm_model, &mut errors);
    validate_keyboard_shortcuts(&settings.keyboard_shortcuts, &mut errors);
    validate_mcp_servers(&settings.mcp_servers, &mut errors);

    if errors.is_empty() {
        return Ok(());
    }

    Err(errors.join("\n"))
}

fn validate_required(field_name: &str, value: &str, errors: &mut Vec<String>) {
    if value.trim().is_empty() {
        errors.push(format!("{field_name}不能为空。"));
    }
}

fn validate_hotkey(value: &str, errors: &mut Vec<String>) {
    let value = value.trim();

    if value.is_empty() {
        errors.push("默认热键不能为空。".to_string());
        return;
    }

    let Ok(normalized) = parse_save_default_hotkey(value) else {
        errors.push("默认热键格式无效，请使用类似 RightAlt 或 LeftCtrl+K 的格式。".to_string());
        return;
    };

    if GlobalHotkey::parse(&normalized).is_err() {
        errors.push("默认热键格式无效，请使用类似 RightAlt 或 LeftCtrl+K 的格式。".to_string());
    }
}

fn validate_url(
    field_name: &str,
    value: &str,
    expected_schemes: &[&str],
    errors: &mut Vec<String>,
) {
    let value = value.trim();

    if value.is_empty() {
        errors.push(format!("{field_name}不能为空。"));
        return;
    }

    let Ok(url) = Url::parse(value) else {
        errors.push(format!(
            "{field_name} 必须是合法的 {} 地址。",
            format_schemes(expected_schemes)
        ));
        return;
    };

    if !expected_schemes
        .iter()
        .any(|scheme| *scheme == url.scheme())
    {
        errors.push(format!(
            "{field_name} 必须是合法的 {} 地址。",
            format_schemes(expected_schemes)
        ));
    }
}

fn validate_transcription_silence_timeout(value: u16, errors: &mut Vec<String>) {
    if value != 0 && !(500..=5_000).contains(&value) {
        errors.push("转录静音自动结束需为 0 或 500 到 5000 毫秒。".to_string());
    }
}

fn sanitize_keyboard_shortcuts(shortcuts: Vec<KeyboardShortcut>) -> Vec<KeyboardShortcut> {
    shortcuts
        .into_iter()
        .map(|shortcut| KeyboardShortcut {
            id: shortcut.id.trim().to_string(),
            trigger_words: shortcut
                .trigger_words
                .into_iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect(),
            key_codes: shortcut
                .key_codes
                .into_iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect(),
            recorded_keys: shortcut
                .recorded_keys
                .into_iter()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect(),
            enabled: shortcut.enabled,
        })
        .collect()
}

fn validate_keyboard_shortcuts(shortcuts: &[KeyboardShortcut], errors: &mut Vec<String>) {
    let mut seen_ids = BTreeSet::new();

    for (index, shortcut) in shortcuts.iter().enumerate() {
        let item_label = format!("键盘快捷键第 {} 项", index + 1);
        let shortcut_id = shortcut.id.trim();

        if shortcut_id.is_empty() {
            errors.push(format!("{item_label} 的 id 不能为空。"));
        } else if !seen_ids.insert(shortcut_id.to_string()) {
            errors.push(format!("{item_label} 的 id `{shortcut_id}` 重复。"));
        }

        if shortcut.trigger_words.is_empty() {
            errors.push(format!("{item_label} 至少需要一个触发词。"));
        }

        if shortcut.recorded_keys.is_empty() && shortcut.key_codes.is_empty() {
            errors.push(format!(
                "{item_label} 至少需要 recorded_keys 或 key_codes。"
            ));
        }

        if shortcut.recorded_keys.len() > 6 {
            errors.push(format!("{item_label} 最多允许 6 个 recorded_keys。"));
        }
    }
}

fn format_schemes(schemes: &[&str]) -> String {
    schemes
        .iter()
        .map(|scheme| format!("{scheme}://"))
        .collect::<Vec<_>>()
        .join(" 或 ")
}

fn parse_mcp_servers_json(value: &str) -> Result<Vec<McpServerConfig>, String> {
    let trimmed = value.trim();

    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let servers = serde_json::from_str::<Vec<McpServerConfig>>(trimmed)
        .map_err(|_| "MCP Servers JSON 格式无效。".to_string())?;
    let mut errors = Vec::new();
    validate_mcp_servers(&servers, &mut errors);

    if errors.is_empty() {
        return Ok(servers);
    }

    Err(errors.join("\n"))
}

fn validate_mcp_servers(servers: &[McpServerConfig], errors: &mut Vec<String>) {
    let mut seen_ids = BTreeSet::new();

    for (index, server) in servers.iter().enumerate() {
        let item_label = format!("MCP Servers JSON 第 {} 项", index + 1);
        let server_id = server.id.trim();

        if server_id.is_empty() {
            errors.push(format!("{item_label} 的 id 不能为空。"));
        } else if !seen_ids.insert(server_id.to_string()) {
            errors.push(format!("{item_label} 的 id `{server_id}` 重复。"));
        }

        if server.name.trim().is_empty() {
            errors.push(format!("{item_label} 的 name 不能为空。"));
        }

        match &server.transport {
            McpTransportConfig::Stdio { command, .. } => {
                if command.trim().is_empty() {
                    errors.push(format!("{item_label} 的 stdio command 不能为空。"));
                }
            }
        }
    }
}
