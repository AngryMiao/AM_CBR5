# Voice App Background Tray Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `voice-app` 增加最小可用的后台常驻壳层，让主窗口关闭后隐藏到后台，并提供 tray 入口重新打开或退出应用。

**Architecture:** 保持现有 `voice-core / app_state / ASR / LLM` 链路不变，只在 `src-tauri` 壳层增加 `tray` 与窗口关闭行为。把可测试逻辑尽量收敛到纯函数，避免把验证绑定到真实系统托盘环境。

**Tech Stack:** Rust, Tauri 2, React, Vitest

---

### Task 1: Add Background Window Policy

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/src/windowing.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for close-to-hide policy**
- [ ] **Step 2: Run `cargo test -p voice-app-desktop windowing` to confirm RED**
- [ ] **Step 3: Implement main-window close interception and hide-to-background behavior**
- [ ] **Step 4: Re-run `cargo test -p voice-app-desktop windowing` to confirm GREEN**

### Task 2: Add Tray Menu And Actions

**Files:**
- Create: `voice-app/apps/desktop/src-tauri/src/tray.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/lib.rs`
- Modify: `voice-app/apps/desktop/src-tauri/Cargo.toml`

- [ ] **Step 1: Write failing Rust tests for tray command routing helpers**
- [ ] **Step 2: Run `cargo test -p voice-app-desktop tray` to confirm RED**
- [ ] **Step 3: Implement tray creation plus `show-main` / `quit-app` actions**
- [ ] **Step 4: Re-run `cargo test -p voice-app-desktop tray` to confirm GREEN**

### Task 3: Update Docs And Verify Native Shell

**Files:**
- Modify: `voice-app/README.md`

- [ ] **Step 1: Update README startup expectations to mention tray/background behavior**
- [ ] **Step 2: Run `cargo test -p voice-app-desktop`**
- [ ] **Step 3: Run `pnpm --dir apps/desktop test -- --run`**
- [ ] **Step 4: Run `pnpm --dir apps/desktop exec tauri dev` and confirm native app launches with tray/background shell active**

## Notes

- 本轮不引入 `MCP`。
- 本轮不引入外部文本插入或系统动作。
- 若 tray API 与平台行为存在差异，先确保 Windows 的最小可验证行为成立。
