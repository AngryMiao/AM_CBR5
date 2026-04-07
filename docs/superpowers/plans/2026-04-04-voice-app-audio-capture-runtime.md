# Voice App Audio Capture Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `voice-app` 从“热键驱动 demo transcript”推进到“真实麦克风录音 + 录音结果闭环”，让 runtime/history/result/logs 反映真实录音产物。

**Architecture:** `asr-core` 先只承担录音与音频产物写盘，不在这一轮承诺真实 speech-to-text provider；Rust runtime 在 `Pressed/Released` 或手动按钮触发时开始/结束录音，将 WAV 文件保存到临时目录，并把录音时长、采样率、输出路径转换为 snapshot/history/logs 可见结果。

**Tech Stack:** Rust, Tauri 2, CPAL, Hound, React, Vitest

---

### Task 1: Build A Testable Audio Artifact Model In `asr-core`

**Files:**
- Modify: `voice-app/crates/asr-core/Cargo.toml`
- Modify: `voice-app/crates/asr-core/src/lib.rs`
- Create: `voice-app/crates/asr-core/tests/audio_artifact.rs`

- [ ] **Step 1: Write failing tests for artifact summary formatting and WAV persistence**
- [ ] **Step 2: Run `cargo test -p asr-core` and confirm RED**
- [ ] **Step 3: Implement `CapturedAudioArtifact` and WAV writing helpers**
- [ ] **Step 4: Re-run `cargo test -p asr-core` and confirm GREEN**

### Task 2: Wire Real Microphone Recording Into Tauri Runtime

**Files:**
- Modify: `voice-app/crates/asr-core/src/lib.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`

- [ ] **Step 1: Write failing Rust tests for start/stop capture state transitions**
- [ ] **Step 2: Run `cargo test -p voice-app-desktop` and confirm RED**
- [ ] **Step 3: Add a microphone recording session type backed by `cpal`**
- [ ] **Step 4: On stop, persist a WAV file and map the artifact into runtime snapshot/history/logs**
- [ ] **Step 5: Re-run `cargo test -p voice-app-desktop` and confirm GREEN**

### Task 3: Expose The Recording Flow In The Desktop Shell

**Files:**
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Write failing frontend tests for recording actions and artifact rendering**
- [ ] **Step 2: Run `pnpm --dir e:\\code\\AM_CBR5\\voice-app\\apps\\desktop test` and confirm RED**
- [ ] **Step 3: Add manual recording actions that call the new Tauri commands**
- [ ] **Step 4: Update mocks so tests simulate real recording summaries instead of fixed demo transcript**
- [ ] **Step 5: Re-run frontend tests and confirm GREEN**

### Task 4: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run `cargo test`**
- [ ] **Step 2: Run `pnpm --dir e:\\code\\AM_CBR5\\voice-app\\apps\\desktop test`**
- [ ] **Step 3: Run `pnpm --dir e:\\code\\AM_CBR5\\voice-app\\apps\\desktop build`**
- [ ] **Step 4: Run `pnpm exec tauri dev` and manually verify a real recording file is created**

## Notes For Execution

- 本轮完成后，`voice-app` 应具备真实录音能力，但仍不等于已经拥有真正语音识别。
- 这一步的“transcript/result”会先反映真实录音元数据与文件路径，下一步再接真实 ASR provider。
- 若宿主机没有麦克风权限或输入设备不可用，错误必须进入 logs 和 runtime error，而不是静默失败。
