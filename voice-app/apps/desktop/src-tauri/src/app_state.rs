#[derive(Debug, Clone)]
pub struct AppState {
  pub mode: &'static str,
}

impl Default for AppState {
  fn default() -> Self {
    Self {
      mode: "background-agent",
    }
  }
}
