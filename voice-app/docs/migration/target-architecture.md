# Target Architecture

## Purpose

Describe the intended top-level module layout for the new `voice-app/` workspace before implementation begins.

## Inputs From Legacy Project

- Existing Electron renderer and main-process separation.
- Planned Rust-first voice runtime boundaries from the foundation plan.

## Decisions

- Keep UI responsibilities inside the desktop shell and move core runtime logic into Rust crates.
- Preserve a background-resident product shape with support panels instead of a chat-first surface.

## Open Questions

- Which modules need shared data contracts first to avoid circular dependencies later?
- Where should persistence adapters live once SQLite and JSON placeholders become real implementations?

## apps/desktop

- Owns the Tauri shell, not the voice hot path.
- Surfaces:
  - History panel
  - Settings panel
  - Logs panel
  - Runtime/debug panel
- Responsibilities:
  - invoke Rust commands
  - subscribe to runtime events
  - host shell-only windows and native menu/tray affordances
- Non-responsibilities:
  - no chatbox home
  - no long-press lifecycle ownership
  - no renderer-owned ASR/LLM loop

## crates/ipc-contract

- Owns shared payloads between Tauri frontend and Rust runtime.
- First payloads:
  - runtime snapshot
  - future history summary / settings summary events
- Goal:
  - replace ad-hoc preload bridge types with Rust-owned contracts.

## crates/voice-core

- Owns the voice task state machine.
- Responsibilities:
  - task lifecycle: idle -> listening -> processing -> generating -> done/error
  - transcript/result state
  - orchestration across ASR, LLM, history persistence
- Depends on:
  - `asr-core`
  - `automation-core`
  - `history-core`
  - `logging-core`
  - `settings-core`

## crates/automation-core

- Owns system-level interaction and window behavior.
- Responsibilities:
  - global hotkey
  - overlay window lifecycle
  - result window lifecycle
  - tray / menu 触发的主窗口显隐收口
- Legacy references:
  - `global-keyboard-hook.ts`
  - `typeless-overlay.ts`
  - `typeless-chat-result.ts`

## crates/asr-core

- Owns microphone capture and ASR provider orchestration.
- Responsibilities:
  - audio session lifecycle
  - streaming transcript production
  - 豆包 ASR 配置解析与会话管理
- Legacy references:
  - `src/renderer/packages/voice/asr/*`
  - recorder/provider logic currently triggered from `useVoiceController.ts`

## crates/history-core

- Owns persisted execution history for voice tasks.
- Responsibilities:
  - transcript/result records
  - history query models for UI
  - future replay/retry metadata
- UI reads from this crate through Tauri commands/events rather than owning business state locally.

## crates/settings-core

- Owns versioned settings schema and defaults.
- Responsibilities:
  - hotkey behavior
  - 豆包 ASR 配置
  - OpenAI-compatible LLM 配置
  - AngryMiao 键盘驱动路径与快捷键映射
  - 保存前结构校验与迁移
- Goal:
  - move settings defaults and migrations out of Electron store glue.

## Supporting Crates

- `crates/platform-core`
  - platform capability detection, permission checks, OS-specific branching.
- `crates/logging-core`
  - structured runtime logs, export/cleanup primitives.
- `crates/mcp-core`
  - stdio MCP transport, tool discovery, tool call execution.
  - current main chain already uses it for OpenAI-compatible tool call -> MCP runtime execution.

## Data Flow

```text
Global hotkey / low-level hook
  -> automation-core
  -> voice-core starts task
  -> asr-core captures + transcribes
  -> voice-core coordinates OpenAI-compatible LLM generation
  -> settings-core 提供快捷键映射与 MCP/skill 开关
  -> result window + history persistence
  -> history-core persists record
  -> apps/desktop reads snapshot/history/settings through ipc-contract
```

## Window Model

- Main shell window:
  - history/settings/logs/runtime only
- Overlay window:
  - ephemeral status, native lifecycle
- Result window:
  - final transcript/result preview, native lifecycle
- Hidden/background runtime:
  - managed by Tauri/Rust runtime, not by a renderer route
