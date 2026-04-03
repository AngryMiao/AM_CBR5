#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryRecord {
  pub transcript: String,
  pub result: String,
}

impl HistoryRecord {
  pub fn new(transcript: &str, result: &str) -> Self {
    Self {
      transcript: transcript.to_string(),
      result: result.to_string(),
    }
  }
}
