use asr_core::DoubaoAsrConfig;
use settings_core::{
    StoredVoiceSettings, DEFAULT_DOUBAO_ASR_ENABLE_DDC, DEFAULT_DOUBAO_ASR_ENABLE_ITN,
    DEFAULT_DOUBAO_ASR_ENABLE_PUNC, DEFAULT_DOUBAO_ASR_END_WINDOW_SIZE,
    DEFAULT_DOUBAO_ASR_FORCE_TO_SPEECH_TIME, DEFAULT_DOUBAO_ASR_SHOW_UTTERANCES,
    DEFAULT_DOUBAO_ASR_URL,
};

#[test]
fn builds_doubao_config_from_stored_basic_settings_and_code_owned_advanced_defaults() {
    let mut settings = StoredVoiceSettings::default();
    settings.doubao_asr_url = "wss://example.com/doubao".to_string();
    settings.doubao_asr_app_id = "stored-app-id".to_string();
    settings.doubao_asr_access_token = "stored-token".to_string();
    settings.doubao_asr_resource_id = "resource-id".to_string();
    settings.doubao_asr_model = "bigmodel-pro".to_string();

    let config =
        DoubaoAsrConfig::from_settings(&settings).expect("stored settings should build");

    assert_eq!(config.url, "wss://example.com/doubao");
    assert_ne!(config.url, DEFAULT_DOUBAO_ASR_URL);
    assert_eq!(config.app_id, "stored-app-id");
    assert_eq!(config.access_token, "stored-token");
    assert_eq!(config.resource_id, "resource-id");
    assert_eq!(config.model, "bigmodel-pro");
    assert_eq!(config.audio_format, "pcm");
    assert_eq!(config.audio_rate, 16_000);
    assert_eq!(config.audio_bits, 16);
    assert_eq!(config.audio_channel, 1);
    assert_eq!(config.audio_language, "zh-CN");
    assert_eq!(config.enable_itn, DEFAULT_DOUBAO_ASR_ENABLE_ITN);
    assert_eq!(config.enable_ddc, DEFAULT_DOUBAO_ASR_ENABLE_DDC);
    assert_eq!(config.enable_punc, DEFAULT_DOUBAO_ASR_ENABLE_PUNC);
    assert_eq!(config.show_utterances, DEFAULT_DOUBAO_ASR_SHOW_UTTERANCES);
    assert_eq!(
        config.force_to_speech_time,
        DEFAULT_DOUBAO_ASR_FORCE_TO_SPEECH_TIME
    );
    assert_eq!(config.end_window_size, DEFAULT_DOUBAO_ASR_END_WINDOW_SIZE);
    assert_eq!(config.boosting_table_id, None);
    assert_eq!(config.context_json, None);
}

#[test]
fn stored_settings_require_access_token() {
    let mut settings = StoredVoiceSettings::default();
    settings.doubao_asr_app_id = "stored-app-id".to_string();
    settings.doubao_asr_access_token.clear();

    let error =
        DoubaoAsrConfig::from_settings(&settings).expect_err("missing stored token should fail");

    assert!(error.to_string().contains("豆包 Access Token未配置"));
}
