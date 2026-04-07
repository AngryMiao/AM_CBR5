# Voice App Runtime Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `voice-app` 从“仅能切 phase 的调试壳”推进到“Rust runtime 主导的最小语音任务闭环”，让主窗口、overlay/result、history、settings、logs 都有真实状态与结果数据。

**Architecture:** `voice-core` 承载最小任务状态机与 demo 结果生成；`history-core`、`settings-core`、`ipc-contract` 提供可序列化模型；`apps/desktop/src-tauri` 统一持有 app state、窗口联动和事件广播；React 前端只订阅 snapshot/history/logs/settings 并渲染。先做可验证的 demo runtime 闭环，不在这一轮直接接入真实 global hotkey、录音设备和 ASR provider SDK。

**Tech Stack:** Rust, Tauri 2, React, TypeScript, Vitest

---

## Scope Check

本计划只覆盖 `runtime & automation` 的第一批可验证能力：

1. Rust 拥有 runtime snapshot、history、settings、logs
2. 主窗口面板展示真实数据
3. overlay/result window 展示真实任务结果
4. runtime 按钮触发“开始监听 -> 处理中 -> 完成/失败 -> 重置”真实闭环

本计划不覆盖：

1. 系统级 global hotkey
2. 真实麦克风采集
3. 真实 ASR/LLM/MCP provider
4. 文本插入到外部焦点

## File Structure

- Modify: `voice-app/crates/ipc-contract/src/lib.rs`
- Modify: `voice-app/crates/history-core/src/model.rs`
- Modify: `voice-app/crates/settings-core/src/model.rs`
- Modify: `voice-app/crates/voice-core/src/lib.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_snapshot.rs`
- Create: `voice-app/crates/voice-core/src/runtime_machine.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_snapshot.rs`
- Create: `voice-app/crates/voice-core/tests/runtime_machine.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/windowing.rs`
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/features/runtime/useRuntimeSnapshot.ts`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/ResultWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`

## Task 1: Expand Shared Models And Runtime State Machine

**Files:**
- Modify: `voice-app/crates/ipc-contract/src/lib.rs`
- Modify: `voice-app/crates/history-core/src/model.rs`
- Modify: `voice-app/crates/settings-core/src/model.rs`
- Modify: `voice-app/crates/voice-core/src/lib.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_snapshot.rs`
- Create: `voice-app/crates/voice-core/src/runtime_machine.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_snapshot.rs`
- Create: `voice-app/crates/voice-core/tests/runtime_machine.rs`

- [ ] **Step 1: Write failing Rust tests for runtime task lifecycle and richer snapshot**
- [ ] **Step 2: Run Rust tests to confirm RED**
- [ ] **Step 3: Implement serializable models for runtime snapshot, history record, settings snapshot**
- [ ] **Step 4: Implement `RuntimeMachine` with start/process/succeed/fail/reset operations**
- [ ] **Step 5: Re-run targeted Rust tests to confirm GREEN**

## Task 2: Wire Tauri App State, Commands, Events, And Window Sync

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/windowing.rs`

- [ ] **Step 1: Write failing Rust tests for app-state history/log accumulation**
- [ ] **Step 2: Run targeted Rust tests to confirm RED**
- [ ] **Step 3: Extend `AppState` to own runtime machine, history list, settings snapshot, logs, latest result**
- [ ] **Step 4: Add Tauri commands for listening/process/reset, history/settings/log reads, and event emission**
- [ ] **Step 5: Re-run targeted Rust tests to confirm GREEN**

## Task 3: Render Real Runtime Data In The Frontend

**Files:**
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/features/runtime/useRuntimeSnapshot.ts`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/ResultWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`

- [ ] **Step 1: Write failing frontend tests for history/result/settings/log rendering**
- [ ] **Step 2: Run frontend tests to confirm RED**
- [ ] **Step 3: Extend Tauri bridge and mocks with runtime actions plus history/settings/log payloads**
- [ ] **Step 4: Implement hooks and panel UIs that render real runtime data**
- [ ] **Step 5: Re-run frontend tests to confirm GREEN**

## Task 4: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run `pnpm --dir e:\\code\\AM_CBR5\\voice-app\\apps\\desktop test`**
- [ ] **Step 2: Run `cargo test -p voice-core -p voice-app-desktop` with the verified Windows MSVC environment**
- [ ] **Step 3: Run `pnpm exec tauri dev` in `voice-app/apps/desktop` and confirm the native desktop binary launches**

## Notes For Execution

- 这轮验收标准不是“全部产品功能完工”，而是“runtime/automation 的最小可验证闭环已经真实落到 Rust runtime 中”。
- 若后续要继续做一期产品闭环，下一步应接入真实 hotkey、audio capture、ASR provider，而不是继续堆静态面板。
