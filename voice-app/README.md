# Voice App Workspace

This directory is the foundation workspace for the Rust-first voice agent migration.

## Scope

- Own the new `voice-app/` project root.
- Keep the desktop shell limited to history, settings, logs, and runtime surfaces.
- Prepare Rust workspace boundaries for later tasks without initializing app or crate contents yet.

## Workspace Layout

- `apps/desktop/`: reserved for the future Tauri desktop shell.
- `crates/`: reserved for future Rust core crates.
- `docs/migration/`: migration inventory, capability mapping, architecture notes, and phased plan.
- `tools/` and `scripts/`: reserved for follow-up automation work.

## Current Status

This task only creates the root workspace skeleton and migration document placeholders. Desktop app code, Tauri runtime code, and Rust crate implementations are intentionally deferred to later tasks.
