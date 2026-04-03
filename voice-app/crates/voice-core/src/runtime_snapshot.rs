#[derive(Default, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimePhase {
  #[default]
  Idle,
}

impl RuntimePhase {
  pub fn as_str(&self) -> &'static str {
    match self {
      Self::Idle => "idle",
    }
  }
}
