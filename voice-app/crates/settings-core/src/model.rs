use mcp_core::McpServerConfig;
use serde::{Deserialize, Serialize};

use crate::{
    default_hotkey::normalize_stored_default_hotkey, default_keyboard_shortcuts, KeyboardShortcut,
    DEFAULT_HOTKEY,
};

pub const SETTINGS_SCHEMA_VERSION: u32 = 1;
pub const DEFAULT_DOUBAO_ASR_URL: &str =
    "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async";
pub const DEFAULT_DOUBAO_ASR_RESOURCE_ID: &str = "volc.bigasr.sauc.duration";
pub const DEFAULT_DOUBAO_ASR_MODEL: &str = "bigmodel";
pub const DEFAULT_DOUBAO_AUDIO_FORMAT: &str = "pcm";
pub const DEFAULT_DOUBAO_AUDIO_LANGUAGE: &str = "zh-CN";
pub const DEFAULT_LLM_BASE_URL: &str = "https://api.openai.com/v1";
pub const DEFAULT_LLM_MODEL: &str = "gpt-4o-mini";
pub const DEFAULT_LLM_SYSTEM_PROMPT: &str =
    "你是一个桌面语音助手。用户明确要求执行本地动作时，请优先调用已提供工具；只有在不需要执行动作时，才返回简洁、可执行的最终回答。";

fn default_angrymiao_skill_enabled() -> bool {
    true
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct StoredVoiceSettings {
    pub schema_version: u32,
    pub history_enabled: bool,
    pub auto_launch_enabled: bool,
    pub default_hotkey: String,
    pub microphone_device_id: String,
    pub doubao_asr_url: String,
    pub doubao_asr_app_id: String,
    pub doubao_asr_access_token: String,
    pub doubao_asr_resource_id: String,
    pub doubao_asr_model: String,
    pub doubao_asr_audio_format: String,
    pub doubao_asr_audio_rate: u32,
    pub doubao_asr_audio_bits: u16,
    pub doubao_asr_audio_channel: u16,
    pub doubao_asr_audio_language: String,
    pub doubao_asr_enable_itn: bool,
    pub doubao_asr_enable_ddc: bool,
    pub doubao_asr_enable_punc: bool,
    pub doubao_asr_show_utterances: bool,
    pub doubao_asr_force_to_speech_time: u64,
    pub doubao_asr_end_window_size: u16,
    pub doubao_asr_boosting_table_id: String,
    pub doubao_asr_context_json: String,
    pub llm_base_url: String,
    pub llm_api_key: String,
    pub llm_model: String,
    pub llm_system_prompt: String,
    #[serde(default = "default_angrymiao_skill_enabled")]
    pub angrymiao_skill_enabled: bool,
    pub keyboard_driver_path: String,
    #[serde(default = "default_keyboard_shortcuts")]
    pub keyboard_shortcuts: Vec<KeyboardShortcut>,
    pub mcp_servers: Vec<McpServerConfig>,
}

impl Default for StoredVoiceSettings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            history_enabled: true,
            auto_launch_enabled: false,
            default_hotkey: DEFAULT_HOTKEY.to_string(),
            microphone_device_id: String::new(),
            doubao_asr_url: DEFAULT_DOUBAO_ASR_URL.to_string(),
            doubao_asr_app_id: String::new(),
            doubao_asr_access_token: String::new(),
            doubao_asr_resource_id: DEFAULT_DOUBAO_ASR_RESOURCE_ID.to_string(),
            doubao_asr_model: DEFAULT_DOUBAO_ASR_MODEL.to_string(),
            doubao_asr_audio_format: DEFAULT_DOUBAO_AUDIO_FORMAT.to_string(),
            doubao_asr_audio_rate: 16_000,
            doubao_asr_audio_bits: 16,
            doubao_asr_audio_channel: 1,
            doubao_asr_audio_language: DEFAULT_DOUBAO_AUDIO_LANGUAGE.to_string(),
            doubao_asr_enable_itn: false,
            doubao_asr_enable_ddc: false,
            doubao_asr_enable_punc: false,
            doubao_asr_show_utterances: true,
            doubao_asr_force_to_speech_time: 0,
            doubao_asr_end_window_size: 800,
            doubao_asr_boosting_table_id: String::new(),
            doubao_asr_context_json: String::new(),
            llm_base_url: DEFAULT_LLM_BASE_URL.to_string(),
            llm_api_key: String::new(),
            llm_model: DEFAULT_LLM_MODEL.to_string(),
            llm_system_prompt: DEFAULT_LLM_SYSTEM_PROMPT.to_string(),
            angrymiao_skill_enabled: true,
            keyboard_driver_path: String::new(),
            keyboard_shortcuts: default_keyboard_shortcuts(),
            mcp_servers: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct EditableVoiceSettings {
    pub schema_version: u32,
    pub history_enabled: bool,
    pub auto_launch_enabled: bool,
    pub default_hotkey: String,
    pub microphone_device_id: String,
    pub doubao_asr_url: String,
    pub doubao_asr_app_id: String,
    pub doubao_asr_resource_id: String,
    pub doubao_asr_model: String,
    pub doubao_asr_audio_format: String,
    pub doubao_asr_audio_rate: u32,
    pub doubao_asr_audio_bits: u16,
    pub doubao_asr_audio_channel: u16,
    pub doubao_asr_audio_language: String,
    pub doubao_asr_enable_itn: bool,
    pub doubao_asr_enable_ddc: bool,
    pub doubao_asr_enable_punc: bool,
    pub doubao_asr_show_utterances: bool,
    pub doubao_asr_force_to_speech_time: u64,
    pub doubao_asr_end_window_size: u16,
    pub doubao_asr_boosting_table_id: String,
    pub doubao_asr_context_json: String,
    pub llm_base_url: String,
    pub llm_model: String,
    pub llm_system_prompt: String,
    pub angrymiao_skill_enabled: bool,
    pub keyboard_driver_path: String,
    pub keyboard_shortcuts: Vec<KeyboardShortcut>,
    pub mcp_servers_json: String,
    pub has_doubao_asr_access_token: bool,
    pub has_llm_api_key: bool,
}

impl EditableVoiceSettings {
    pub fn from_settings(settings: &StoredVoiceSettings) -> Self {
        Self {
            schema_version: settings.schema_version,
            history_enabled: settings.history_enabled,
            auto_launch_enabled: settings.auto_launch_enabled,
            default_hotkey: normalize_stored_default_hotkey(&settings.default_hotkey),
            microphone_device_id: settings.microphone_device_id.clone(),
            doubao_asr_url: settings.doubao_asr_url.clone(),
            doubao_asr_app_id: settings.doubao_asr_app_id.clone(),
            doubao_asr_resource_id: settings.doubao_asr_resource_id.clone(),
            doubao_asr_model: settings.doubao_asr_model.clone(),
            doubao_asr_audio_format: settings.doubao_asr_audio_format.clone(),
            doubao_asr_audio_rate: settings.doubao_asr_audio_rate,
            doubao_asr_audio_bits: settings.doubao_asr_audio_bits,
            doubao_asr_audio_channel: settings.doubao_asr_audio_channel,
            doubao_asr_audio_language: settings.doubao_asr_audio_language.clone(),
            doubao_asr_enable_itn: settings.doubao_asr_enable_itn,
            doubao_asr_enable_ddc: settings.doubao_asr_enable_ddc,
            doubao_asr_enable_punc: settings.doubao_asr_enable_punc,
            doubao_asr_show_utterances: settings.doubao_asr_show_utterances,
            doubao_asr_force_to_speech_time: settings.doubao_asr_force_to_speech_time,
            doubao_asr_end_window_size: settings.doubao_asr_end_window_size,
            doubao_asr_boosting_table_id: settings.doubao_asr_boosting_table_id.clone(),
            doubao_asr_context_json: settings.doubao_asr_context_json.clone(),
            llm_base_url: settings.llm_base_url.clone(),
            llm_model: settings.llm_model.clone(),
            llm_system_prompt: settings.llm_system_prompt.clone(),
            angrymiao_skill_enabled: settings.angrymiao_skill_enabled,
            keyboard_driver_path: settings.keyboard_driver_path.clone(),
            keyboard_shortcuts: settings.keyboard_shortcuts.clone(),
            mcp_servers_json: serialize_mcp_servers_json(&settings.mcp_servers),
            has_doubao_asr_access_token: !settings.doubao_asr_access_token.trim().is_empty(),
            has_llm_api_key: !settings.llm_api_key.trim().is_empty(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeVoiceSettings {
    pub history_enabled: bool,
    pub auto_launch_enabled: bool,
    pub default_hotkey: String,
    pub microphone_device_id: String,
    pub asr_provider: String,
    pub asr_model: String,
    pub asr_resource_id: String,
    pub asr_audio_rate: u32,
    pub llm_provider: String,
    pub llm_model: String,
    pub llm_base_url: String,
    pub keyboard_shortcuts: Vec<KeyboardShortcut>,
}

impl Default for RuntimeVoiceSettings {
    fn default() -> Self {
        Self::from_settings(&StoredVoiceSettings::default())
    }
}

impl RuntimeVoiceSettings {
    pub fn from_settings(settings: &StoredVoiceSettings) -> Self {
        Self {
            history_enabled: settings.history_enabled,
            auto_launch_enabled: settings.auto_launch_enabled,
            default_hotkey: normalize_stored_default_hotkey(&settings.default_hotkey),
            microphone_device_id: settings.microphone_device_id.clone(),
            asr_provider: "doubao".to_string(),
            asr_model: settings.doubao_asr_model.clone(),
            asr_resource_id: settings.doubao_asr_resource_id.clone(),
            asr_audio_rate: settings.doubao_asr_audio_rate,
            llm_provider: "openai-compatible".to_string(),
            llm_model: settings.llm_model.clone(),
            llm_base_url: settings.llm_base_url.clone(),
            keyboard_shortcuts: settings.keyboard_shortcuts.clone(),
        }
    }
}

pub type VoiceSettings = RuntimeVoiceSettings;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(tag = "action", content = "value", rename_all = "snake_case")]
pub enum EditableSecretValueInput {
    #[default]
    Unchanged,
    Replace(String),
    Clear,
}

impl EditableSecretValueInput {
    pub fn resolve(self, current: &str) -> String {
        match self {
            Self::Unchanged => current.to_string(),
            Self::Replace(value) => value.trim().to_string(),
            Self::Clear => String::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SaveEditableVoiceSettingsInput {
    pub schema_version: u32,
    pub history_enabled: bool,
    pub auto_launch_enabled: bool,
    pub default_hotkey: String,
    pub microphone_device_id: String,
    pub doubao_asr_url: String,
    pub doubao_asr_app_id: String,
    pub doubao_asr_resource_id: String,
    pub doubao_asr_model: String,
    pub doubao_asr_audio_format: String,
    pub doubao_asr_audio_rate: u32,
    pub doubao_asr_audio_bits: u16,
    pub doubao_asr_audio_channel: u16,
    pub doubao_asr_audio_language: String,
    pub doubao_asr_enable_itn: bool,
    pub doubao_asr_enable_ddc: bool,
    pub doubao_asr_enable_punc: bool,
    pub doubao_asr_show_utterances: bool,
    pub doubao_asr_force_to_speech_time: u64,
    pub doubao_asr_end_window_size: u16,
    pub doubao_asr_boosting_table_id: String,
    pub doubao_asr_context_json: String,
    pub llm_base_url: String,
    pub llm_model: String,
    pub llm_system_prompt: String,
    pub angrymiao_skill_enabled: bool,
    pub keyboard_driver_path: String,
    pub keyboard_shortcuts: Vec<KeyboardShortcut>,
    pub mcp_servers_json: String,
    pub doubao_asr_access_token: EditableSecretValueInput,
    pub llm_api_key: EditableSecretValueInput,
}

impl SaveEditableVoiceSettingsInput {
    pub fn from_settings(settings: &StoredVoiceSettings) -> Self {
        Self {
            schema_version: settings.schema_version,
            history_enabled: settings.history_enabled,
            auto_launch_enabled: settings.auto_launch_enabled,
            default_hotkey: normalize_stored_default_hotkey(&settings.default_hotkey),
            microphone_device_id: settings.microphone_device_id.clone(),
            doubao_asr_url: settings.doubao_asr_url.clone(),
            doubao_asr_app_id: settings.doubao_asr_app_id.clone(),
            doubao_asr_resource_id: settings.doubao_asr_resource_id.clone(),
            doubao_asr_model: settings.doubao_asr_model.clone(),
            doubao_asr_audio_format: settings.doubao_asr_audio_format.clone(),
            doubao_asr_audio_rate: settings.doubao_asr_audio_rate,
            doubao_asr_audio_bits: settings.doubao_asr_audio_bits,
            doubao_asr_audio_channel: settings.doubao_asr_audio_channel,
            doubao_asr_audio_language: settings.doubao_asr_audio_language.clone(),
            doubao_asr_enable_itn: settings.doubao_asr_enable_itn,
            doubao_asr_enable_ddc: settings.doubao_asr_enable_ddc,
            doubao_asr_enable_punc: settings.doubao_asr_enable_punc,
            doubao_asr_show_utterances: settings.doubao_asr_show_utterances,
            doubao_asr_force_to_speech_time: settings.doubao_asr_force_to_speech_time,
            doubao_asr_end_window_size: settings.doubao_asr_end_window_size,
            doubao_asr_boosting_table_id: settings.doubao_asr_boosting_table_id.clone(),
            doubao_asr_context_json: settings.doubao_asr_context_json.clone(),
            llm_base_url: settings.llm_base_url.clone(),
            llm_model: settings.llm_model.clone(),
            llm_system_prompt: settings.llm_system_prompt.clone(),
            angrymiao_skill_enabled: settings.angrymiao_skill_enabled,
            keyboard_driver_path: settings.keyboard_driver_path.clone(),
            keyboard_shortcuts: settings.keyboard_shortcuts.clone(),
            mcp_servers_json: serialize_mcp_servers_json(&settings.mcp_servers),
            doubao_asr_access_token: EditableSecretValueInput::Unchanged,
            llm_api_key: EditableSecretValueInput::Unchanged,
        }
    }

    pub fn from_snapshot(snapshot: &EditableVoiceSettings) -> Self {
        Self {
            schema_version: snapshot.schema_version,
            history_enabled: snapshot.history_enabled,
            auto_launch_enabled: snapshot.auto_launch_enabled,
            default_hotkey: normalize_stored_default_hotkey(&snapshot.default_hotkey),
            microphone_device_id: snapshot.microphone_device_id.clone(),
            doubao_asr_url: snapshot.doubao_asr_url.clone(),
            doubao_asr_app_id: snapshot.doubao_asr_app_id.clone(),
            doubao_asr_resource_id: snapshot.doubao_asr_resource_id.clone(),
            doubao_asr_model: snapshot.doubao_asr_model.clone(),
            doubao_asr_audio_format: snapshot.doubao_asr_audio_format.clone(),
            doubao_asr_audio_rate: snapshot.doubao_asr_audio_rate,
            doubao_asr_audio_bits: snapshot.doubao_asr_audio_bits,
            doubao_asr_audio_channel: snapshot.doubao_asr_audio_channel,
            doubao_asr_audio_language: snapshot.doubao_asr_audio_language.clone(),
            doubao_asr_enable_itn: snapshot.doubao_asr_enable_itn,
            doubao_asr_enable_ddc: snapshot.doubao_asr_enable_ddc,
            doubao_asr_enable_punc: snapshot.doubao_asr_enable_punc,
            doubao_asr_show_utterances: snapshot.doubao_asr_show_utterances,
            doubao_asr_force_to_speech_time: snapshot.doubao_asr_force_to_speech_time,
            doubao_asr_end_window_size: snapshot.doubao_asr_end_window_size,
            doubao_asr_boosting_table_id: snapshot.doubao_asr_boosting_table_id.clone(),
            doubao_asr_context_json: snapshot.doubao_asr_context_json.clone(),
            llm_base_url: snapshot.llm_base_url.clone(),
            llm_model: snapshot.llm_model.clone(),
            llm_system_prompt: snapshot.llm_system_prompt.clone(),
            angrymiao_skill_enabled: snapshot.angrymiao_skill_enabled,
            keyboard_driver_path: snapshot.keyboard_driver_path.clone(),
            keyboard_shortcuts: snapshot.keyboard_shortcuts.clone(),
            mcp_servers_json: snapshot.mcp_servers_json.clone(),
            doubao_asr_access_token: EditableSecretValueInput::Unchanged,
            llm_api_key: EditableSecretValueInput::Unchanged,
        }
    }
}

fn serialize_mcp_servers_json(servers: &[McpServerConfig]) -> String {
    serde_json::to_string_pretty(servers).unwrap_or_else(|_| "[]".to_string())
}
