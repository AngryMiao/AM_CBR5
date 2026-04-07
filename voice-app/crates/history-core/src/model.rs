use serde::{Deserialize, Serialize};
use time::macros::format_description;
use time::OffsetDateTime;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct HistoryRecord {
    #[serde(default)]
    pub id: usize,
    pub transcript: String,
    pub result: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub detail: String,
    #[serde(default)]
    pub created_at: String,
}

impl HistoryRecord {
    pub fn new(transcript: &str, result: &str) -> Self {
        Self::with_status(0, transcript, result, "done")
    }

    pub fn with_status(id: usize, transcript: &str, result: &str, status: &str) -> Self {
        Self::with_detail(id, transcript, result, status, "")
    }

    pub fn with_detail(
        id: usize,
        transcript: &str,
        result: &str,
        status: &str,
        detail: &str,
    ) -> Self {
        Self {
            id,
            transcript: transcript.to_string(),
            result: result.to_string(),
            status: status.to_string(),
            detail: detail.to_string(),
            created_at: current_timestamp(),
        }
    }
}

fn current_timestamp() -> String {
    const FORMAT: &[time::format_description::FormatItem<'static>] =
        format_description!("[year]-[month]-[day] [hour]:[minute]:[second]");

    let now = OffsetDateTime::now_local().unwrap_or_else(|_| OffsetDateTime::now_utc());

    now.format(FORMAT)
        .unwrap_or_else(|_| "1970-01-01 00:00:00".to_string())
}
