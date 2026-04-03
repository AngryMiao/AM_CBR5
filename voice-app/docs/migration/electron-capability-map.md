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
