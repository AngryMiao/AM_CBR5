# Voice App Global Hotkey Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `voice-app` 接入真正的全局热键入口，让 `Hold Alt+Space` 可以直接驱动 Rust runtime、overlay/result window 与历史/日志更新。

**Architecture:** `automation-core` 负责把设置里的用户可读热键文案转换成可注册的全局 shortcut；`apps/desktop/src-tauri` 负责注册 `tauri-plugin-global-shortcut`、监听 `Pressed/Released` 事件并驱动现有 `AppState`；前端 UI 不进入热路径，只消费现有 runtime/history/logs/settings 数据。

**Tech Stack:** Rust, Tauri 2, tauri-plugin-global-shortcut, React, Vitest

---

### Task 1: Model The Global Hotkey Boundary

**Files:**
- Modify: `voice-app/crates/automation-core/src/lib.rs`
- Create: `voice-app/crates/automation-core/tests/global_hotkey.rs`

- [ ] **Step 1: Write failing tests for display-label to accelerator parsing**
- [ ] **Step 2: Run `cargo test -p automation-core` and confirm RED**
- [ ] **Step 3: Implement a minimal `GlobalHotkey` model that normalizes `Hold Alt+Space` -> `Alt+Space`**
- [ ] **Step 4: Re-run `cargo test -p automation-core` and confirm GREEN**

### Task 2: Wire Pressed / Released Events Into AppState

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/Cargo.toml`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Create: `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for hotkey press/release/auto-complete lifecycle in `AppState`**
- [ ] **Step 2: Run `cargo test -p voice-app-desktop` and confirm RED**
- [ ] **Step 3: Add `tauri-plugin-global-shortcut` and register the configured hotkey during Tauri setup**
- [ ] **Step 4: Reuse the existing runtime/window sync path so hotkey events update overlay/result/history/logs**
- [ ] **Step 5: Re-run `cargo test -p voice-app-desktop` and confirm GREEN**

### Task 3: Verify The Native Hotkey Demo Loop

**Files:**
- Verify only

- [ ] **Step 1: Run `cargo test -p automation-core -p voice-app-desktop`**
- [ ] **Step 2: Run `pnpm --dir e:\\code\\AM_CBR5\\voice-app\\apps\\desktop test`**
- [ ] **Step 3: Run `pnpm --dir e:\\code\\AM_CBR5\\voice-app\\apps\\desktop build`**
- [ ] **Step 4: Run `pnpm exec tauri dev` in `voice-app/apps/desktop` and confirm the native app still launches**

## Notes For Execution

- 这一步的验收目标是“全局热键已进入 Rust runtime 主链”，不是“真实麦克风 / ASR 已接入”。
- 如果默认热键在某些宿主机上注册失败，应用不应崩溃；应保留主窗口可用，并把失败原因写入 runtime logs。
- 热键链路应沿用现有 demo runtime：按下进入 `listening`，松开进入 `processing`，再自动完成到 `done`，让 overlay/result/history/logs 都有可见变化。
