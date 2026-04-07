# Voice App Doubao Streaming ASR Implementation Plan

> 更新（2026-04-06）：
> 当前实现已经取消 `.env` 配置前提。
> 豆包 ASR 运行参数统一来自 `settings.json`，
> 由设置页保存后供后续新任务读取。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `voice-app` 从 `OpenAI + batch WAV transcription + 英文 phase` 改成 `Rust 直连豆包 WebSocket 流式 ASR + .env 配置 + 中文状态流`，并让长按热键的完整链路在 Tauri 桌面 App 内可运行、可测试、可观察。

**Architecture:** 启动阶段先从 `voice-app/.env` 构造豆包运行时配置，再显式创建 `AppState`；`AppState` 持有唯一的活跃流式任务，负责驱动麦克风采集、豆包会话、runtime/history/logs 写入；`voice-core` 只维护内部状态机，`ipc-contract` 和前端统一消费中文 `phase` 合同，前端继续只做观察层与调试入口。

**Tech Stack:** Rust, Tauri 2, CPAL, Hound, WebSocket client for Rust, Serde, React 18, Vite, Vitest

---

## File Map

- `voice-app/.env.example`
  只保留豆包流式 ASR 所需环境变量模板，不再出现 OpenAI/TTS/provider switch。
- `voice-app/README.md`
  更新为豆包唯一 ASR 的运行说明、`.env` 准备方式、原生启动与 smoke 验证步骤。
- `voice-app/crates/asr-core/Cargo.toml`
  引入豆包流式识别所需依赖，删除 OpenAI HTTP 依赖与无用测试依赖。
- `voice-app/crates/asr-core/src/lib.rs`
  改为导出豆包运行时配置、协议事件、流式会话与麦克风采集入口；删除 OpenAI batch API。
- `voice-app/crates/asr-core/src/config.rs`
  解析并校验 `.env` 中的豆包配置，暴露安全快照给上层。
- `voice-app/crates/asr-core/src/doubao_protocol.rs`
  封装帧打包、解包、partial/final/completed/error 事件解析逻辑，参考旧 Electron 实现。
- `voice-app/crates/asr-core/src/streaming_session.rs`
  管理豆包 WebSocket 会话、音频追加、commit、close 及事件回调。
- `voice-app/crates/asr-core/src/microphone.rs`
  保留并抽离麦克风采集逻辑，输出实时 PCM chunk 与收尾 clip。
- `voice-app/crates/asr-core/tests/*`
  覆盖配置缺失、协议解析、事件映射、会话错误路径；移除 `openai_provider.rs`。
- `voice-app/crates/ipc-contract/src/lib.rs`
  将 `RuntimeSnapshot.phase` 默认值和构造语义切换为中文合同。
- `voice-app/crates/ipc-contract/tests/runtime_snapshot.rs`
  验证默认 snapshot 输出中文 phase。
- `voice-app/crates/settings-core/src/model.rs`
  默认设置切换为 `doubao` 与豆包模型快照。
- `voice-app/crates/settings-core/tests/settings_defaults.rs`
  验证默认 provider/model 已不再包含 OpenAI。
- `voice-app/crates/voice-core/src/runtime_snapshot.rs`
  保留内部枚举，但增加稳定的中文 phase 映射。
- `voice-app/crates/voice-core/src/runtime_machine.rs`
  改造成流式状态机，支持 partial/final/commit/completed/error 事件。
- `voice-app/crates/voice-core/tests/runtime_snapshot.rs`
  验证内部 phase 到中文 snapshot 的映射。
- `voice-app/crates/voice-core/tests/runtime_machine.rs`
  验证流式识别状态演进，不再依赖 demo transcript/OpenAI 错误文案。
- `voice-app/apps/desktop/src-tauri/Cargo.toml`
  为 `.env` 加载与桌面侧运行时装配补齐依赖。
- `voice-app/apps/desktop/src-tauri/src/lib.rs`
  在 `AppState` 构造前加载 `.env`，显式创建 `AppState`，注册新的 runtime 命令。
- `voice-app/apps/desktop/src-tauri/src/app_state.rs`
  用活跃流式任务替代 `pending_audio_artifact`，处理 partial/final/completed/error，并把 `Released` 语义改为 `commit session`。
- `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`
  `Pressed -> start streaming`，`Released -> stop capture + commit`，删除 `spawn_pending_transcription`。
- `voice-app/apps/desktop/src-tauri/src/commands.rs`
  删除英文 phase demo 命令，保留/新增原生调试入口与 runtime 同步辅助。
- `voice-app/apps/desktop/src-tauri/src/windowing.rs`
  基于中文 phase 控制 overlay/result 显隐。
- `voice-app/apps/desktop/src/features/runtime/*`
  前端 runtime/overlay/result 统一展示中文状态与流式 transcript。
- `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
  展示豆包安全配置快照，不再显示 OpenAI provider/model。
- `voice-app/apps/desktop/src/lib/tauri.ts`
  更新 Tauri 命令和类型定义，删掉 demo phase 驱动接口。
- `voice-app/apps/desktop/src/lib/runtimePhase.ts`
  新增前端 phase 元数据映射，解决中文 phase 与 CSS class 的分离。
- `voice-app/apps/desktop/src/test/setup.ts`
  mock 改为豆包流式事件序列与中文状态。
- `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`
  覆盖中文状态展示、partial transcript、完成/失败路径、设置快照。

### Task 1: Lock The Runtime Contract To Chinese Phases And Doubao Defaults

**Files:**
- Modify: `voice-app/crates/ipc-contract/src/lib.rs`
- Modify: `voice-app/crates/ipc-contract/tests/runtime_snapshot.rs`
- Modify: `voice-app/crates/settings-core/src/model.rs`
- Modify: `voice-app/crates/settings-core/tests/settings_defaults.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_snapshot.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_snapshot.rs`

- [ ] **Step 1: Write failing tests for Chinese default snapshot and Doubao-only settings defaults**
- [ ] **Step 2: Run `cargo test -p ipc-contract` and `cargo test -p settings-core` and confirm RED on old English/OpenAI expectations**
- [ ] **Step 3: Change `RuntimeSnapshot::default()` to emit `待命中` and change `VoiceSettings::default()` to emit `doubao` / `bigmodel`-style defaults**
- [ ] **Step 4: Add a single source of truth in `voice-core` for `Idle/Listening/Processing/Done/Error -> 待命中/正在聆听/正在识别/已完成/识别失败`**
- [ ] **Step 5: Re-run `cargo test -p ipc-contract` and `cargo test -p settings-core` and confirm GREEN**

### Task 2: Replace OpenAI Batch Logic With Doubao Streaming Primitives In `asr-core`

**Files:**
- Modify: `voice-app/crates/asr-core/Cargo.toml`
- Modify: `voice-app/crates/asr-core/src/lib.rs`
- Create: `voice-app/crates/asr-core/src/config.rs`
- Create: `voice-app/crates/asr-core/src/doubao_protocol.rs`
- Create: `voice-app/crates/asr-core/src/streaming_session.rs`
- Create: `voice-app/crates/asr-core/src/microphone.rs`
- Delete: `voice-app/crates/asr-core/tests/openai_provider.rs`
- Create: `voice-app/crates/asr-core/tests/doubao_config.rs`
- Create: `voice-app/crates/asr-core/tests/doubao_protocol.rs`
- Create: `voice-app/crates/asr-core/tests/doubao_session.rs`

- [ ] **Step 1: Write failing tests for required `.env` fields, protocol frame parsing, and partial/final/completed/error event extraction**
- [ ] **Step 2: Run `cargo test -p asr-core` and confirm RED because the crate still exposes `AudioTranscriptionService::OpenAi`**
- [ ] **Step 3: Introduce `DoubaoAsrConfig` that reads only `VOICE_APP_DOUBAO_ASR_*` variables and produces a safe snapshot for settings/UI**
- [ ] **Step 4: Port the old Electron frame builder/parser into Rust, keeping protocol constants local to `doubao_protocol.rs`**
- [ ] **Step 5: Implement a streaming session API with `connect`, `append_audio`, `commit`, `close`, and callback/event channel delivery**
- [ ] **Step 6: Extract microphone capture into a focused module that can stream PCM chunks and still materialize a final clip when needed for logs/history**
- [ ] **Step 7: Delete OpenAI config, HTTP transcription code, `VOICE_APP_ASR_PROVIDER` parsing, and any dead compatibility branches**
- [ ] **Step 8: Re-run `cargo test -p asr-core` and confirm GREEN**

### Task 3: Rebuild `voice-core` Around A Streaming Lifecycle

**Files:**
- Modify: `voice-app/crates/voice-core/src/runtime_machine.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_machine.rs`

- [ ] **Step 1: Write failing tests for `正在聆听 -> 正在识别 -> 已完成/识别失败` and for partial transcript accumulation**
- [ ] **Step 2: Run `cargo test -p voice-core` and confirm RED on demo-specific expectations**
- [ ] **Step 3: Replace demo helpers with streaming-specific mutations such as `start_listening`, `update_partial_transcript`, `finish_listening_and_wait`, `complete_success_with`, and `complete_error_with`**
- [ ] **Step 4: Ensure `RuntimeMachine::snapshot()` always returns Chinese contract strings while history status continues using stable success/error semantics**
- [ ] **Step 5: Re-run `cargo test -p voice-core` and confirm GREEN**

### Task 4: Wire Tauri Runtime To An Active Doubao Session Instead Of `pending_audio_artifact`

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/Cargo.toml`
- Modify: `voice-app/apps/desktop/src-tauri/src/lib.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/windowing.rs`

- [ ] **Step 1: Write failing Rust tests for `.env` loading before `AppState`, hotkey `Pressed/Released`, partial event propagation, commit on release, and Chinese window visibility**
- [ ] **Step 2: Run `cargo test -p voice-app-desktop` and confirm RED on the old batch path**
- [ ] **Step 3: Add an explicit runtime bootstrap path such as `build_app_state_from_env()` and load `voice-app/.env` before `Builder.manage(...)`**
- [ ] **Step 4: Replace `pending_audio_artifact` with an `ActiveVoiceTask` that owns microphone capture, doubao session handle, accumulated transcript, and cancellation state**
- [ ] **Step 5: On hotkey press, start capture + connect Doubao + set runtime to `正在聆听`; on hotkey release, stop capture + send `commit` + set runtime to `正在识别`**
- [ ] **Step 6: Route partial/final/completed/error callbacks into `RuntimeMachine`, logs, history, and `runtime-snapshot/history-updated/logs-updated` events**
- [ ] **Step 7: Remove `spawn_pending_transcription`, `run_pending_transcription`, `set_runtime_phase`, and other demo-only English phase commands that would leave the old contract reachable**
- [ ] **Step 8: Re-run `cargo test -p voice-app-desktop` and confirm GREEN**

### Task 5: Update The Desktop Observer UI, Mock Layer, And Frontend Tests

**Files:**
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Create: `voice-app/apps/desktop/src/lib/runtimePhase.ts`
- Modify: `voice-app/apps/desktop/src/App.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/OverlayWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/ResultWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/useRuntimeSnapshot.ts`
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Write failing Vitest cases for中文状态展示、豆包设置快照、partial transcript 实时刷新、completed/error 结果窗口**
- [ ] **Step 2: Run `pnpm --dir voice-app/apps/desktop test` and confirm RED on current OpenAI/English assertions**
- [ ] **Step 3: Remove `startListeningDemo/startProcessingDemo/completeDemo/failDemo/setRuntimePhase` from the frontend bridge and keep only实际运行所需命令**
- [ ] **Step 4: Add a phase metadata helper so CSS class keys stay ASCII while UI labels stay中文合同值**
- [ ] **Step 5: Update runtime panels and overlay/result windows to show streaming transcript and Chinese detail text**
- [ ] **Step 6: Rewrite `setup.ts` to simulate `待命中 -> 正在聆听 -> 正在识别 -> 已完成/识别失败` with豆包 partial/final events instead of OpenAI batch completion**
- [ ] **Step 7: Re-run `pnpm --dir voice-app/apps/desktop test` and confirm GREEN**

### Task 6: Document The Doubao-Only Runtime And Verify The Native App End To End

**Files:**
- Create: `voice-app/.env.example`
- Modify: `voice-app/README.md`

- [ ] **Step 1: Add `.env.example` containing only the approved `VOICE_APP_DOUBAO_ASR_*` keys from the design doc**
- [ ] **Step 2: Update `README.md` with Doubao-only setup, `.env` copy instructions, and the exact native startup command `pnpm --dir apps/desktop exec tauri dev`**
- [ ] **Step 3: Run `cargo test`**
- [ ] **Step 4: Run `pnpm --dir voice-app/apps/desktop test`**
- [ ] **Step 5: Run `pnpm --dir voice-app/apps/desktop build`**
- [ ] **Step 6: Run `pnpm --dir voice-app/apps/desktop exec tauri dev` and manually verify: long-press path enters `正在聆听`, release enters `正在识别`, completed shows `已完成`, missing `.env` or bad credentials shows `识别失败`**

## Implementation Notes

- `.env` 加载路径不能依赖当前 shell 所在目录；实现时应从 `apps/desktop/src-tauri` 明确回溯到 `voice-app/` 根目录加载 `.env`。
- 中文 `phase` 是对外合同，不允许只在前端翻译；Rust IPC 发出的字符串必须已经是中文。
- `settings-core` 只保留安全快照；`ACCESS_TOKEN` 一类敏感值只能停留在 Rust 运行时配置里。
- `HistoryRecord.status` 可继续保留 `done/error` 这样的稳定内部语义，但 `RuntimeSnapshot.phase` 和窗口显隐逻辑必须改为中文。
- `RuntimeStatus` 保留手动调试入口是允许的，但这些入口必须调用真实流式链路，不能再直接跳 phase。
- 任何仍然包含 `openai`、`gpt-4o-mini-transcribe`、`VOICE_APP_ASR_PROVIDER`、`idle/listening/processing/done/error` 的测试或运行时分支，都视为本计划未完成。
