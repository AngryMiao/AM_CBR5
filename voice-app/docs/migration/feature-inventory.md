# Feature Inventory

## Purpose

Track which legacy Typeless and Electron-era features move into the new `voice-app/` foundation and in which phase they should land.

## Inputs From Legacy Project

- Existing Electron main-process modules and renderer voice flows.
- Current migration plan for the Rust-first `voice-app/` baseline.

## Decisions

- Use this document as the phase-by-phase inventory for follow-up migration tasks.
- Keep the foundation phase focused on structure and documentation, not runtime feature parity.

## Open Questions

- Which legacy voice paths can be retired immediately after the first Tauri shell is stable?
- Which capabilities require native Rust implementations before any UI migration continues?

## Phase 1

- Create the `voice-app/` root workspace.
- Establish migration documentation and root-level workspace manifests.

## Phase 2

- Add the background runtime shell and native automation boundaries.
- Introduce the first Tauri desktop surfaces for runtime visibility and debugging.

## Phase 3

- Migrate ASR, LLM, MCP, and persistence flows into the Rust-first architecture.
- Refine history and settings UX after core runtime parity exists.

## Not Migrating

- A chatbox-style home screen or chat-first primary route.
- Electron preload conventions and `window.electronAPI`-style bridges.
