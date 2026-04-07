# Electron Capability Map

## Purpose

Capture how legacy Electron capabilities will be translated into the new Tauri and Rust-first architecture.

## Inputs From Legacy Project

- Electron main-process integrations for tray, windows, keyboard hooks, and persistence.
- Planned `voice-app/` module boundaries for desktop shell and Rust core crates.

## Decisions

- Capability migration will be documented before implementation to avoid reusing Electron-only assumptions.
- New runtime bridges should be Tauri command based rather than preload globals.

## Open Questions

- Which low-level capabilities can be handled directly by Tauri plugins and which need custom Rust crates?
- How should platform-specific automation permissions be staged across Windows-first rollout tasks?

## Capability Mapping

| Legacy capability | Legacy source | New owner | Phase | Notes |
| --- | --- | --- | --- | --- |
| tray | `src/main/main.ts`, `src/main/menu.ts` | `apps/desktop/src-tauri` + `platform-core` | Phase 2 | 已具备托盘菜单、左键/双击切换主窗口、关闭主窗口后隐藏到后台。 |
| deep link | `src/main/main.ts`, `src/main/deeplinks.ts` | `apps/desktop/src-tauri` + `platform-core` | Phase 2 | Shell receives OS entry, forwards normalized intent to Rust runtime. |
| global hotkey | `src/main/main.ts`, `src/main/hotkey-dispatch.ts` | `crates/automation-core` | Phase 2 | Register global hotkey outside WebView hot path. |
| low-level keyboard hook | `src/main/global-keyboard-hook.ts` | `crates/automation-core` | Phase 2 | Long-press semantics and original-input suppression stay native. |
| overlay window | `src/main/typeless-overlay.ts` | `crates/automation-core` + `apps/desktop/src-tauri` | Phase 2 | 已由 Rust/Tauri 控制显隐、工作区定位与识别阶段自动隐藏。 |
| result window | `src/main/typeless-chat-result.ts` | `crates/automation-core` + `apps/desktop/src-tauri` | Phase 2 | 已保留独立结果窗，并按当前工作区中央定位。 |
| store/blob/logging | `src/main/store-node.ts`, `src/main/log-text.ts`, renderer storage adapters | `crates/settings-core`, `crates/history-core`, `crates/logging-core` | Phase 3 | Use Rust-owned persistence contracts; SQLite/JSON backend can evolve later. |
| MCP stdio | `src/main/mcp/ipc-stdio-transport.ts` | `crates/mcp-core` | Phase 4 | stdio transport、initialize/tools/list/tools/call 已完成，并已接入 voice 主链、设置 UI 与内置 AngryMiao runtime。 |

## Preload Replacement

- Legacy preload:
  - `src/preload/index.ts`
  - `src/shared/electron-types.ts`
- Replacement strategy:
  - Tauri commands for request/response calls
  - Tauri events for runtime push notifications
  - `crates/ipc-contract` for typed payloads
- Explicit non-goal:
  - no `window.electronAPI`
  - no Electron preload compatibility layer inside `voice-app`

## Migration Notes

- `src/main/main.ts` currently concentrates too many domains: app shell, permissions, windowing, persistence, voice bootstrap.
- Migration should split by ownership rather than porting file-for-file.
- Phase 2 focuses on native automation parity first; Phase 3 pulls ASR/LLM/history flows into Rust-owned modules.
- MCP 已不再是“后续再说”的 parked slice；通用 skill bundle 清单/读取/UI 入口、安装能力以及 MCP/runtime/键盘驱动运行态诊断已经接通，当前剩余的是更细的系统控制体验收口。
