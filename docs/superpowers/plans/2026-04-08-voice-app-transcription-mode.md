# Voice App Transcription Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `voice-app` 增加双击进入的转录模式，在胶囊内显示 ASR 文本并支持单击/静音超时停止提交，同时保持 agent 模式现有中断与结果行为不回归。

**Architecture:** 保持现有底部 overlay 窗口不变，通过 `RuntimeSnapshot.input_mode`、新的热键模式控制器和 `AppState` 模式分流来区分 `agent` 与 `transcription`。转录模式中，`Partial / Final` 只更新胶囊文本预览，`Completed` 通过本地 `type_text` 一次性插入当前焦点；窗口显隐从“只看 phase”升级为“看 phase + input_mode”，避免转录模式误弹结果窗。

**Tech Stack:** Rust, Tauri 2, React 18, TypeScript, Vitest, Cargo tests

---

### Task 1: 扩展运行时 contract 与设置模型

**Files:**
- Modify: `voice-app/crates/ipc-contract/src/lib.rs`
- Modify: `voice-app/crates/ipc-contract/tests/runtime_snapshot.rs`
- Modify: `voice-app/crates/settings-core/src/model.rs`
- Modify: `voice-app/crates/settings-core/src/store.rs`
- Modify: `voice-app/crates/settings-core/tests/settings_defaults.rs`
- Modify: `voice-app/crates/settings-core/tests/settings_store.rs`
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`

- [ ] **Step 1: 先写失败测试，锁定 `input_mode` 和转录静音设置字段**

在 `voice-app/crates/ipc-contract/tests/runtime_snapshot.rs` 增加：

```rust
use ipc_contract::RuntimeSnapshot;

#[test]
fn default_snapshot_uses_none_input_mode() {
    let snapshot = RuntimeSnapshot::default();

    assert_eq!(snapshot.phase, "待命中");
    assert_eq!(snapshot.input_mode, "none");
}

#[test]
fn snapshot_with_mode_keeps_explicit_input_mode() {
    let snapshot = RuntimeSnapshot::with_mode(
        "正在聆听",
        "实时片段",
        "",
        "正在接收语音输入。",
        "transcription",
    );

    assert_eq!(snapshot.input_mode, "transcription");
    assert_eq!(snapshot.transcript, "实时片段");
}
```

在 `voice-app/crates/settings-core/tests/settings_defaults.rs` 增加：

```rust
use settings_core::{EditableVoiceSettings, RuntimeVoiceSettings, StoredVoiceSettings};

#[test]
fn stored_settings_default_transcription_timeout_is_3500ms() {
    let settings = StoredVoiceSettings::default();
    assert_eq!(settings.transcription_silence_timeout_ms, 3_500);
}

#[test]
fn editable_settings_expose_transcription_timeout() {
    let settings = StoredVoiceSettings::default();
    let editable = EditableVoiceSettings::from_settings(&settings);
    assert_eq!(editable.transcription_silence_timeout_ms, 3_500);
}

#[test]
fn runtime_settings_keep_transcription_timeout() {
    let settings = StoredVoiceSettings::default();
    let runtime = RuntimeVoiceSettings::from_settings(&settings);
    assert_eq!(runtime.transcription_silence_timeout_ms, 3_500);
}
```

- [ ] **Step 2: 运行定向测试，确认先红**

Run:

```powershell
cargo test -p ipc-contract runtime_snapshot -- --nocapture
cargo test -p settings-core settings_defaults -- --nocapture
```

Expected:

```text
FAIL，提示 RuntimeSnapshot 缺少 input_mode / with_mode，StoredVoiceSettings 缺少 transcription_silence_timeout_ms
```

- [ ] **Step 3: 用最小改动补齐 contract 和设置模型**

在 `voice-app/crates/ipc-contract/src/lib.rs` 改成：

```rust
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
```

在 `voice-app/crates/settings-core/src/model.rs` 增加字段并保持默认值：

```rust
pub struct StoredVoiceSettings {
    // ...
    pub doubao_asr_end_window_size: u16,
    pub transcription_silence_timeout_ms: u16,
    pub doubao_asr_boosting_table_id: String,
    // ...
}

impl Default for StoredVoiceSettings {
    fn default() -> Self {
        Self {
            // ...
            doubao_asr_end_window_size: 800,
            transcription_silence_timeout_ms: 3_500,
            doubao_asr_boosting_table_id: String::new(),
            // ...
        }
    }
}
```

同步补齐：

```rust
pub struct EditableVoiceSettings {
    // ...
    pub doubao_asr_end_window_size: u16,
    pub transcription_silence_timeout_ms: u16,
    pub doubao_asr_boosting_table_id: String,
}

pub struct RuntimeVoiceSettings {
    // ...
    pub asr_audio_rate: u32,
    pub transcription_silence_timeout_ms: u16,
    pub llm_provider: String,
}

pub struct SaveEditableVoiceSettingsInput {
    // ...
    pub doubao_asr_end_window_size: u16,
    pub transcription_silence_timeout_ms: u16,
    pub doubao_asr_boosting_table_id: String,
}
```

并在 `voice-app/apps/desktop/src/lib/tauri.ts` 与 `voice-app/apps/desktop/src/test/setup.ts` 同步新增：

```ts
export type RuntimeSnapshot = {
  phase: RuntimePhase | string
  transcript: string
  result: string
  detail: string
  input_mode: 'none' | 'agent' | 'transcription' | string
}
```

以及：

```ts
type EditableVoiceSettings = {
  // ...
  doubao_asr_end_window_size: number
  transcription_silence_timeout_ms: number
  doubao_asr_boosting_table_id: string
  // ...
}
```

- [ ] **Step 4: 运行 contract 和设置测试，确认转绿**

Run:

```powershell
cargo test -p ipc-contract -- --nocapture
cargo test -p settings-core -- --nocapture
```

Expected:

```text
PASS
```

- [ ] **Step 5: 提交这一轮 contract / settings 基线**

```bash
git add \
  voice-app/crates/ipc-contract/src/lib.rs \
  voice-app/crates/ipc-contract/tests/runtime_snapshot.rs \
  voice-app/crates/settings-core/src/model.rs \
  voice-app/crates/settings-core/src/store.rs \
  voice-app/crates/settings-core/tests/settings_defaults.rs \
  voice-app/crates/settings-core/tests/settings_store.rs \
  voice-app/apps/desktop/src/lib/tauri.ts \
  voice-app/apps/desktop/src/test/setup.ts
git commit -m "feat(voice-app): 增加转录模式运行时字段"
```

### Task 2: 新增模式化热键控制器，支持双击进入转录

**Files:**
- Create: `voice-app/crates/automation-core/src/hotkey_mode.rs`
- Modify: `voice-app/crates/automation-core/src/lib.rs`
- Create: `voice-app/crates/automation-core/tests/hotkey_mode.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`
- Test: `voice-app/crates/automation-core/tests/hold_to_talk.rs`
- Test: `voice-app/crates/automation-core/tests/hotkey_mode.rs`

- [ ] **Step 1: 先写失败测试，锁定双击进入转录和模式化单击语义**

在 `voice-app/crates/automation-core/tests/hotkey_mode.rs` 新增：

```rust
use automation_core::{
    HotkeyModeAction, HotkeyModeController, RuntimeHotkeyPhase, VoiceInputMode,
};

#[test]
fn double_tap_from_idle_starts_transcription_listening() {
    let mut controller = HotkeyModeController::default();

    assert_eq!(
        controller.on_press(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_000),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_060),
        HotkeyModeAction::Noop
    );

    assert_eq!(
        controller.on_press(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_140),
        HotkeyModeAction::Noop
    );
    assert_eq!(
        controller.on_release(RuntimeHotkeyPhase::Idle, VoiceInputMode::None, 1_190),
        HotkeyModeAction::StartTranscriptionListening
    );
}

#[test]
fn single_tap_in_transcription_mode_stops_and_submits() {
    let mut controller = HotkeyModeController::default();

    assert_eq!(
        controller.on_release(
            RuntimeHotkeyPhase::Listening,
            VoiceInputMode::Transcription,
            2_000,
        ),
        HotkeyModeAction::StopTranscriptionAndSubmit
    );
}
```

- [ ] **Step 2: 运行 automation-core 定向测试，确认先红**

Run:

```powershell
cargo test -p automation-core hotkey_mode -- --nocapture
```

Expected:

```text
FAIL，提示 HotkeyModeController / HotkeyModeAction / VoiceInputMode 尚不存在
```

- [ ] **Step 3: 新建 mode-aware controller，并保留现有 HoldToTalkController 作为 agent 子状态机**

在 `voice-app/crates/automation-core/src/hotkey_mode.rs` 增加：

```rust
use crate::{
    HoldToTalkController, HotkeyPressDecision, HotkeyReleaseDecision, RuntimeHotkeyPhase,
};

pub const DOUBLE_TAP_WINDOW_MS: u64 = 220;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum VoiceInputMode {
    #[default]
    None,
    Agent,
    Transcription,
}

impl VoiceInputMode {
    pub fn as_contract_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Agent => "agent",
            Self::Transcription => "transcription",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HotkeyModeAction {
    StartAgentListening,
    StartTranscriptionListening,
    CancelAndArmRestart,
    FinishAgentListening,
    CancelAgentListening,
    StopTranscriptionAndSubmit,
    DismissResult,
    Noop,
}

#[derive(Clone, Debug, Default)]
pub struct HotkeyModeController {
    hold_to_talk: HoldToTalkController,
    last_idle_tap_released_at_ms: Option<u64>,
}
```

并实现模式分流：

```rust
impl HotkeyModeController {
    pub fn on_press(
        &mut self,
        phase: RuntimeHotkeyPhase,
        input_mode: VoiceInputMode,
        now_ms: u64,
    ) -> HotkeyModeAction {
        if input_mode == VoiceInputMode::Transcription {
            return HotkeyModeAction::Noop;
        }

        match self.hold_to_talk.on_press(phase, now_ms) {
            HotkeyPressDecision::StartListening => HotkeyModeAction::StartAgentListening,
            HotkeyPressDecision::CancelAndArmRestart => HotkeyModeAction::CancelAndArmRestart,
            HotkeyPressDecision::Noop => HotkeyModeAction::Noop,
        }
    }

    pub fn on_release(
        &mut self,
        phase: RuntimeHotkeyPhase,
        input_mode: VoiceInputMode,
        now_ms: u64,
    ) -> HotkeyModeAction {
        if phase == RuntimeHotkeyPhase::Listening && input_mode == VoiceInputMode::Transcription {
            return HotkeyModeAction::StopTranscriptionAndSubmit;
        }

        if phase == RuntimeHotkeyPhase::Idle
            && input_mode == VoiceInputMode::None
            && self.is_double_tap(now_ms)
        {
            self.last_idle_tap_released_at_ms = None;
            return HotkeyModeAction::StartTranscriptionListening;
        }

        self.last_idle_tap_released_at_ms = Some(now_ms);

        match self.hold_to_talk.on_release(phase, now_ms) {
            HotkeyReleaseDecision::FinishListening => HotkeyModeAction::FinishAgentListening,
            HotkeyReleaseDecision::CancelListening => HotkeyModeAction::CancelAgentListening,
            HotkeyReleaseDecision::DismissResult => HotkeyModeAction::DismissResult,
            HotkeyReleaseDecision::Noop => HotkeyModeAction::Noop,
        }
    }

    fn is_double_tap(&self, now_ms: u64) -> bool {
        self.last_idle_tap_released_at_ms
            .map(|last| now_ms.saturating_sub(last) <= DOUBLE_TAP_WINDOW_MS)
            .unwrap_or(false)
    }
}
```

在 `voice-app/crates/automation-core/src/lib.rs` 导出：

```rust
mod hotkey_mode;

pub use hotkey_mode::{
    HotkeyModeAction, HotkeyModeController, VoiceInputMode, DOUBLE_TAP_WINDOW_MS,
};
```

- [ ] **Step 4: 将 `AppState` / `hotkeys.rs` 切到新 controller，但暂时只打通手势，不处理转录完成分流**

在 `voice-app/apps/desktop/src-tauri/src/app_state.rs` 先把运行时字段换成：

```rust
use automation_core::{
    HotkeyModeAction, HotkeyModeController, RuntimeHotkeyPhase, VoiceInputMode,
};

struct RuntimeStore {
    // ...
    hotkey_controller: HotkeyModeController,
    active_input_mode: VoiceInputMode,
}

fn snapshot_with_mode(snapshot: RuntimeSnapshot, input_mode: VoiceInputMode) -> RuntimeSnapshot {
    RuntimeSnapshot {
        input_mode: input_mode.as_contract_str().to_string(),
        ..snapshot
    }
}

impl AppState {
    pub fn current_input_mode(&self) -> VoiceInputMode {
        self.runtime
            .lock()
            .expect("runtime store lock poisoned")
            .active_input_mode
    }
}
```

并在热键入口映射动作：

```rust
match decision {
    HotkeyModeAction::StartAgentListening => self.start_voice_task_for_mode(VoiceInputMode::Agent).map(Some),
    HotkeyModeAction::StartTranscriptionListening => {
        self.start_voice_task_for_mode(VoiceInputMode::Transcription).map(Some)
    }
    HotkeyModeAction::CancelAndArmRestart => {
        let _ = self.cancel_current_operation("已中断当前语音任务，等待长按重启。");
        Ok(None)
    }
    HotkeyModeAction::FinishAgentListening => self.finish_voice_task().map(Some),
    HotkeyModeAction::CancelAgentListening => {
        let snapshot = self.cancel_current_operation("已取消当前语音任务。");
        Ok(Some(snapshot))
    }
    HotkeyModeAction::StopTranscriptionAndSubmit => self.finish_voice_task().map(Some),
    HotkeyModeAction::DismissResult => {
        let snapshot = self.dismiss_runtime_result("已关闭任务结果。");
        Ok(Some(snapshot))
    }
    HotkeyModeAction::Noop => Ok(None),
}
```

同时补出新的启动入口，避免后续所有调用点都手动改 mode：

```rust
pub fn start_voice_task_for_mode(
    &self,
    input_mode: VoiceInputMode,
) -> Result<TaskStartOutcome, String> {
    let mut outcome = self.start_voice_task()?;
    {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        runtime.active_input_mode = input_mode;
    }
    outcome.snapshot = snapshot_with_mode(outcome.snapshot, input_mode);
    Ok(outcome)
}
```

同时在 `voice-app/apps/desktop/src-tauri/src/hotkeys.rs` 保持现有定时器链路，但让 `handle_hotkey_pressed / released` 传入新的 mode-aware 行为。

- [ ] **Step 5: 运行热键状态机测试并提交**

Run:

```powershell
cargo test -p automation-core -- --nocapture
cargo test -p voice-app-desktop app_state -- --nocapture
```

Expected:

```text
PASS；现有长按 agent 语义不回归，双击已能进入转录 listening
```

Commit:

```bash
git add \
  voice-app/crates/automation-core/src/hotkey_mode.rs \
  voice-app/crates/automation-core/src/lib.rs \
  voice-app/crates/automation-core/tests/hotkey_mode.rs \
  voice-app/apps/desktop/src-tauri/src/app_state.rs \
  voice-app/apps/desktop/src-tauri/src/hotkeys.rs
git commit -m "feat(voice-app): 增加双模式热键控制器"
```

### Task 3: 打通转录模式后端链路、静音超时和窗口显隐

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/windowing.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/lib.rs`
- Test: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Test: `voice-app/apps/desktop/src-tauri/src/windowing.rs`

- [ ] **Step 1: 先写失败测试，锁定“转录不走 LLM，只做本地插入”和“结果窗不弹出”**

在 `voice-app/apps/desktop/src-tauri/src/app_state.rs` 追加测试：

```rust
#[test]
fn transcription_completed_types_text_without_llm_generation() {
    let state = AppState::for_test();

    state
        .start_voice_task_for_mode(VoiceInputMode::Transcription)
        .expect("transcription task should start");
    state.finish_voice_task().expect("transcription task should stop listening");

    let snapshot = state.apply_session_event_for_test(DoubaoSessionEvent::Completed {
        text: "直接写入的文本".to_string(),
    });

    assert_eq!(snapshot.phase, "正在输出");
    assert_eq!(snapshot.input_mode, "transcription");

    let final_snapshot = state
        .commit_transcription_insert_for_test("直接写入的文本".to_string())
        .expect("transcription insert should succeed");

    assert_eq!(final_snapshot.phase, "待命中");
    assert_eq!(final_snapshot.input_mode, "none");
}
```

在 `voice-app/apps/desktop/src-tauri/src/windowing.rs` 增加：

```rust
#[test]
fn transcription_mode_done_state_does_not_show_result_window() {
    let snapshot = ipc_contract::RuntimeSnapshot::with_mode(
        "已完成",
        "转录结果",
        "已将文本输出到当前输入位置。",
        "本地工具执行已完成。",
        "transcription",
    );

    let visibility = window_visibility_for_snapshot(&snapshot);
    assert!(visibility.overlay_visible);
    assert!(!visibility.result_visible);
}
```

- [ ] **Step 2: 运行定向测试，确认先红**

Run:

```powershell
cargo test -p voice-app-desktop transcription_completed_types_text_without_llm_generation -- --nocapture
cargo test -p voice-app-desktop transcription_mode_done_state_does_not_show_result_window -- --nocapture
```

Expected:

```text
FAIL，说明 AppState 还没有 transcription follow-up 分流，windowing 仍只看 phase
```

- [ ] **Step 3: 将 `SessionEventOutcome` 升级为 follow-up 分流，并在转录模式 `Completed` 后走本地插入**

在 `voice-app/apps/desktop/src-tauri/src/app_state.rs` 中把事件后处理从 `llm_transcript` 升级为：

```rust
pub(crate) enum SessionFollowUp {
    RunLlm(String),
    CommitTranscription(String),
}

pub(crate) struct SessionEventOutcome {
    pub operation_id: u64,
    pub snapshot: RuntimeSnapshot,
    pub follow_up: Option<SessionFollowUp>,
}
```

在 `Completed` 分支中增加 mode 判断：

```rust
match runtime.active_input_mode {
    VoiceInputMode::Transcription => {
        runtime.machine.start_inserting_with_transcript(
            transcript.clone(),
            "正在将转录文本输出到当前输入位置。",
        );
        Some(SessionEventOutcome {
            operation_id,
            snapshot: snapshot_with_mode(runtime.machine.snapshot(), VoiceInputMode::Transcription),
            follow_up: Some(SessionFollowUp::CommitTranscription(transcript)),
        })
    }
    _ => {
        runtime.machine.start_generating_with_transcript(
            transcript.clone(),
            "正在等待 OpenAI-compatible LLM 输出。",
        );
        Some(SessionEventOutcome {
            operation_id,
            snapshot: snapshot_with_mode(runtime.machine.snapshot(), VoiceInputMode::Agent),
            follow_up: Some(SessionFollowUp::RunLlm(transcript)),
        })
    }
}
```

同时新增：

```rust
pub fn commit_transcription_insert(
    &self,
    operation_id: u64,
    transcript: String,
) -> Option<RuntimeSnapshot> {
    if !self.is_current_operation(operation_id) {
        return None;
    }

    self.tool_executor
        .execute(&automation_core::ToolExecutionRequest::type_text(&transcript))
        .map_err(|cause| format!("转录文本输出失败: {cause}"))
        .ok()?;

    let snapshot = {
        let mut runtime = self.runtime.lock().expect("runtime store lock poisoned");
        if runtime.stored_settings.history_enabled {
            let record = runtime.machine.complete_success_with(
                transcript.clone(),
                "已将文本输出到当前输入位置。",
                "本地工具执行已完成。",
            );
            runtime.history.push(record);
        }
        runtime.active_operation_id = None;
        runtime.active_input_mode = VoiceInputMode::None;
        runtime.machine.reset();
        snapshot_with_mode(runtime.machine.snapshot(), VoiceInputMode::None)
    };

    Some(snapshot)
}

#[cfg(test)]
pub fn commit_transcription_insert_for_test(
    &self,
    transcript: String,
) -> Option<RuntimeSnapshot> {
    let operation_id = self.current_operation_id()?;
    self.commit_transcription_insert(operation_id, transcript)
}
```

- [ ] **Step 4: 加入静音超时调度和基于 snapshot 的窗口显隐**

在 `voice-app/apps/desktop/src-tauri/src/commands.rs` 增加：

```rust
fn schedule_transcription_silence_timeout(app: AppHandle, operation_id: u64, timeout_ms: u64) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(timeout_ms));
        let state = app.state::<AppState>();
        if let Some(snapshot) = state.finish_transcription_if_silence_timeout(operation_id) {
            let _ = sync_and_emit_runtime(&app, &state, snapshot);
        }
    });
}
```

并在 `voice-app/apps/desktop/src-tauri/src/app_state.rs` 增加超时收口 helper：

```rust
pub fn finish_transcription_if_silence_timeout(
    &self,
    operation_id: u64,
) -> Option<RuntimeSnapshot> {
    if !self.is_current_operation(operation_id) {
        return None;
    }

    if self.current_input_mode() != VoiceInputMode::Transcription {
        return None;
    }

    self.finish_voice_task()
        .ok()
        .map(|snapshot| snapshot_with_mode(snapshot, VoiceInputMode::Transcription))
}
```

并让 `spawn_session_event_listener` 在转录模式的 `Partial / Final` 后刷新静音计时，在 `SessionFollowUp::CommitTranscription` 时调用：

```rust
match follow_up {
    Some(SessionFollowUp::RunLlm(transcript)) => {
        spawn_llm_generation(app.clone(), outcome.operation_id, transcript);
        break;
    }
    Some(SessionFollowUp::CommitTranscription(transcript)) => {
        if let Some(snapshot) =
            state.commit_transcription_insert(outcome.operation_id, transcript)
        {
            let _ = sync_and_emit_runtime(&app, &state, snapshot);
        }
        break;
    }
    None => {}
}
```

在 `voice-app/apps/desktop/src-tauri/src/windowing.rs` 改成：

```rust
pub fn sync_runtime_windows(app: &AppHandle, snapshot: &RuntimeSnapshot) -> tauri::Result<()> {
    let visibility = window_visibility_for_snapshot(snapshot);
    relayout_runtime_windows(app)?;
    apply_window_visibility(app.get_webview_window(OVERLAY_WINDOW_LABEL), visibility.overlay_visible, false)?;
    apply_window_visibility(app.get_webview_window(RESULT_WINDOW_LABEL), visibility.result_visible, true)?;
    sync_overlay_auto_hide(app.clone(), snapshot, visibility.overlay_visible);
    Ok(())
}

fn window_visibility_for_snapshot(snapshot: &RuntimeSnapshot) -> WindowVisibility {
    if snapshot.input_mode == "transcription" {
        return WindowVisibility {
            overlay_visible: snapshot.phase != "待命中",
            result_visible: false,
        };
    }

    match snapshot.phase.as_str() {
        "正在聆听" | "正在识别" | "正在生成" | "正在执行" | "正在输出" => WindowVisibility {
            overlay_visible: true,
            result_visible: false,
        },
        "已完成" | "识别失败" => WindowVisibility {
            overlay_visible: false,
            result_visible: true,
        },
        _ => WindowVisibility {
            overlay_visible: false,
            result_visible: false,
        },
    }
}
```

别忘了同步 `commands.rs`：

```rust
windowing::sync_runtime_windows(app, &snapshot).map_err(|cause| cause.to_string())?;
```

- [ ] **Step 5: 跑 AppState / windowing 回归并提交**

Run:

```powershell
cargo test -p voice-app-desktop app_state -- --nocapture
cargo test -p voice-app-desktop windowing -- --nocapture
```

Expected:

```text
PASS；转录 Completed 不再触发 LLM，转录完成或失败不弹结果窗
```

Commit:

```bash
git add \
  voice-app/apps/desktop/src-tauri/src/app_state.rs \
  voice-app/apps/desktop/src-tauri/src/commands.rs \
  voice-app/apps/desktop/src-tauri/src/windowing.rs \
  voice-app/apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(voice-app): 打通转录模式后端链路"
```

### Task 4: 实现转录胶囊文本视图、设置项和前端回归

**Files:**
- Modify: `voice-app/apps/desktop/src/features/runtime/OverlayWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/useRuntimeSnapshot.ts`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/settings/validation.ts`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`

- [ ] **Step 1: 先写失败测试，锁定 bars / 文本切换和设置项保存**

在 `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx` 新增：

```tsx
import { setRuntimeSnapshotForTest } from '../test/setup'

it('renders transcription text instead of wave bars once transcript is non-empty', async () => {
  vi.mocked(getCurrentWindow).mockImplementation(() => ({ label: 'overlay' } as never))
  setRuntimeSnapshotForTest({
    phase: '正在聆听',
    transcript: '这是实时转录文本',
    result: '',
    detail: '正在流式识别语音内容。',
    input_mode: 'transcription',
  })

  const { container } = render(<App />)

  expect(await screen.findByText('这是实时转录文本')).toBeInTheDocument()
  expect(container.querySelector('.typeless-overlay-wave-shell')).toBeNull()
})

it('saves transcription silence timeout from the voice settings section', async () => {
  render(<App />)
  await openMainPanel('设置')
  await openSettingsSection('语音')

  fireEvent.change(await screen.findByLabelText('转录静音自动结束（ms）'), {
    target: { value: '1800' },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

  await waitFor(() => {
    expect(invoke).toHaveBeenCalledWith(
      'save_editable_settings',
      expect.objectContaining({
        input: expect.objectContaining({
          transcription_silence_timeout_ms: 1800,
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: 运行前端测试，确认先红**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test
```

Expected:

```text
FAIL，提示 RuntimeSnapshot 缺少 input_mode 或 overlay 还没有转录文本分支
```

- [ ] **Step 3: 在 overlay 中实现“agent 保持 bars，转录出字后只显示文本”的分支**

在 `voice-app/apps/desktop/src/features/runtime/OverlayWindow.tsx` 改成：

```tsx
import { useRuntimeSnapshot } from './useRuntimeSnapshot'
import { getRuntimePhaseTone } from '../../lib/runtimePhase'

const WAVE_BARS = [0, 1, 2, 3, 4]
const MAX_TRANSCRIPTION_PREVIEW_CHARS = 18

export function OverlayWindow() {
  const { phase, transcript, error, input_mode } = useRuntimeSnapshot()
  const phaseTone = getRuntimePhaseTone(phase)
  const phaseMeta = getOverlayPhaseMeta(phaseTone)
  const isTranscription = input_mode === 'transcription'
  const previewText = formatTranscriptionPreview(transcript)
  const showTranscript = isTranscription && previewText.length > 0

  return (
    <main className="overlay-shell">
      <section
        aria-label={[phaseMeta.phase, previewText || error].filter(Boolean).join('，')}
        aria-live="polite"
        className={[
          `typeless-overlay-card typeless-overlay-card-${phaseTone}`,
          isTranscription ? 'typeless-overlay-card-transcription' : '',
          showTranscript ? 'typeless-overlay-card-with-text' : '',
        ].filter(Boolean).join(' ')}
        role="status"
      >
        <div className="typeless-overlay-recorder" aria-hidden="true">
          <span className="typeless-overlay-handle typeless-overlay-handle-left">
            {phaseMeta.icon}
          </span>

          {showTranscript ? (
            <span className="typeless-overlay-text">{previewText}</span>
          ) : (
            <div className="typeless-overlay-wave-shell">
              <span className="typeless-overlay-wave">
                {WAVE_BARS.map((bar) => (
                  <span key={bar} className="typeless-overlay-wave-bar" />
                ))}
              </span>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function formatTranscriptionPreview(text: string) {
  const normalized = text.trim()
  if (!normalized) return ''
  if (normalized.length <= MAX_TRANSCRIPTION_PREVIEW_CHARS) return normalized
  return `…${normalized.slice(-MAX_TRANSCRIPTION_PREVIEW_CHARS)}`
}
```

在 `voice-app/apps/desktop/src/styles.css` 增加：

```css
.overlay-shell {
  width: 560px;
}

.typeless-overlay-card {
  min-width: 164px;
  max-width: 500px;
}

.typeless-overlay-card-with-text {
  width: fit-content;
  padding: 0 14px;
}

.typeless-overlay-text {
  display: inline-block;
  max-width: 420px;
  overflow: hidden;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1;
  color: #eef4ff;
}
```

- [ ] **Step 4: 接入设置项、前端校验和测试 mock**

在 `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx` 的语音分区新增：

```tsx
<label>
  <span>转录静音自动结束（ms）</span>
  <input
    min={0}
    max={5000}
    step={100}
    type="number"
    value={draft.transcription_silence_timeout_ms}
    onChange={(event) =>
      updateDraft(
        'transcription_silence_timeout_ms',
        Number(event.target.value) || 0,
      )
    }
  />
</label>
```

在 `voice-app/apps/desktop/src/features/settings/validation.ts` 中加入：

```ts
if (
  draft.transcription_silence_timeout_ms < 0 ||
  draft.transcription_silence_timeout_ms > 5000
) {
  errors.transcription_silence_timeout_ms =
    '转录静音自动结束需在 0 到 5000 毫秒之间。'
}
```

并在 `voice-app/apps/desktop/src/test/setup.ts` 默认值中补齐：

```ts
runtimeSnapshot = {
  phase: '待命中',
  transcript: '',
  result: '',
  detail: '等待下一次语音任务。',
  input_mode: 'none',
}

editableSettings = {
  // ...
  transcription_silence_timeout_ms: 3500,
  // ...
}

export function setRuntimeSnapshotForTest(next: RuntimeSnapshot) {
  runtimeSnapshot = next
  emit('runtime-snapshot', runtimeSnapshot)
}
```

- [ ] **Step 5: 运行前端测试与构建并提交**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test
pnpm --dir voice-app/apps/desktop build
```

Expected:

```text
PASS
vite build completed successfully
```

Commit:

```bash
git add \
  voice-app/apps/desktop/src/features/runtime/OverlayWindow.tsx \
  voice-app/apps/desktop/src/features/runtime/useRuntimeSnapshot.ts \
  voice-app/apps/desktop/src/styles.css \
  voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx \
  voice-app/apps/desktop/src/features/settings/validation.ts \
  voice-app/apps/desktop/src/__tests__/app-shell.test.tsx \
  voice-app/apps/desktop/src/test/setup.ts
git commit -m "feat(voice-app): 完成转录模式胶囊交互"
```

### Task 5: 做最终联调验证并收口残余回归

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src/features/runtime/OverlayWindow.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 跑全量 Rust 回归**

Run:

```powershell
cargo test -p ipc-contract -- --nocapture
cargo test -p settings-core -- --nocapture
cargo test -p automation-core -- --nocapture
cargo test -p voice-app-desktop -- --nocapture
```

Expected:

```text
PASS
```

- [ ] **Step 2: 跑前端全量回归**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test
```

Expected:

```text
PASS
```

- [ ] **Step 3: 做手动 smoke，验证模式分离**

手动验证：

```text
1. 长按热键进入 agent 模式，单击仍可中断当前识别/生成
2. 双击热键进入转录模式，初始只显示 icon + bars
3. 一旦 transcript 非空，bars 立即隐藏，胶囊只显示文本
4. 单击热键后停止录音，等待 Completed，再一次性把文本插入当前输入框
5. 转录模式结束后不弹结果窗
6. 静音超过设置值后会自动停止并提交
```

- [ ] **Step 4: 修复验证中发现的最后一个真实问题并重新验证**

如果 smoke 暴露问题，只允许做最小修复，并立即重跑触发它的最小验证命令，例如：

```powershell
cargo test -p voice-app-desktop transcription_completed_types_text_without_llm_generation -- --nocapture
pnpm --dir voice-app/apps/desktop test
```

Expected:

```text
PASS
```

- [ ] **Step 5: 提交最终整合结果**

```bash
git add docs/superpowers/specs/2026-04-08-voice-app-transcription-mode-design.md
git add docs/superpowers/plans/2026-04-08-voice-app-transcription-mode.md
git add voice-app
git commit -m "feat(voice-app): 实现转录模式胶囊输入"
```

## 自检

### Spec coverage

本计划覆盖了 spec 中的所有核心要求：

1. 双模式热键语义：Task 2
2. 转录模式 bars -> 文本切换：Task 4
3. 胶囊最大宽度与尾部显示：Task 4
4. 单击在转录模式中停止并提交：Task 2 + Task 3
5. 静音超时设置与自动停止：Task 1 + Task 3 + Task 4
6. 转录完成后一次性插入当前焦点：Task 3
7. 转录模式不弹结果窗：Task 3
8. agent 模式单击语义不回归：Task 2 + Task 5

### Placeholder scan

本计划没有使用：

1. `TODO / TBD / implement later`
2. “类似 Task N”
3. “补充适当错误处理” 这类无内容描述

### Type consistency

本计划统一使用以下名称：

1. `RuntimeSnapshot.input_mode`
2. `transcription_silence_timeout_ms`
3. `VoiceInputMode`
4. `HotkeyModeController`
5. `SessionFollowUp::RunLlm`
6. `SessionFollowUp::CommitTranscription`

## 执行备注

1. 当前工作区不是单独 worktree，但分支干净，可直接执行。
2. 计划默认先走 TDD，再做最小实现和定向验证。
3. 若双击进入转录的手势与现有 native hook 去重窗口冲突，先修正 `hotkeys.rs` 的事件判重，再继续后续任务。
