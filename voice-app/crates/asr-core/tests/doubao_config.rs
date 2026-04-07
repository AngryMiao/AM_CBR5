use asr_core::DoubaoAsrConfig;
use settings_core::StoredVoiceSettings;

#[test]
fn builds_doubao_config_from_stored_settings() {
    let mut settings = StoredVoiceSettings::default();
    settings.doubao_asr_url = "wss://example.com/doubao".to_string();
    settings.doubao_asr_app_id = "stored-app-id".to_string();
    settings.doubao_asr_access_token = "stored-token".to_string();
    settings.doubao_asr_resource_id = "resource-id".to_string();
    settings.doubao_asr_model = "bigmodel".to_string();
    settings.doubao_asr_boosting_table_id = "boosting-id".to_string();
    settings.doubao_asr_context_json = "{\"domain\":\"office\"}".to_string();

    let config = DoubaoAsrConfig::from_settings(&settings).expect("stored settings should build");

    assert_eq!(config.url, "wss://example.com/doubao");
    assert_eq!(config.app_id, "stored-app-id");
    assert_eq!(config.access_token, "stored-token");
    assert_eq!(config.resource_id, "resource-id");
    assert_eq!(config.boosting_table_id.as_deref(), Some("boosting-id"));
    assert_eq!(
        config.context_json.as_deref(),
        Some("{\"domain\":\"office\"}")
    );
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
