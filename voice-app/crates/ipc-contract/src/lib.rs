use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeSnapshot {
    pub phase: String,
    pub transcript: String,
    pub result: String,
    pub detail: String,
    pub input_mode: String,
}

impl Default for RuntimeSnapshot {
    fn default() -> Self {
        Self::with_mode("待命中", "", "", "等待下一次语音任务。", "none")
    }
}

impl RuntimeSnapshot {
    pub fn new(
        phase: impl Into<String>,
        transcript: impl Into<String>,
        result: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self::with_mode(phase, transcript, result, detail, "none")
    }

    pub fn with_mode(
        phase: impl Into<String>,
        transcript: impl Into<String>,
        result: impl Into<String>,
        detail: impl Into<String>,
        input_mode: impl Into<String>,
    ) -> Self {
        Self {
            phase: phase.into(),
            transcript: transcript.into(),
            result: result.into(),
            detail: detail.into(),
            input_mode: input_mode.into(),
        }
    }
}
