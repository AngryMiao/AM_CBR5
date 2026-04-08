use mcp_core::McpServerConfig;
use settings_core::{
    EditableSecretValueInput, KeyboardShortcut, SaveEditableVoiceSettingsInput, SettingsStore,
    StoredVoiceSettings,
};

#[test]
fn missing_store_creates_default_settings_file() {
    let dir = tempfile::tempdir().expect("temp dir should exist");
    let path = dir.path().join("settings.json");

    let settings = SettingsStore::load_or_create(&path).expect("settings should load");

    assert_eq!(settings, StoredVoiceSettings::default());
    assert!(path.exists());
}

#[test]
fn broken_store_falls_back_to_default_and_rewrites_file() {
    let dir = tempfile::tempdir().expect("temp dir should exist");
    let path = dir.path().join("settings.json");
    std::fs::write(&path, "{ this is not valid json").expect("broken file should be seeded");

    let settings = SettingsStore::load_or_create(&path).expect("broken store should recover");
    let recovered = std::fs::read_to_string(&path).expect("rewritten file should exist");

    assert_eq!(settings, StoredVoiceSettings::default());
    assert!(recovered.contains("\"schema_version\": 1"));
}

#[test]
fn load_or_create_rewrites_code_owned_doubao_fields_to_defaults() {
    let dir = tempfile::tempdir().expect("temp dir should exist");
    let path = dir.path().join("settings.json");
    let mut customized = StoredVoiceSettings::default();
    customized.doubao_asr_url = "ws://127.0.0.1/custom".to_string();
    customized.doubao_asr_app_id = "custom-app-id".to_string();
    customized.doubao_asr_resource_id = "custom-resource".to_string();
    customized.doubao_asr_model = "custom-model".to_string();
    customized.doubao_asr_audio_format = "wav".to_string();
    customized.doubao_asr_audio_rate = 8_000;
    customized.doubao_asr_audio_bits = 8;
    customized.doubao_asr_audio_channel = 2;
    customized.doubao_asr_audio_language = "en-US".to_string();
    customized.doubao_asr_enable_itn = true;
    customized.doubao_asr_enable_ddc = true;
    customized.doubao_asr_enable_punc = false;
    customized.doubao_asr_show_utterances = false;
    customized.doubao_asr_force_to_speech_time = 123;
    customized.doubao_asr_end_window_size = 456;
    customized.doubao_asr_boosting_table_id = "custom-boosting".to_string();
    customized.doubao_asr_context_json = "{\"domain\":\"office\"}".to_string();
    SettingsStore::save(&path, &customized).expect("custom settings should save");

    let loaded = SettingsStore::load_or_create(&path).expect("settings should normalize");
    let rewritten = SettingsStore::load(&path).expect("rewritten settings should reload");

    assert_eq!(loaded.doubao_asr_url, "ws://127.0.0.1/custom");
    assert_eq!(loaded.doubao_asr_app_id, "custom-app-id");
    assert_eq!(loaded.doubao_asr_resource_id, "custom-resource");
    assert_eq!(loaded.doubao_asr_model, "custom-model");
    assert_eq!(loaded.doubao_asr_audio_format, "pcm");
    assert_eq!(loaded.doubao_asr_audio_rate, 16_000);
    assert_eq!(loaded.doubao_asr_audio_bits, 16);
    assert_eq!(loaded.doubao_asr_audio_channel, 1);
    assert_eq!(loaded.doubao_asr_audio_language, "zh-CN");
    assert!(!loaded.doubao_asr_enable_itn);
    assert!(!loaded.doubao_asr_enable_ddc);
    assert!(loaded.doubao_asr_enable_punc);
    assert!(loaded.doubao_asr_show_utterances);
    assert_eq!(loaded.doubao_asr_force_to_speech_time, 0);
    assert_eq!(loaded.doubao_asr_end_window_size, 800);
    assert_eq!(loaded.doubao_asr_boosting_table_id, "");
    assert_eq!(loaded.doubao_asr_context_json, "");
    assert_eq!(rewritten, loaded);
}

#[test]
fn load_normalizes_legacy_default_hotkey_to_right_alt() {
    let dir = tempfile::tempdir().expect("temp dir should exist");
    let path = dir.path().join("settings.json");
    let mut legacy = StoredVoiceSettings::default();
    legacy.default_hotkey = "Hold Alt+Space".to_string();
    SettingsStore::save(&path, &legacy).expect("legacy settings should save");

    let loaded = SettingsStore::load(&path).expect("legacy settings should load");

    assert_eq!(loaded.default_hotkey, "RightAlt");
}

#[test]
fn save_preserves_secret_values_when_input_is_unchanged() {
    let dir = tempfile::tempdir().expect("temp dir should exist");
    let path = dir.path().join("settings.json");
    let current = StoredVoiceSettings::default();
    SettingsStore::save(&path, &current).expect("seed settings should save");

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            llm_model: "gpt-4.1-mini".to_string(),
            doubao_asr_access_token: EditableSecretValueInput::Unchanged,
            llm_api_key: EditableSecretValueInput::Replace("next-llm-secret".to_string()),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("valid settings should save");

    assert_eq!(
        updated.doubao_asr_access_token,
        current.doubao_asr_access_token
    );
    assert_eq!(updated.llm_api_key, "next-llm-secret");
}

#[test]
fn save_updates_auto_launch_toggle() {
    let current = StoredVoiceSettings::default();

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            auto_launch_enabled: true,
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("auto launch flag should save");

    assert!(updated.auto_launch_enabled);
}

#[test]
fn save_updates_microphone_device_preference() {
    let current = StoredVoiceSettings::default();

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            microphone_device_id: "usb-mic".to_string(),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("microphone device should save");

    assert_eq!(updated.microphone_device_id, "usb-mic");
}

#[test]
fn save_rewrites_code_owned_doubao_fields_to_defaults() {
    let mut current = StoredVoiceSettings::default();
    current.doubao_asr_url = "ws://127.0.0.1/custom".to_string();
    current.doubao_asr_app_id = "custom-app-id".to_string();
    current.doubao_asr_resource_id = "custom-resource".to_string();
    current.doubao_asr_model = "custom-model".to_string();
    current.doubao_asr_audio_format = "wav".to_string();
    current.doubao_asr_audio_rate = 8_000;
    current.doubao_asr_audio_bits = 8;
    current.doubao_asr_audio_channel = 2;
    current.doubao_asr_audio_language = "en-US".to_string();
    current.doubao_asr_enable_itn = true;
    current.doubao_asr_enable_ddc = true;
    current.doubao_asr_enable_punc = false;
    current.doubao_asr_show_utterances = false;
    current.doubao_asr_force_to_speech_time = 321;
    current.doubao_asr_end_window_size = 654;
    current.doubao_asr_boosting_table_id = "custom-boosting".to_string();
    current.doubao_asr_context_json = "{\"domain\":\"office\"}".to_string();

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            microphone_device_id: "usb-mic".to_string(),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("saving editable settings should restore code-owned doubao defaults");

    assert_eq!(updated.microphone_device_id, "usb-mic");
    assert_eq!(updated.doubao_asr_url, "ws://127.0.0.1/custom");
    assert_eq!(updated.doubao_asr_app_id, "custom-app-id");
    assert_eq!(updated.doubao_asr_resource_id, "custom-resource");
    assert_eq!(updated.doubao_asr_model, "custom-model");
    assert_eq!(updated.doubao_asr_audio_format, "pcm");
    assert_eq!(updated.doubao_asr_audio_rate, 16_000);
    assert_eq!(updated.doubao_asr_audio_bits, 16);
    assert_eq!(updated.doubao_asr_audio_channel, 1);
    assert_eq!(updated.doubao_asr_audio_language, "zh-CN");
    assert!(!updated.doubao_asr_enable_itn);
    assert!(!updated.doubao_asr_enable_ddc);
    assert!(updated.doubao_asr_enable_punc);
    assert!(updated.doubao_asr_show_utterances);
    assert_eq!(updated.doubao_asr_force_to_speech_time, 0);
    assert_eq!(updated.doubao_asr_end_window_size, 800);
    assert_eq!(updated.doubao_asr_boosting_table_id, "");
    assert_eq!(updated.doubao_asr_context_json, "");
}

#[test]
fn save_normalizes_exact_default_hotkey_format_before_persisting() {
    let current = StoredVoiceSettings::default();

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            default_hotkey: " keyk + controlleft ".to_string(),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("exact hotkey should normalize");

    assert_eq!(updated.default_hotkey, "LeftCtrl+K");
}

#[test]
fn save_updates_angrymiao_skill_bundle_fields() {
    let current = StoredVoiceSettings::default();

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            angrymiao_skill_enabled: false,
            keyboard_driver_path: "C:/Drivers/AIKeyBoardDriver.exe".to_string(),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("builtin skill fields should save");

    assert!(!updated.angrymiao_skill_enabled);
    assert_eq!(
        updated.keyboard_driver_path,
        "C:/Drivers/AIKeyBoardDriver.exe"
    );
}

#[test]
fn save_updates_keyboard_shortcuts() {
    let current = StoredVoiceSettings::default();
    let shortcut = KeyboardShortcut {
        id: "ks_custom_launch".to_string(),
        trigger_words: vec!["打开控制台".to_string()],
        key_codes: vec![
            "110700E0".to_string(),
            "11070015".to_string(),
            "10070015".to_string(),
            "100700E0".to_string(),
        ],
        recorded_keys: vec!["ControlLeft".to_string(), "KeyR".to_string()],
        enabled: true,
    };

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            keyboard_shortcuts: vec![shortcut.clone()],
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("keyboard shortcuts should save");

    assert_eq!(updated.keyboard_shortcuts, vec![shortcut]);
}

#[test]
fn save_can_clear_secret_values_explicitly() {
    let current = StoredVoiceSettings::default();

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            doubao_asr_access_token: EditableSecretValueInput::Clear,
            llm_api_key: EditableSecretValueInput::Clear,
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("clearing optional secrets should remain allowed");

    assert_eq!(updated.doubao_asr_access_token, "");
    assert_eq!(updated.llm_api_key, "");
}

#[test]
fn save_rejects_invalid_structural_settings() {
    let mut current = StoredVoiceSettings::default();
    current.doubao_asr_access_token = "test-secret".to_string();
    current.llm_api_key = "test-llm-secret".to_string();

    let error = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            default_hotkey: "  ".to_string(),
            llm_base_url: "not-an-http-url".to_string(),
            transcription_silence_timeout_ms: 100,
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect_err("invalid settings should be rejected");

    assert!(error.contains("默认热键不能为空。"));
    assert!(error.contains("LLM Base URL 必须是合法的 http:// 或 https:// 地址。"));
    assert!(error.contains("转录静音自动结束需为 0 或 500 到 5000 毫秒。"));
}

#[test]
fn save_rejects_legacy_hold_style_default_hotkey() {
    let current = StoredVoiceSettings::default();

    let error = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            default_hotkey: "Hold Alt+Space".to_string(),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect_err("legacy hold-style hotkey should be rejected");

    assert!(error.contains("默认热键格式无效，请使用类似 RightAlt 或 LeftCtrl+K 的格式。"));
}

#[test]
fn save_rejects_invalid_llm_base_url() {
    let mut current = StoredVoiceSettings::default();
    current.doubao_asr_access_token = "test-secret".to_string();
    current.llm_api_key = "test-llm-secret".to_string();

    let error = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            llm_base_url: "file:///tmp/not-http".to_string(),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect_err("invalid llm url should be rejected");

    assert!(error.contains("LLM Base URL 必须是合法的 http:// 或 https:// 地址。"));
}

#[test]
fn save_rejects_transcription_timeout_below_minimum_except_zero() {
    let current = StoredVoiceSettings::default();

    let error = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            transcription_silence_timeout_ms: 100,
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect_err("timeout below 500ms should be rejected unless disabled with 0");

    assert!(error.contains("转录静音自动结束需为 0 或 500 到 5000 毫秒。"));
}

#[test]
fn save_accepts_valid_mcp_servers_json() {
    let current = StoredVoiceSettings::default();

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            mcp_servers_json: serde_json::to_string_pretty(&vec![McpServerConfig::stdio(
                "system-control",
                "System Control",
                "node",
                vec!["server.js".to_string()],
                Default::default(),
            )])
            .expect("mcp server json should serialize"),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("valid mcp servers json should save");

    assert_eq!(updated.mcp_servers.len(), 1);
    assert_eq!(updated.mcp_servers[0].id, "system-control");
    assert_eq!(updated.mcp_servers[0].name, "System Control");
}

#[test]
fn save_rejects_invalid_mcp_servers_json() {
    let current = StoredVoiceSettings::default();

    let error = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            mcp_servers_json: "[{\"id\":\"\",\"name\":\"Broken\"}]".to_string(),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect_err("invalid mcp servers json should be rejected");

    assert!(error.contains("MCP Servers JSON"));
}

#[test]
fn save_rejects_invalid_keyboard_shortcuts() {
    let current = StoredVoiceSettings::default();

    let error = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            keyboard_shortcuts: vec![KeyboardShortcut {
                id: " ".to_string(),
                trigger_words: vec![],
                key_codes: vec![],
                recorded_keys: vec![],
                enabled: true,
            }],
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect_err("invalid keyboard shortcuts should be rejected");

    assert!(error.contains("键盘快捷键第 1 项 的 id 不能为空。"));
    assert!(error.contains("键盘快捷键第 1 项 至少需要一个触发词。"));
    assert!(error.contains("键盘快捷键第 1 项 至少需要 recorded_keys 或 key_codes。"));
}
