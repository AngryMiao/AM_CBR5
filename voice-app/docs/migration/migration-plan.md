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
