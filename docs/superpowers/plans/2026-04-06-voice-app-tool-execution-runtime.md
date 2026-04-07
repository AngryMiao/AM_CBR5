# Voice App Tool Execution Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `voice-app` 中把当前 `ASR -> LLM -> 结果展示` 扩展成 `ASR -> LLM -> 本地工具执行 -> 历史/日志/结果展示` 的最小闭环。

**Architecture:** `llm-core` 负责把 OpenAI-compatible chat completions 响应解析成“普通回答”或“工具执行计划”；`automation-core` 提供最小本地执行器，先支持 `type_text` 与 `open_url`；`voice-core` 扩展执行态 phase；`apps/desktop/src-tauri` 在 ASR 完成后驱动 `LLM -> tool executor -> runtime/history/logs` 主链。前端只消费新的 phase 与结果，不直接控制工具执行。

**Tech Stack:** Rust, Tauri 2, reqwest blocking client, serde, React, Vitest

---

## Scope

本轮只做最小工具执行闭环：

1. OpenAI-compatible LLM 可返回工具执行计划
2. 本地执行器先支持文本输入与打开 URL
3. runtime phase 增加“执行中 / 输出中”
4. 历史记录、日志、overlay/result 能反映工具执行结果

本轮不做：

1. 外部 MCP stdio runtime
2. skill bundle 安装与加载
3. Angrymiao / USB 控制链路
4. 多工具并行编排

## File Structure

- Modify: `voice-app/crates/llm-core/src/lib.rs`
- Modify: `voice-app/crates/llm-core/tests/openai_compatible.rs`
- Modify: `voice-app/crates/automation-core/Cargo.toml`
- Modify: `voice-app/crates/automation-core/src/lib.rs`
- Create: `voice-app/crates/automation-core/src/tool_execution.rs`
- Create: `voice-app/crates/automation-core/tests/tool_execution.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_snapshot.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_machine.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_snapshot.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_machine.rs`
- Modify: `voice-app/apps/desktop/src-tauri/Cargo.toml`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/windowing.rs`
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/lib/runtimePhase.ts`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/OverlayWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/ResultWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

## Task 1: Define Tool Execution Contract

**Files:**
- Modify: `voice-app/crates/llm-core/src/lib.rs`
- Modify: `voice-app/crates/llm-core/tests/openai_compatible.rs`
- Modify: `voice-app/crates/automation-core/src/lib.rs`
- Create: `voice-app/crates/automation-core/src/tool_execution.rs`
- Create: `voice-app/crates/automation-core/tests/tool_execution.rs`

- [ ] **Step 1: Write failing tests for LLM tool-plan parsing**
- [ ] **Step 2: Run targeted `cargo test -p llm-core -p automation-core` to confirm RED**
- [ ] **Step 3: Add tool execution models and minimal executor abstraction**
- [ ] **Step 4: Re-run targeted tests to confirm GREEN**

## Task 2: Extend Runtime State With Execution Phases

**Files:**
- Modify: `voice-app/crates/voice-core/src/runtime_snapshot.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_machine.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_snapshot.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_machine.rs`

- [ ] **Step 1: Write failing tests for `正在执行` / `正在输出` state transitions**
- [ ] **Step 2: Run targeted `cargo test -p voice-core` to confirm RED**
- [ ] **Step 3: Implement execution-state transitions in `RuntimeMachine`**
- [ ] **Step 4: Re-run targeted tests to confirm GREEN**

## Task 3: Wire `LLM -> Tool Executor` Into AppState

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/Cargo.toml`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/windowing.rs`

- [ ] **Step 1: Write failing `AppState` tests for tool-execution success/failure**
- [ ] **Step 2: Run targeted `cargo test -p voice-app-desktop` to confirm RED**
- [ ] **Step 3: Execute tool plans after LLM response and persist outcomes into history/logs**
- [ ] **Step 4: Re-run targeted tests to confirm GREEN**

## Task 4: Expose Execution Phases In The Desktop UI

**Files:**
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/lib/runtimePhase.ts`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/OverlayWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/ResultWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Write failing frontend tests for execution-phase rendering**
- [ ] **Step 2: Run `pnpm --dir voice-app/apps/desktop test` to confirm RED**
- [ ] **Step 3: Implement phase labels and result rendering updates**
- [ ] **Step 4: Re-run frontend tests to confirm GREEN**

## Task 5: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run `cargo test -p llm-core -p automation-core -p voice-core -p voice-app-desktop`**
- [ ] **Step 2: Run `pnpm --dir voice-app/apps/desktop test`**
- [ ] **Step 3: Run `pnpm --dir voice-app/apps/desktop exec tauri dev` and manually verify native app can执行文本输入/打开链接的最小闭环**
