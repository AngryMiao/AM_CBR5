use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeSnapshot {
  pub phase: String,
}

impl Default for RuntimeSnapshot {
  fn default() -> Self {
    Self {
      phase: "idle".to_string(),
    }
  }
}
