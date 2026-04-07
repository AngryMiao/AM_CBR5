# Voice App OpenAI-Compatible LLM Runtime Implementation Plan

> 更新（2026-04-06）：
> 当前实现已经取消 env-driven 配置路线。
> OpenAI-compatible LLM 配置统一来自 `settings.json`，
> 由设置页保存后供后续新任务读取。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `voice-app` 中打通 `ASR final transcript -> OpenAI-compatible LLM -> result/history/logs` 的最小闭环。

**Architecture:** 新增 `crates/llm-core` 负责 OpenAI-compatible chat completions；`app_state` 在 ASR completed 后切换到 `正在生成` 并启动后台 LLM 线程；`voice-core` 扩展 `Generating` 状态；前端只消费新的 runtime/history/settings 快照。

**Tech Stack:** Rust, reqwest blocking client, serde, Tauri 2, React, Vitest

---

### Task 1: Add The LLM Core Boundary

**Files:**
- Create: `voice-app/crates/llm-core/Cargo.toml`
- Create: `voice-app/crates/llm-core/src/lib.rs`
- Create: `voice-app/crates/llm-core/tests/openai_compatible.rs`
- Modify: `voice-app/Cargo.toml`

- [ ] **Step 1: Write failing `llm-core` tests**
- [ ] **Step 2: Run targeted `cargo test -p llm-core` to confirm RED**
- [ ] **Step 3: Implement env-driven config, runtime snapshot, and `/chat/completions` request**
- [ ] **Step 4: Re-run `cargo test -p llm-core` to confirm GREEN**

### Task 2: Extend Voice Runtime State For LLM Generation

**Files:**
- Modify: `voice-app/crates/voice-core/src/runtime_snapshot.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_machine.rs`
- Modify: `voice-app/crates/voice-core/src/lib.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_snapshot.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_machine.rs`

- [ ] **Step 1: Write failing tests for `正在生成` phase**
- [ ] **Step 2: Run `cargo test -p voice-core` to confirm RED**
- [ ] **Step 3: Implement `Generating` runtime phase and state-machine transition**
- [ ] **Step 4: Re-run `cargo test -p voice-core` to confirm GREEN**

### Task 3: Wire LLM Generation Into AppState

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/Cargo.toml`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Write failing `AppState` tests for ASR-complete -> LLM-success / LLM-error**
- [ ] **Step 2: Run `cargo test -p voice-app-desktop` to confirm RED**
- [ ] **Step 3: Inject `llm-core` config/client and spawn background generation after ASR completed**
- [ ] **Step 4: Re-run `cargo test -p voice-app-desktop` to confirm GREEN**

### Task 4: Expose Safe LLM Settings To The Frontend

**Files:**
- Modify: `voice-app/crates/settings-core/src/model.rs`
- Modify: `voice-app/crates/settings-core/tests/settings_defaults.rs`
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Write failing frontend/settings tests for LLM fields and `正在生成`**
- [ ] **Step 2: Run `pnpm --dir apps/desktop test` to confirm RED**
- [ ] **Step 3: Implement bridge types, safe settings fields, and UI rendering**
- [ ] **Step 4: Re-run `pnpm --dir apps/desktop test` to confirm GREEN**

### Task 5: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run `cargo test`**
- [ ] **Step 2: Run `pnpm --dir apps/desktop test`**
- [ ] **Step 3: Run `pnpm --dir apps/desktop exec tauri dev` and verify the native app launches**

## Notes

- 本轮不引入 MCP，不引入文本插入。
- OpenAI-compatible 只保留单 provider，不做 registry。
- 若未来要进 `MCP`，应沿用 `llm-core -> voice-core/app_state -> automation-core` 的分层，不要把工具执行反塞回前端。
