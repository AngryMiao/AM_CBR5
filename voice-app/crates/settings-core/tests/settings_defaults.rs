use settings_core::{EditableVoiceSettings, RuntimeVoiceSettings, StoredVoiceSettings};

#[test]
fn defaults_do_not_include_unused_work_mode_setting() {
    let settings = StoredVoiceSettings::default();
    let serialized = serde_json::to_value(&settings).expect("settings should serialize");

    assert_eq!(settings.schema_version, 1);
    assert!(settings.history_enabled);
    assert_eq!(settings.llm_model, "gpt-4o-mini");
    assert_eq!(settings.doubao_asr_model, "bigmodel");
    assert_eq!(settings.default_hotkey, "RightAlt");
    assert_eq!(settings.microphone_device_id, "");
    assert_eq!(settings.doubao_asr_audio_format, "pcm");
    assert_eq!(settings.doubao_asr_audio_bits, 16);
    assert_eq!(settings.doubao_asr_audio_channel, 1);
    assert_eq!(
        settings.llm_system_prompt,
        "你是一个桌面语音助手。用户明确要求执行本地动作时，请优先调用已提供工具；只有在不需要执行动作时，才返回简洁、可执行的最终回答。"
    );
    assert_eq!(
        serialized["doubao_asr_resource_id"],
        "volc.bigasr.sauc.duration"
    );
    assert_eq!(serialized["doubao_asr_audio_rate"], 16_000);
    assert_eq!(serialized["default_hotkey"], "RightAlt");
    assert_eq!(serialized["microphone_device_id"], "");
    assert_eq!(serialized["llm_base_url"], "https://api.openai.com/v1");
    assert_eq!(serialized["angrymiao_skill_enabled"], true);
    assert_eq!(serialized["keyboard_driver_path"], "");
    assert!(settings.keyboard_shortcuts.len() >= 10);
    assert_eq!(serialized["keyboard_shortcuts"][0]["id"], "ks_copy");
    assert_eq!(
        serialized["keyboard_shortcuts"][0]["trigger_words"][0],
        "复制"
    );
    assert!(serialized.get("work_mode").is_none());
}

#[test]
fn runtime_and_editable_snapshots_normalize_legacy_default_hotkey() {
    let mut settings = StoredVoiceSettings::default();
    settings.default_hotkey = "Hold Alt+Space".to_string();
    settings.microphone_device_id = "usb-mic".to_string();

    let runtime = RuntimeVoiceSettings::from_settings(&settings);
    let editable = EditableVoiceSettings::from_settings(&settings);

    assert_eq!(runtime.default_hotkey, "RightAlt");
    assert_eq!(runtime.microphone_device_id, "usb-mic");
    assert_eq!(editable.default_hotkey, "RightAlt");
    assert_eq!(editable.microphone_device_id, "usb-mic");
}

#[test]
fn stored_settings_default_transcription_timeout_is_3500ms() {
    let settings = StoredVoiceSettings::default();
    assert_eq!(settings.transcription_silence_timeout_ms, 3_500);
    assert_eq!(settings.doubao_asr_app_id, "");
    assert!(settings.doubao_asr_enable_punc);
}

#[test]
fn editable_settings_only_expose_user_editable_voice_fields() {
    let settings = StoredVoiceSettings::default();
    let editable = EditableVoiceSettings::from_settings(&settings);
    let serialized = serde_json::to_value(&editable).expect("editable settings should serialize");

    assert_eq!(editable.transcription_silence_timeout_ms, 3_500);
    assert_eq!(serialized["microphone_device_id"], "");
    assert_eq!(serialized["transcription_silence_timeout_ms"], 3_500);
    assert_eq!(
        serialized["doubao_asr_url"],
        "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async"
    );
    assert_eq!(serialized["doubao_asr_app_id"], "");
    assert_eq!(serialized["doubao_asr_resource_id"], "volc.bigasr.sauc.duration");
    assert_eq!(serialized["doubao_asr_model"], "bigmodel");
    assert!(serialized.get("doubao_asr_audio_rate").is_none());
    assert!(serialized.get("doubao_asr_enable_punc").is_none());
}

#[test]
fn defaults_include_empty_control_skill_markdown() {
    let settings = StoredVoiceSettings::default();
    let serialized = serde_json::to_value(&settings).expect("settings should serialize");

    assert_eq!(settings.control_skill_markdown, "");
    assert_eq!(serialized["control_skill_markdown"], "");
}

#[test]
fn editable_settings_expose_control_skill_markdown() {
    let settings = StoredVoiceSettings::default();
    let editable = EditableVoiceSettings::from_settings(&settings);
    let serialized = serde_json::to_value(&editable).expect("editable settings should serialize");

    assert_eq!(editable.control_skill_markdown, "");
    assert_eq!(serialized["control_skill_markdown"], "");
}

#[test]
fn runtime_settings_keep_transcription_timeout() {
    let settings = StoredVoiceSettings::default();
    let runtime = RuntimeVoiceSettings::from_settings(&settings);
    assert_eq!(runtime.transcription_silence_timeout_ms, 3_500);
}
