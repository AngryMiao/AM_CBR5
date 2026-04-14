# Voice App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `voice-app/` 下建立可运行的 `Rust-first + Tauri-shell` 新工程基线，产出后台常驻语音代理的目录结构、迁移文档骨架、桌面壳入口和 Rust 核心 crate 边界。

**Architecture:** 本计划只覆盖第一子项目：`voice-app` 基线搭建，不试图一次性实现完整的 `ASR -> LLM -> MCP -> 文本插入` 闭环。实现结果应满足：`voice-app/` 成为唯一的新项目入口；前台 UI 只有历史/设置/日志/调试面板；Rust workspace、Tauri desktop shell、迁移文档与核心 crate 边界全部落地，为后续 native automation、ASR、LLM/MCP 计划提供稳定基座。

**Tech Stack:** Rust, Tauri 2, TypeScript, React, Vite, pnpm, Cargo workspace, Vitest, SQLite/JSON persistence placeholders

---

## Scope Check

当前 spec 涵盖多个独立子系统：

1. 新项目基线与目录重构
2. 后台常驻 runtime
3. 低层输入 / 热键 / 文本插入
4. ASR 链路
5. LLM -> MCP 链路
6. 历史记录与设置 UI

本计划**只处理第 1 个子系统**，并为第 2 到第 6 个子系统建立实现入口。  
后续至少还需要：

1. `voice-app` runtime/automation plan
2. `voice-app` ASR/LLM/MCP loop plan
3. `voice-app` history/settings UX plan

## Preconditions

当前工作区验证结果：

1. `voice-app/` 不存在
2. `pnpm` 可用，版本 `10.15.1`
3. `node` 可用，版本 `v22.12.0`
4. `cargo` 当前不可用，必须先安装 Rust toolchain
5. 计划执行应在隔离 worktree 中进行；`git status --short` 的 clean tree 要求只约束该 worktree，不约束当前主工作区

## File Structure

- Create: `voice-app/.gitignore`
- Create: `voice-app/README.md`
- Create: `voice-app/package.json`
- Create: `voice-app/pnpm-workspace.yaml`
- Create: `voice-app/pnpm-lock.yaml`
- Create: `voice-app/Cargo.toml`
- Create: `voice-app/docs/migration/feature-inventory.md`
- Create: `voice-app/docs/migration/electron-capability-map.md`
- Create: `voice-app/docs/migration/target-architecture.md`
- Create: `voice-app/docs/migration/migration-plan.md`
- Create: `voice-app/apps/desktop/package.json`
- Create: `voice-app/apps/desktop/tsconfig.json`
- Create: `voice-app/apps/desktop/vite.config.ts`
- Create: `voice-app/apps/desktop/vitest.config.ts`
- Create: `voice-app/apps/desktop/index.html`
- Create: `voice-app/apps/desktop/src/main.tsx`
- Create: `voice-app/apps/desktop/src/App.tsx`
- Create: `voice-app/apps/desktop/src/styles.css`
- Create: `voice-app/apps/desktop/src/test/setup.ts`
- Create: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Create: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Create: `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`
- Create: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Create: `voice-app/apps/desktop/src/lib/tauri.ts`
- Create: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`
- Create: `voice-app/apps/desktop/src-tauri/Cargo.toml`
- Create: `voice-app/apps/desktop/src-tauri/build.rs`
- Create: `voice-app/apps/desktop/src-tauri/tauri.conf.json`
- Create: `voice-app/apps/desktop/src-tauri/capabilities/default.json`
- Create: `voice-app/apps/desktop/src-tauri/src/main.rs`
- Create: `voice-app/apps/desktop/src-tauri/src/lib.rs`
- Create: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Create: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Create: `voice-app/apps/desktop/src-tauri/src/windowing.rs`
- Create: `voice-app/crates/ipc-contract/Cargo.toml`
- Create: `voice-app/crates/ipc-contract/src/lib.rs`
- Create: `voice-app/crates/ipc-contract/tests/runtime_snapshot.rs`
- Create: `voice-app/crates/settings-core/Cargo.toml`
- Create: `voice-app/crates/settings-core/src/lib.rs`
- Create: `voice-app/crates/settings-core/src/model.rs`
- Create: `voice-app/crates/settings-core/tests/settings_defaults.rs`
- Create: `voice-app/crates/history-core/Cargo.toml`
- Create: `voice-app/crates/history-core/src/lib.rs`
- Create: `voice-app/crates/history-core/src/model.rs`
- Create: `voice-app/crates/history-core/tests/history_record.rs`
- Create: `voice-app/crates/logging-core/Cargo.toml`
- Create: `voice-app/crates/logging-core/src/lib.rs`
- Create: `voice-app/crates/voice-core/Cargo.toml`
- Create: `voice-app/crates/voice-core/src/lib.rs`
- Create: `voice-app/crates/voice-core/src/runtime_snapshot.rs`
- Create: `voice-app/crates/voice-core/tests/runtime_snapshot.rs`
- Create: `voice-app/crates/platform-core/Cargo.toml`
- Create: `voice-app/crates/platform-core/src/lib.rs`
- Create: `voice-app/crates/automation-core/Cargo.toml`
- Create: `voice-app/crates/automation-core/src/lib.rs`
- Create: `voice-app/crates/asr-core/Cargo.toml`
- Create: `voice-app/crates/asr-core/src/lib.rs`

## Constraints

- 本计划只搭建基础工程，不实现完整业务闭环。
- `voice-app` 不允许出现 chatbox 首页或聊天主路由。
- `apps/desktop` 只能包含历史、设置、日志、调试这类辅助 UI。
- Rust 核心 crate 必须先建清晰边界，再接入平台相关实现。
- 由于当前环境缺少 `cargo`，真正执行前必须先补工具链；没有工具链，不允许虚报“脚手架已可运行”。
- 不允许复用旧 Electron 构建链、preload 约定或 `window.electronAPI` 命名。
- `@tauri-apps/cli` 只能安装在 `voice-app/` 根，不允许污染旧仓库根 `package.json` / `pnpm-lock.yaml`。

## Task 1: Install Rust Toolchain And Verify Host Prerequisites

**Files:**
- Verify only

- [ ] **Step 1: Install Rust on the current Windows host**

Run:

```powershell
winget install Rustlang.Rustup
```

If `winget` is unavailable, fall back to the official installer and ensure `cargo` lands in `PATH`.

- [ ] **Step 2: Verify Rust toolchain is available**

Run:

```powershell
cargo --version
rustup --version
rustc --version
```

Expected:

```text
cargo 1.x.x
rustup 1.x.x
rustc 1.x.x
```

- [ ] **Step 3: Verify Windows host prerequisites for Tauri**

Run:

```powershell
Get-Command cl.exe -ErrorAction SilentlyContinue
winget list Microsoft.EdgeWebView2Runtime
```

Expected:

```text
cl.exe 可用，且存在 WebView2 Runtime
```

- [ ] **Step 4: Record macOS prerequisites for later execution**

在执行日志中记录以下要求，供 macOS 主机执行时验证：

```bash
xcode-select -p
```

若未安装，则执行：

```bash
xcode-select --install
```

- [ ] **Step 5: Verify Node-side prerequisites**

Run:

```powershell
pnpm --version
node --version
```

Expected:

```text
10.15.1
v22.12.0
```

## Task 2: Create The `voice-app` Root Workspace And Migration Docs Skeleton

**Files:**
- Create: `voice-app/.gitignore`
- Create: `voice-app/README.md`
- Create: `voice-app/package.json`
- Create: `voice-app/pnpm-workspace.yaml`
- Create: `voice-app/pnpm-lock.yaml`
- Create: `voice-app/Cargo.toml`
- Create: `voice-app/docs/migration/feature-inventory.md`
- Create: `voice-app/docs/migration/electron-capability-map.md`
- Create: `voice-app/docs/migration/target-architecture.md`
- Create: `voice-app/docs/migration/migration-plan.md`

- [ ] **Step 1: Create the root directory tree**

Create exactly:

```text
voice-app/
voice-app/docs/migration/
voice-app/apps/desktop/
voice-app/crates/
voice-app/tools/
voice-app/scripts/
```

- [ ] **Step 2: Write the root `package.json`**

Use:

```json
{
  "name": "voice-app-workspace",
  "private": true,
  "packageManager": "pnpm@10.15.1",
  "scripts": {
    "dev": "pnpm --dir apps/desktop dev",
    "build": "pnpm --dir apps/desktop build",
    "test": "pnpm --dir apps/desktop test"
  }
}
```

- [ ] **Step 3: Write the root Cargo workspace**

Use:

```toml
[workspace]
members = [
  "apps/desktop/src-tauri",
  "crates/ipc-contract",
  "crates/settings-core",
  "crates/history-core",
  "crates/logging-core",
  "crates/voice-core",
  "crates/platform-core",
  "crates/automation-core",
  "crates/asr-core",
]
resolver = "2"
```

- [ ] **Step 4: Install Tauri CLI in `voice-app/` root**

Run:

```powershell
pnpm --dir voice-app add -D @tauri-apps/cli
pnpm --dir voice-app exec tauri --version
```

Expected:

```text
Packages: +1
tauri-cli 2.x.x
```

- [ ] **Step 5: Seed the migration docs with real headings**

Each migration doc must include at least:

```md
# <Doc Title>

## Purpose
## Inputs From Legacy Project
## Decisions
## Open Questions
```

`feature-inventory.md` must additionally contain sections:

```md
## Phase 1
## Phase 2
## Phase 3
## Not Migrating
```

- [ ] **Step 6: Verify the root layout**

Run:

```powershell
Get-ChildItem voice-app
Get-ChildItem voice-app/docs/migration
```

Expected:

```text
README.md
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
Cargo.toml
docs
apps
crates
tools
scripts
```

- [ ] **Step 7: Commit**

```bash
git add voice-app
git commit -m "feat(voice-app): 初始化重构工作区与迁移文档骨架"
```

## Task 3: Scaffold The Desktop Tauri Shell Without A Chatbox Home

**Files:**
- Create: `voice-app/apps/desktop/package.json`
- Create: `voice-app/apps/desktop/tsconfig.json`
- Create: `voice-app/apps/desktop/vite.config.ts`
- Create: `voice-app/apps/desktop/vitest.config.ts`
- Create: `voice-app/apps/desktop/index.html`
- Create: `voice-app/apps/desktop/src/main.tsx`
- Create: `voice-app/apps/desktop/src/App.tsx`
- Create: `voice-app/apps/desktop/src/styles.css`
- Create: `voice-app/apps/desktop/src/test/setup.ts`
- Create: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Create: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Create: `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`
- Create: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Create: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Write the failing frontend shell test**

In `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`, add:

```tsx
import { render, screen } from '@testing-library/react'
import App from '../App'

it('renders history, settings, logs, and runtime sections without a chatbox home', () => {
  render(<App />)

  expect(screen.getByText('History')).toBeInTheDocument()
  expect(screen.getByText('Settings')).toBeInTheDocument()
  expect(screen.getByText('Logs')).toBeInTheDocument()
  expect(screen.getByText('Runtime')).toBeInTheDocument()
  expect(screen.queryByText(/chatbox/i)).toBeNull()
})
```

- [ ] **Step 2: Create the desktop package manifest**

Use:

```json
{
  "name": "voice-app-desktop",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "@tauri-apps/api": "^2.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.8.3",
    "vite": "^7.2.6",
    "vitest": "^4.0.16",
    "jsdom": "^26.1.0"
  }
}
```

- [ ] **Step 3: Add the frontend test baseline**

Create `voice-app/apps/desktop/vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

Create `voice-app/apps/desktop/src/test/setup.ts` with:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Implement the minimal shell**

`App.tsx` should render four panels only:

```tsx
import { HistoryPanel } from './features/history/HistoryPanel'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { LogsPanel } from './features/logs/LogsPanel'
import { RuntimeStatus } from './features/runtime/RuntimeStatus'

export default function App() {
  return (
    <main>
      <header>
        <h1>Voice App</h1>
        <p>Background-first voice agent</p>
      </header>
      <RuntimeStatus />
      <HistoryPanel />
      <SettingsPanel />
      <LogsPanel />
    </main>
  )
}
```

- [ ] **Step 5: Run the frontend test**

Run:

```powershell
pnpm --dir voice-app/apps/desktop install
pnpm --dir voice-app/apps/desktop test
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

```bash
git add voice-app/apps/desktop
git commit -m "feat(voice-app): 添加无 chatbox 的桌面壳"
```

## Task 4: Create The Core Rust Crates And Contract Tests

**Files:**
- Create: `voice-app/crates/ipc-contract/Cargo.toml`
- Create: `voice-app/crates/ipc-contract/src/lib.rs`
- Create: `voice-app/crates/settings-core/Cargo.toml`
- Create: `voice-app/crates/settings-core/src/lib.rs`
- Create: `voice-app/crates/settings-core/src/model.rs`
- Create: `voice-app/crates/settings-core/tests/settings_defaults.rs`
- Create: `voice-app/crates/history-core/Cargo.toml`
- Create: `voice-app/crates/history-core/src/lib.rs`
- Create: `voice-app/crates/history-core/src/model.rs`
- Create: `voice-app/crates/history-core/tests/history_record.rs`
- Create: `voice-app/crates/logging-core/Cargo.toml`
- Create: `voice-app/crates/logging-core/src/lib.rs`
- Create: `voice-app/crates/voice-core/Cargo.toml`
- Create: `voice-app/crates/voice-core/src/lib.rs`
- Create: `voice-app/crates/voice-core/src/runtime_snapshot.rs`
- Create: `voice-app/crates/voice-core/tests/runtime_snapshot.rs`
- Create: `voice-app/crates/platform-core/Cargo.toml`
- Create: `voice-app/crates/platform-core/src/lib.rs`
- Create: `voice-app/crates/automation-core/Cargo.toml`
- Create: `voice-app/crates/automation-core/src/lib.rs`
- Create: `voice-app/crates/asr-core/Cargo.toml`
- Create: `voice-app/crates/asr-core/src/lib.rs`

- [ ] **Step 1: Write the failing IPC contract test**

In `voice-app/crates/ipc-contract/tests/runtime_snapshot.rs`, add:

```rust
use ipc_contract::RuntimeSnapshot;

#[test]
fn default_runtime_snapshot_is_idle() {
    let snapshot = RuntimeSnapshot::default();
    assert_eq!(snapshot.phase, "idle");
}
```

- [ ] **Step 2: Write the failing settings defaults test**

In `voice-app/crates/settings-core/tests/settings_defaults.rs`, add:

```rust
use settings_core::VoiceSettings;

#[test]
fn defaults_enable_background_agent_shape() {
    let settings = VoiceSettings::default();
    assert_eq!(settings.work_mode, "background-agent");
    assert!(settings.history_enabled);
}
```

- [ ] **Step 3: Write the failing history record test**

In `voice-app/crates/history-core/tests/history_record.rs`, add:

```rust
use history_core::HistoryRecord;

#[test]
fn history_record_keeps_transcript_and_result() {
    let record = HistoryRecord::new("hello", "world");
    assert_eq!(record.transcript, "hello");
    assert_eq!(record.result, "world");
}
```

- [ ] **Step 4: Write the failing voice snapshot test**

In `voice-app/crates/voice-core/tests/runtime_snapshot.rs`, add:

```rust
use voice_core::RuntimePhase;

#[test]
fn runtime_phase_defaults_to_idle() {
    assert_eq!(RuntimePhase::default().as_str(), "idle");
}
```

- [ ] **Step 5: Implement the minimal models and contract**

Implement:

```rust
// ipc-contract
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeSnapshot {
    pub phase: String,
}

impl Default for RuntimeSnapshot {
    fn default() -> Self {
        Self {
            phase: "idle".to_string(),
        }
    }
}

// settings-core
#[derive(Clone)]
pub struct VoiceSettings {
    pub work_mode: String,
    pub history_enabled: bool,
}

impl Default for VoiceSettings {
    fn default() -> Self {
        Self {
            work_mode: "background-agent".to_string(),
            history_enabled: true,
        }
    }
}

// history-core
pub struct HistoryRecord {
    pub transcript: String,
    pub result: String,
}

impl HistoryRecord {
    pub fn new(transcript: &str, result: &str) -> Self { /* ... */ }
}

// voice-core
#[derive(Default, Clone, Copy, PartialEq, Eq)]
pub enum RuntimePhase {
    #[default]
    Idle,
}

impl RuntimePhase {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
        }
    }
}
```

- [ ] **Step 6: Run the crate tests**

Run:

```powershell
cargo test -p ipc-contract -p settings-core -p history-core -p voice-core
```

Expected:

```text
PASS
```

- [ ] **Step 7: Commit**

```bash
git add voice-app/crates
git commit -m "feat(voice-app): 建立核心 rust crate 边界与基础模型"
```

## Task 5: Scaffold The Tauri Runtime And Basic Commands

**Files:**
- Create: `voice-app/apps/desktop/src-tauri/Cargo.toml`
- Create: `voice-app/apps/desktop/src-tauri/build.rs`
- Create: `voice-app/apps/desktop/src-tauri/tauri.conf.json`
- Create: `voice-app/apps/desktop/src-tauri/capabilities/default.json`
- Create: `voice-app/apps/desktop/src-tauri/src/main.rs`
- Create: `voice-app/apps/desktop/src-tauri/src/lib.rs`
- Create: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Create: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Create: `voice-app/apps/desktop/src-tauri/src/windowing.rs`

- [ ] **Step 1: Create the Tauri crate manifest**

`voice-app/apps/desktop/src-tauri/Cargo.toml` must include:

```toml
[package]
name = "voice-app-desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
ipc-contract = { path = "../../../crates/ipc-contract" }
settings-core = { path = "../../../crates/settings-core" }
history-core = { path = "../../../crates/history-core" }
logging-core = { path = "../../../crates/logging-core" }
voice-core = { path = "../../../crates/voice-core" }
platform-core = { path = "../../../crates/platform-core" }
automation-core = { path = "../../../crates/automation-core" }
asr-core = { path = "../../../crates/asr-core" }
```

- [ ] **Step 2: Implement minimal commands and state**

`commands.rs` should expose at least:

```rust
use ipc_contract::RuntimeSnapshot;

#[tauri::command]
pub fn get_runtime_snapshot() -> RuntimeSnapshot {
    RuntimeSnapshot::default()
}

#[tauri::command]
pub fn get_app_mode() -> String {
    "background-agent".to_string()
}
```

- [ ] **Step 3: Wire the runtime into Tauri**

`src/lib.rs` should register commands and build the app:

```rust
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::get_runtime_snapshot,
            commands::get_app_mode
        ])
        .run(tauri::generate_context!())
        .expect("failed to run voice-app desktop");
}
```

- [ ] **Step 4: Run Rust runtime verification**

Run:

```powershell
cargo test -p ipc-contract
cargo check -p voice-app-desktop
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

```bash
git add voice-app/apps/desktop/src-tauri
git commit -m "feat(voice-app): 初始化 tauri runtime 与基础命令"
```

## Task 6: Wire The Frontend To Runtime Snapshot And Background-Agent Mode

**Files:**
- Create: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/App.tsx`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Extend the failing frontend test**

Add:

```tsx
it('shows background-agent mode from tauri runtime', async () => {
  render(<App />)
  expect(await screen.findByText(/background-agent/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Create a single frontend bridge**

`voice-app/apps/desktop/src/lib/tauri.ts`:

```ts
import { invoke } from '@tauri-apps/api/core'

export async function getRuntimeSnapshot() {
  return invoke('get_runtime_snapshot')
}

export async function getAppMode() {
  return invoke<string>('get_app_mode')
}
```

- [ ] **Step 3: Mock Tauri invoke in the frontend test environment**

Extend `voice-app/apps/desktop/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (command: string) => {
    if (command === 'get_app_mode') return 'background-agent'
    if (command === 'get_runtime_snapshot') return { phase: 'idle' }
    return null
  }),
}))
```

- [ ] **Step 4: Implement runtime status UI**

`RuntimeStatus.tsx` should:

```tsx
import { useEffect, useState } from 'react'
import { getAppMode } from '../../lib/tauri'

export function RuntimeStatus() {
  const [mode, setMode] = useState('loading')

  useEffect(() => {
    void getAppMode().then(setMode)
  }, [])

  return (
    <section>
      <h2>Runtime</h2>
      <p>{mode}</p>
    </section>
  )
}
```

- [ ] **Step 5: Run frontend tests again**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

```bash
git add voice-app/apps/desktop/src
git commit -m "feat(voice-app): 接入 tauri runtime 状态展示"
```

## Task 7: Populate The Migration Docs With The Legacy Project Inventory

**Files:**
- Modify: `voice-app/docs/migration/feature-inventory.md`
- Modify: `voice-app/docs/migration/electron-capability-map.md`
- Modify: `voice-app/docs/migration/target-architecture.md`
- Modify: `voice-app/docs/migration/migration-plan.md`

- [ ] **Step 1: Fill `feature-inventory.md` with concrete legacy modules**

Must enumerate at least:

```md
- src/main/main.ts
- src/main/global-keyboard-hook.ts
- src/main/typeless-overlay.ts
- src/main/typeless-chat-result.ts
- src/preload/index.ts
- src/renderer/hooks/useVoiceController.ts
- src/renderer/packages/voice/asr/*
- src/main/mcp/ipc-stdio-transport.ts
- voice-app/skill-bundles/angrymiao-voice-control
```

- [ ] **Step 2: Fill `electron-capability-map.md` with explicit old/new mappings**

Must include a table with rows for:

1. tray
2. deep link
3. global hotkey
4. low-level keyboard hook
5. overlay window
6. result window
7. store/blob/logging
8. MCP stdio

- [ ] **Step 3: Fill `target-architecture.md` with the new module map**

Must include sections:

```md
## apps/desktop
## crates/voice-core
## crates/automation-core
## crates/asr-core
## crates/history-core
## crates/settings-core
```

- [ ] **Step 4: Fill `migration-plan.md` with phased milestones**

Must include milestones:

1. Foundation
2. Runtime & automation
3. ASR + LLM + MCP loop
4. History/settings polish

- [ ] **Step 5: Verify docs are present and non-empty**

Run:

```powershell
Get-Item voice-app/docs/migration/*.md | Select-Object Name,Length
```

Expected:

```text
Length > 0 for all 4 files
```

- [ ] **Step 6: Commit**

```bash
git add voice-app/docs/migration
git commit -m "docs(voice-app): 补全迁移文档与能力映射"
```

## Task 8: Run Final Foundation Verification

**Files:**
- Verify only

- [ ] **Step 1: Run Rust workspace tests**

Run:

```powershell
cargo test
```

Expected:

```text
PASS
```

- [ ] **Step 2: Run frontend tests**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test
```

Expected:

```text
PASS
```

- [ ] **Step 3: Run frontend build**

Run:

```powershell
pnpm --dir voice-app/apps/desktop build
```

Expected:

```text
vite build completed successfully
```

- [ ] **Step 4: Run workspace status check**

Run:

```powershell
git status --short
```

Expected:

```text
isolated worktree clean
```

## Notes For Execution

- 本计划完成后，`voice-app/` 应该已经具备可继续开发的工程入口，但**并不等于产品可用**。
- 下一个实施计划必须聚焦 `automation-core + asr-core + voice-core`，将热键、录音、overlay、权限、文本插入纳入 Rust 热路径。
- 在没有完成下一份计划之前，不要声称已经实现 Typeless 风格完整闭环。
- 若 `cargo` 安装失败或 Tauri prerequisites 不完整，应先解决环境问题，再继续创建工程文件。
