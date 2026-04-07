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

- Create the `voice-app/` root workspace and manifests.
- Keep the desktop shell limited to `History`, `Settings`, `Logs`, and `Runtime`.
- Establish the first Rust crate boundaries:
  - `crates/ipc-contract`
  - `crates/settings-core`
  - `crates/history-core`
  - `crates/logging-core`
  - `crates/voice-core`
  - `crates/platform-core`
  - `crates/automation-core`
  - `crates/asr-core`
- Replace preload-first thinking with `ipc-contract + tauri commands/events`.
- Do not migrate any chatbox route or chat-first renderer entry.

## Phase 2

- Background runtime and native automation parity with the old Electron main process.
- 当前已完成：
  - 托盘 + 主窗口隐藏到后台
  - 托盘左键 / 双击切换主窗口显隐
  - overlay / result 独立窗口与工作区定位
  - `正在识别` 阶段 overlay 自动隐藏收口
- Legacy modules to inventory and remap:
  - `src/main/main.ts`
    - Owns tray, deep link, permissions, settings IPC, runtime dispatch, window lifecycle.
    - New split target: `apps/desktop/src-tauri` for app shell wiring, `platform-core` for platform checks, `settings-core/history-core/logging-core` for persistence, `automation-core` for hotkey/input hooks.
  - `src/main/global-keyboard-hook.ts`
    - Owns global hotkey, low-level key tracking, long-press behavior, overlay triggers.
    - New target: `crates/automation-core`.
  - `src/main/typeless-overlay.ts`
    - Owns transparent overlay window and state transitions.
    - New target: `crates/automation-core` with Tauri-managed overlay window creation.
  - `src/main/typeless-chat-result.ts`
    - Owns result window and close/restore behavior.
    - New target: `crates/automation-core` plus `apps/desktop/src-tauri` window registration.
  - `src/main/voice-runtime-window.ts`
    - Owns hidden voice runtime window bootstrap.
    - New target: background runtime managed by `apps/desktop/src-tauri` and Rust core.
  - `src/preload/index.ts`
    - Owns `window.electronAPI` bridge.
    - New target: delete preload contract, replace with `ipc-contract` and Tauri `invoke`/events.

## Phase 3

- Migrate 豆包 ASR、OpenAI-compatible LLM 和 session orchestration out of the renderer hot path.
- 当前已完成：
  - 豆包流式 ASR 主链
  - OpenAI-compatible LLM 主链
  - LLM -> 本地工具 / MCP 工具执行闭环
- Legacy modules to inventory and remap:
  - `src/renderer/hooks/useVoiceController.ts`
    - Current hot path owner for recording, ASR, typeless request lifecycle, overlay/result state, permissions, session switching.
    - New split target: `voice-core` owns state machine, `asr-core` owns recording/豆包会话 orchestration, `apps/desktop` only shows status/history/settings.
  - `src/renderer/packages/voice/asr/*`
    - Providers:
      - `aliyun.ts`
      - `azure.ts`
      - `doubao.ts`
      - `funasr-local.ts`
      - `google.ts`
      - `openai.ts`
      - `whisper-local.ts`
    - New target: `crates/asr-core`, but当前只保留豆包流式 ASR，不再追求 provider 全量迁移。
  - `src/renderer/packages/voice/angrymiao-session.ts`
    - Current session bootstrap for the dedicated voice workflow.
    - New target: history/session model moves into `history-core` plus runtime-owned execution context.
- Refine history and settings UX after core runtime parity exists.

## Phase 4

- Start MCP runtime foundation in Rust before wiring it into the voice hot path.
- 当前已完成：
  - `mcp-core` stdio runtime 主链接入
  - 内置 AngryMiao system-control runtime 接入
  - `settings.json` 中的 `keyboard_shortcuts` 已进入设置页、持久化和 LLM 提示链路
  - AngryMiao skill bundle 的 `SKILL.md` / HID 参考已进入 Rust 侧系统提示拼装
  - 通用 skill bundle manifest 列表、prompt 文本读取、runtime 环境解析与设置页清单入口已接通
- Legacy modules to inventory and remap:
  - `src/main/mcp/ipc-stdio-transport.ts`
    - Owns Electron-side stdio transport bridge for MCP clients.
    - New target: `crates/mcp-core` for stdio transport, lifecycle handshake, and tool discovery.
  - `src/main/skill-bundles.ts`
    - Owns bundle manifest parsing and skill runtime -> MCP server config resolution.
    - New target: future `voice-app` skill bundle support, but not part of the first `mcp-core` runtime batch.
- Integration order:
  - `mcp-core` runtime foundation 已完成
  - settings persistence / desktop UI entry 已接通
  - `llm-core` / `AppState` tool-call integration 已进入主链
  - MCP runtime / AngryMiao 键盘驱动 / skill bundle 运行态诊断已进入“运行状态”面板
  - 本地 skill bundle 安装能力已接入设置页
  - 剩余收口点主要是更细的工具/USB 控制体验

## Not Migrating

- A chatbox-style home screen or chat-first primary route.
- Electron preload conventions and `window.electronAPI`-style bridges.
- Web/mobile build pipelines that only exist for the legacy Electron-centric product shape.
- Renderer-owned hotkey, overlay, and recording lifecycle once Rust runtime parity exists.
- TTS 不作为当前阶段交付范围。
- 旧 Electron 里的多 provider ASR/TTS 配置面板不再原样迁移。
