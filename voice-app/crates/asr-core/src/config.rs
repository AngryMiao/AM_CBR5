use std::error::Error;
use std::fmt::{Display, Formatter};

use settings_core::{
    StoredVoiceSettings, DEFAULT_DOUBAO_ASR_ENABLE_DDC, DEFAULT_DOUBAO_ASR_ENABLE_ITN,
    DEFAULT_DOUBAO_ASR_ENABLE_PUNC, DEFAULT_DOUBAO_ASR_END_WINDOW_SIZE,
    DEFAULT_DOUBAO_ASR_FORCE_TO_SPEECH_TIME, DEFAULT_DOUBAO_ASR_SHOW_UTTERANCES,
    DEFAULT_DOUBAO_AUDIO_BITS, DEFAULT_DOUBAO_AUDIO_CHANNEL, DEFAULT_DOUBAO_AUDIO_FORMAT,
    DEFAULT_DOUBAO_AUDIO_LANGUAGE, DEFAULT_DOUBAO_AUDIO_RATE,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AsrRuntimeConfig {
    pub provider: String,
    pub model: String,
    pub url: String,
    pub resource_id: String,
    pub audio_rate: u32,
    pub audio_language: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DoubaoAsrConfig {
    pub url: String,
    pub app_id: String,
    pub access_token: String,
    pub resource_id: String,
    pub model: String,
    pub audio_format: String,
    pub audio_rate: u32,
    pub audio_bits: u16,
    pub audio_channel: u16,
    pub audio_language: String,
    pub enable_itn: bool,
    pub enable_ddc: bool,
    pub enable_punc: bool,
    pub show_utterances: bool,
    pub force_to_speech_time: u64,
    pub end_window_size: u16,
    pub boosting_table_id: Option<String>,
    pub context_json: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DoubaoAsrError {
    message: String,
}

impl DoubaoAsrConfig {
    pub fn from_settings(settings: &StoredVoiceSettings) -> Result<Self, DoubaoAsrError> {
        Ok(Self {
            url: required_setting(&settings.doubao_asr_url, "豆包 WebSocket URL")?,
            app_id: required_setting(&settings.doubao_asr_app_id, "豆包 App ID")?,
            access_token: required_setting(&settings.doubao_asr_access_token, "豆包 Access Token")?,
            resource_id: required_setting(&settings.doubao_asr_resource_id, "豆包 Resource ID")?,
            model: required_setting(&settings.doubao_asr_model, "豆包模型")?,
            audio_format: DEFAULT_DOUBAO_AUDIO_FORMAT.to_string(),
            audio_rate: DEFAULT_DOUBAO_AUDIO_RATE,
            audio_bits: DEFAULT_DOUBAO_AUDIO_BITS,
            audio_channel: DEFAULT_DOUBAO_AUDIO_CHANNEL,
            audio_language: DEFAULT_DOUBAO_AUDIO_LANGUAGE.to_string(),
            enable_itn: DEFAULT_DOUBAO_ASR_ENABLE_ITN,
            enable_ddc: DEFAULT_DOUBAO_ASR_ENABLE_DDC,
            enable_punc: DEFAULT_DOUBAO_ASR_ENABLE_PUNC,
            show_utterances: DEFAULT_DOUBAO_ASR_SHOW_UTTERANCES,
            force_to_speech_time: DEFAULT_DOUBAO_ASR_FORCE_TO_SPEECH_TIME,
            end_window_size: DEFAULT_DOUBAO_ASR_END_WINDOW_SIZE,
            boosting_table_id: None,
            context_json: None,
        })
    }

    pub fn runtime_config(&self) -> AsrRuntimeConfig {
        AsrRuntimeConfig {
            provider: "doubao".to_string(),
            model: self.model.clone(),
            url: self.url.clone(),
            resource_id: self.resource_id.clone(),
            audio_rate: self.audio_rate,
            audio_language: self.audio_language.clone(),
        }
    }
}

impl DoubaoAsrError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl Display for DoubaoAsrError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl Error for DoubaoAsrError {}

fn required_setting(value: &str, field_name: &str) -> Result<String, DoubaoAsrError> {
    let value = value.trim();

    if value.is_empty() {
        return Err(DoubaoAsrError::new(format!("{field_name}未配置。")));
    }

    Ok(value.to_string())
}
