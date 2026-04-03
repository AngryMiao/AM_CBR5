# Target Architecture

## Purpose

Describe the intended top-level module layout for the new `voice-app/` workspace before implementation begins.

## Inputs From Legacy Project

- Existing Electron renderer and main-process separation.
- Planned Rust-first voice runtime boundaries from the foundation plan.

## Decisions

- Keep UI responsibilities inside the desktop shell and move core runtime logic into Rust crates.
- Preserve a background-agent-first product shape with support panels instead of a chat-first surface.

## Open Questions

- Which modules need shared data contracts first to avoid circular dependencies later?
- Where should persistence adapters live once SQLite and JSON placeholders become real implementations?
