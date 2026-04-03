#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VoiceSettings {
  pub work_mode: String,
  pub history_enabled: bool,
}

impl Default for VoiceSettings {
  fn default() -> Self {
    Self {
      work_mode: "background-agent".to_string(),
      history_enabled: true,
    }
  }
}
