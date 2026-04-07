use history_core::HistoryRecord;
use ipc_contract::RuntimeSnapshot;

use crate::RuntimePhase;

#[derive(Clone, Debug)]
pub struct RuntimeMachine {
    phase: RuntimePhase,
    transcript: String,
    result: String,
    detail: String,
    completed_tasks: usize,
}

impl Default for RuntimeMachine {
    fn default() -> Self {
        Self {
            phase: RuntimePhase::default(),
            transcript: String::new(),
            result: String::new(),
            detail: "等待下一次语音任务。".to_string(),
            completed_tasks: 0,
        }
    }
}

impl RuntimeMachine {
    pub fn snapshot(&self) -> RuntimeSnapshot {
        RuntimeSnapshot::new(
            self.phase.as_contract_str(),
            self.transcript.clone(),
            self.result.clone(),
            self.detail.clone(),
        )
    }

    pub fn start_listening(&mut self) {
        self.phase = RuntimePhase::Listening;
        self.transcript.clear();
        self.result.clear();
        self.detail = "正在接收语音输入。".to_string();
    }

    pub fn start_processing(&mut self) {
        self.finish_listening();
    }

    pub fn update_partial_transcript(&mut self, transcript: impl Into<String>) {
        self.phase = RuntimePhase::Listening;
        self.transcript = transcript.into();
        self.result.clear();
        self.detail = if self.transcript.is_empty() {
            "正在接收语音输入。".to_string()
        } else {
            "正在流式识别语音内容。".to_string()
        };
    }

    pub fn finish_listening(&mut self) {
        self.phase = RuntimePhase::Processing;
        self.result.clear();
        self.detail = "正在等待豆包返回最终识别结果。".to_string();
    }

    pub fn start_processing_with_transcript(
        &mut self,
        transcript: impl Into<String>,
        detail: impl Into<String>,
    ) {
        self.phase = RuntimePhase::Processing;
        self.result.clear();
        self.transcript = transcript.into();
        self.detail = detail.into();
    }

    pub fn start_generating_with_transcript(
        &mut self,
        transcript: impl Into<String>,
        detail: impl Into<String>,
    ) {
        self.phase = RuntimePhase::Generating;
        self.result.clear();
        self.transcript = transcript.into();
        self.detail = detail.into();
    }

    pub fn start_executing_with_transcript(
        &mut self,
        transcript: impl Into<String>,
        detail: impl Into<String>,
    ) {
        self.phase = RuntimePhase::Executing;
        self.result.clear();
        self.transcript = transcript.into();
        self.detail = detail.into();
    }

    pub fn start_inserting_with_transcript(
        &mut self,
        transcript: impl Into<String>,
        detail: impl Into<String>,
    ) {
        self.phase = RuntimePhase::Inserting;
        self.result.clear();
        self.transcript = transcript.into();
        self.detail = detail.into();
    }

    pub fn load_history_preview(
        &mut self,
        transcript: impl Into<String>,
        result: impl Into<String>,
        detail: impl Into<String>,
        status: impl Into<String>,
    ) {
        self.transcript = transcript.into();
        self.result = result.into();
        self.detail = detail.into();
        self.phase = if status.into().eq_ignore_ascii_case("error") {
            RuntimePhase::Error
        } else {
            RuntimePhase::Done
        };
    }

    pub fn complete_success(&mut self) -> HistoryRecord {
        let task_id = self.next_task_id();

        self.phase = RuntimePhase::Done;
        self.result = "识别完成".to_string();
        self.detail = "豆包流式识别已完成。".to_string();
        self.completed_tasks = task_id;

        HistoryRecord::with_detail(
            task_id,
            &self.transcript,
            &self.result,
            "done",
            &self.detail,
        )
    }

    pub fn complete_success_with(
        &mut self,
        transcript: impl Into<String>,
        result: impl Into<String>,
        detail: impl Into<String>,
    ) -> HistoryRecord {
        let task_id = self.next_task_id();
        let transcript = transcript.into();

        self.phase = RuntimePhase::Done;
        if !transcript.is_empty() {
            self.transcript = transcript;
        }
        self.result = result.into();
        self.detail = detail.into();
        self.completed_tasks = task_id;

        HistoryRecord::with_detail(
            task_id,
            &self.transcript,
            &self.result,
            "done",
            &self.detail,
        )
    }

    pub fn complete_error(&mut self) -> HistoryRecord {
        let task_id = self.next_task_id();

        self.phase = RuntimePhase::Error;
        self.result = "识别失败".to_string();
        self.detail = "豆包流式识别失败。".to_string();
        self.completed_tasks = task_id;

        HistoryRecord::with_detail(
            task_id,
            &self.transcript,
            &self.result,
            "error",
            &self.detail,
        )
    }

    pub fn complete_error_with(
        &mut self,
        transcript: impl Into<String>,
        result: impl Into<String>,
        detail: impl Into<String>,
    ) -> HistoryRecord {
        let task_id = self.next_task_id();
        let transcript = transcript.into();

        self.phase = RuntimePhase::Error;
        if !transcript.is_empty() {
            self.transcript = transcript;
        }
        self.result = result.into();
        self.detail = detail.into();
        self.completed_tasks = task_id;

        HistoryRecord::with_detail(
            task_id,
            &self.transcript,
            &self.result,
            "error",
            &self.detail,
        )
    }

    pub fn reset(&mut self) {
        self.phase = RuntimePhase::Idle;
        self.transcript.clear();
        self.result.clear();
        self.detail = "等待下一次语音任务。".to_string();
    }

    pub fn set_completed_tasks(&mut self, completed_tasks: usize) {
        self.completed_tasks = completed_tasks;
    }

    fn next_task_id(&self) -> usize {
        self.completed_tasks + 1
    }
}
