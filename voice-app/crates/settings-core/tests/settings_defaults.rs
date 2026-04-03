use settings_core::VoiceSettings;

#[test]
fn defaults_enable_background_agent_shape() {
  let settings = VoiceSettings::default();
  assert_eq!(settings.work_mode, "background-agent");
  assert!(settings.history_enabled);
}
