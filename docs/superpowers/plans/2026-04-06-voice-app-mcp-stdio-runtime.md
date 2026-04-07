# Voice App MCP Stdio Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `voice-app` 中先落地一个可测试的 `mcp-core` stdio runtime 基础，为后续 settings/UI/LLM integration 提供稳定底座。

**Architecture:** 本计划只覆盖新的 `crates/mcp-core` 与迁移文档口径同步，不直接接入当前 `AppState`、设置页或前端 UI。`mcp-core` 负责最小 MCP 客户端能力：`initialize -> notifications/initialized -> tools/list -> tools/call`，以及对 enabled stdio server 的同步管理；集成到 `settings-core / llm-core / desktop` 的工作拆到下一批单独计划。

**Tech Stack:** Rust, serde, serde_json, std::process

---

## Scope

本轮只做：

1. 新增 `crates/mcp-core`
2. 支持 stdio transport 的最小 MCP runtime
3. 通过 fake transport 测试 `initialize / tools/list / tools/call`
4. 同步迁移文档，明确 MCP 已从“暂不接入”调整为“runtime foundation 已启动，但尚未接入主链”

本轮不做：

1. `settings-core` 存储 MCP server 配置
2. `apps/desktop` 设置页 MCP UI
3. `llm-core` 动态 MCP tool definitions
4. `AppState` 真实执行 MCP tool calls
5. skill bundle 安装与 USB/Angrymiao 控制

## File Structure

- Modify: `voice-app/Cargo.toml`
- Create: `voice-app/crates/mcp-core/Cargo.toml`
- Create: `voice-app/crates/mcp-core/src/lib.rs`
- Create: `voice-app/crates/mcp-core/tests/runtime.rs`
- Modify: `voice-app/docs/migration/feature-inventory.md`
- Modify: `voice-app/docs/migration/electron-capability-map.md`

### Task 1: Add MCP Core Runtime

**Files:**
- Modify: `voice-app/Cargo.toml`
- Create: `voice-app/crates/mcp-core/Cargo.toml`
- Create: `voice-app/crates/mcp-core/src/lib.rs`
- Create: `voice-app/crates/mcp-core/tests/runtime.rs`

- [ ] **Step 1: Write failing tests for MCP initialize, tools/list, and tools/call flow**
- [ ] **Step 2: Run `cargo test -p mcp-core -- --nocapture` to confirm RED**
- [ ] **Step 3: Implement the minimal stdio MCP runtime and tool descriptor model**
- [ ] **Step 4: Re-run `cargo test -p mcp-core -- --nocapture` to confirm GREEN**

### Task 2: Sync Migration Docs

**Files:**
- Modify: `voice-app/docs/migration/feature-inventory.md`
- Modify: `voice-app/docs/migration/electron-capability-map.md`

- [ ] **Step 1: Add a failing documentation expectation by locating outdated “MCP not in current phase” statements**
- [ ] **Step 2: Update migration docs to reflect that MCP runtime foundation has started but desktop integration is still pending**
- [ ] **Step 3: Re-read the updated sections and confirm they no longer conflict with the active plan**

### Task 3: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run `cargo test -p mcp-core -- --nocapture`**
- [ ] **Step 2: Run `cargo test -p automation-core -p llm-core -p voice-core -p voice-app-desktop -- --nocapture` to ensure no workspace regression**
- [ ] **Step 3: Summarize the exact next integration slice: settings-core, llm-core, or app_state**
