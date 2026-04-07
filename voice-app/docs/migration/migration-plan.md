# Migration Plan

## Purpose

Define the staged execution order for moving from the legacy Electron application to the new `voice-app/` workspace.

## Inputs From Legacy Project

- Legacy Typeless application structure and capability inventory.
- Foundation implementation plan dated 2026-04-04.

## Decisions

- Keep the migration incremental and phase-gated.
- Require workspace and documentation foundations before desktop shell or Rust runtime implementation.

## Open Questions

- Which acceptance checks should gate each migration phase?
- What is the earliest point where the legacy Electron path can be placed in maintenance mode?

## Milestones

### 1. Foundation

- Status target:
  - `voice-app/` workspace exists
  - desktop shell exists without chatbox home
  - Rust crate boundaries exist
  - migration documents are populated
- Acceptance gate:
  - frontend test/build pass
  - Rust baseline compiles where host prerequisites are available
- Deliverables:
  - root workspace manifests
  - `apps/desktop`
  - `src-tauri`
  - core crates skeletons

### 2. Runtime & automation

- Scope:
  - move hotkey,长按生命周期、overlay 和 result window into Rust-owned runtime.
- Current state:
  - 全局热键、托盘、关闭到后台、主窗口显隐切换已落地
  - overlay / result 原生窗口已独立，且按工作区重新定位
- Legacy references:
  - `src/main/global-keyboard-hook.ts`
  - `src/main/typeless-overlay.ts`
  - `src/main/typeless-chat-result.ts`
  - `src/main/voice-runtime-window.ts`
- Acceptance gate:
  - holding the configured hotkey starts a native runtime task
  - overlay and result windows are controlled without renderer ownership
  - tray and close-to-background behavior stay renderer-independent

### 3. Doubao ASR + OpenAI-compatible LLM loop

- Scope:
  - move recording, transcript production, and OpenAI-compatible generation into Rust-first architecture.
- Legacy references:
  - `src/renderer/hooks/useVoiceController.ts`
  - `src/renderer/packages/voice/asr/*`
- Acceptance gate:
  - release hotkey after speaking triggers ASR
  - runtime can execute one supported OpenAI-compatible LLM flow
  - transcript/result are persisted into history and surfaced in runtime/result windows

### 4. History/settings polish

- Scope:
  - refine history, settings, logs, and built-in MCP/skill-bundle entry driven by Rust-owned state.
- Acceptance gate:
  - history shows completed tasks and outputs
  - settings edits persist through Rust-owned schema
  - settings save includes structural validation, and runtime sync failures surface warnings without blocking `settings.json`
  - settings can configure内置 AngryMiao skill runtime、键盘驱动路径与快捷键映射
  - logs panel can inspect recent runtime diagnostics

## Risks

- If Phase 2 is skipped, Tauri becomes only a lighter Electron shell and the hot path stays in WebView code.
- If `useVoiceController.ts` is ported wholesale instead of decomposed, the new architecture will keep renderer-era coupling.
- If runtime sync warnings are swallowed after settings save, users will not know hotkey / MCP / auto-launch changed in `settings.json` but failed to hot-apply immediately.

## Validation Strategy

- Foundation:
  - `pnpm --dir voice-app/apps/desktop test`
  - `pnpm --dir voice-app/apps/desktop build`
  - `cargo test` / `cargo check` when host toolchain exists
- Runtime & automation:
  - native smoke tests for hotkey, overlay, result window, and tray behavior
- Doubao ASR + OpenAI-compatible LLM loop:
  - end-to-end transcript -> result regression scenario
- History/settings polish:
  - UI regression tests plus persistence smoke tests
