# Typeless Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `chatbox` 主窗口可以被销毁，但 `typeless` 仍然能在后台完整完成 `长按录音 -> 极简 UI -> ASR -> LLM -> MCP -> result`。

**Architecture:** 采用“主进程后台 daemon + 隐藏 voice worker window + 主聊天窗口观察者化”的结构。`main` 进程接管 typeless 状态机、ASR 调度、LLM/MCP 编排；隐藏 worker 只负责麦克风采集与浏览器依赖能力；主聊天窗口可以销毁并重建，但不再拥有 typeless 主流程。

**Tech Stack:** TypeScript, Electron, BrowserWindow, Electron IPC, React, Vitest, existing store-based persistence, existing model adapters

---

## File Structure

- Create: `src/main/typeless-daemon/typeless-state-machine.ts`
  - 纯状态机与 operation 生命周期管理
- Create: `src/main/typeless-daemon/runtime-snapshot.ts`
  - 定义后台 typeless snapshot 结构与序列化
- Create: `src/main/typeless-daemon/voice-worker-ipc.ts`
  - `main <-> worker` 录音 / whisper IPC 协议常量与类型
- Create: `src/main/typeless-daemon/voice-worker-window.ts`
  - 隐藏 worker 窗口生命周期管理
- Create: `src/main/typeless-daemon/session-repository.ts`
  - 主进程侧 session/message CRUD
- Create: `src/main/typeless-daemon/main-mcp-controller.ts`
  - 从 renderer 迁出的 MCP server 生命周期与 tool set 组装
- Create: `src/main/typeless-daemon/asr-executor.ts`
  - 按 provider 路由到 `main` 执行或 worker 执行
- Create: `src/main/typeless-daemon/generation-runner.ts`
  - 主进程侧 `submit -> generate -> streamText -> tools`
- Create: `src/main/typeless-daemon/typeless-daemon.ts`
  - 后台 typeless 总控，驱动热键、录音、ASR、LLM、MCP、结果
- Create: `src/main/typeless-daemon/__tests__/typeless-state-machine.test.ts`
  - 状态机定向测试
- Create: `src/main/typeless-daemon/__tests__/asr-executor.test.ts`
  - provider 路由测试
- Create: `src/main/typeless-daemon/__tests__/session-repository.test.ts`
  - repository 基础行为测试
- Create: `src/main/typeless-daemon/__tests__/typeless-daemon.test.ts`
  - daemon 集成行为测试
- Create: `src/preload/voice-worker.ts`
  - voice worker preload 暴露最小录音 API
- Create: `src/renderer/voice-worker/index.ts`
  - worker renderer 入口
- Create: `src/renderer/voice-worker/worker-recorder.ts`
  - 基于现有 `VoiceRecorder` 抽取的 worker 录音能力
- Create: `src/renderer/voice-worker/worker-whisper-local.ts`
  - worker 侧 `whisper-local` 执行器
- Modify: `src/main/main.ts`
  - 初始化 typeless daemon、worker、MCP；主窗口销毁后不影响 daemon
- Modify: `src/main/global-keyboard-hook.ts`
  - 不再向主聊天窗口派发 typeless 热键事件，改为直接通知 daemon
- Modify: `src/main/typeless-overlay.ts`
  - 接入 daemon snapshot，支持更稳定的后台更新
- Modify: `src/main/typeless-chat-result.ts`
  - 允许完全脱离主聊天窗口展示结果
- Modify: `src/preload/index.ts`
  - 暴露 `typeless:getRuntimeSnapshot` 与订阅事件给聊天窗口
- Modify: `src/shared/electron-types.ts`
  - 增加 worker IPC、daemon snapshot、后台 typeless 事件类型
- Modify: `src/renderer/hooks/useVoiceController.ts`
  - 去掉 typeless 主流程 owner 身份，只保留 Chat 模式与 UI 同步能力
- Modify: `src/renderer/routes/__root.tsx`
  - 改为订阅后台 typeless 状态，而不是启动 typeless 主链路
- Modify: `src/renderer/packages/voice/asr/index.ts`
  - 抽出可在 main/worker 复用的 provider 边界
- Modify: `src/renderer/packages/voice/asr/openai.ts`
- Modify: `src/renderer/packages/voice/asr/azure.ts`
- Modify: `src/renderer/packages/voice/asr/google.ts`
- Modify: `src/renderer/packages/voice/asr/aliyun.ts`
- Modify: `src/renderer/packages/voice/asr/funasr-local.ts`
  - 让这些 provider 脱离 `window` 依赖，可在 main 复用
- Modify: `src/renderer/packages/voice/asr/whisper-local.ts`
  - 限定只在 worker 中使用
- Modify: `src/renderer/packages/voice/angrymiao-session.ts`
  - 抽出纯会话创建逻辑供 main repository 复用
- Modify: `src/renderer/stores/session/messages.ts`
  - 拆出纯提交逻辑，减少 renderer store 耦合
- Modify: `src/renderer/packages/model-calls/stream-text.ts`
  - 抽出主进程可复用 core
- Modify: `src/renderer/packages/mcp/controller.ts`
  - 提取共享逻辑并迁移主实现到 main
- Modify: `src/renderer/hooks/useVoiceController.test.tsx`
  - 去掉 typeless 主流程假设，保留 UI 观察者测试

## Constraints

- 本计划按阶段推进，每一阶段结束都必须能独立验证。
- `whisper-local` 本轮不要求纯主进程化，仍然由 worker 承接。
- 主聊天窗口可以被销毁，但应用本身不能退出；typeless daemon 仅在 `app.quit` 时销毁。
- 若主进程生成链路迁移过程中发现 renderer 依赖太深，优先抽纯服务层，不要用 IPC 回调 renderer 继续执行。
- 当前会话未获显式子代理授权，计划文档不使用 reviewer subagent，改为当前会话内人工复核。

## Task 1: Lock The Background Runtime Contract With Failing Tests

**Files:**
- Create: `src/main/typeless-daemon/__tests__/typeless-state-machine.test.ts`
- Create: `src/main/typeless-daemon/__tests__/asr-executor.test.ts`
- Create: `src/main/typeless-daemon/__tests__/session-repository.test.ts`
- Create: `src/main/typeless-daemon/__tests__/typeless-daemon.test.ts`

- [ ] **Step 1: Write the failing state machine tests**

在 `src/main/typeless-daemon/__tests__/typeless-state-machine.test.ts` 新增测试，覆盖：

```ts
it('moves from idle to recording to asr to llm to mcp to result', () => {})
it('cancels a short press before asr starts', () => {})
it('restarts the current round when hotkey is pressed during llm', () => {})
```

- [ ] **Step 2: Write the failing provider routing tests**

在 `src/main/typeless-daemon/__tests__/asr-executor.test.ts` 新增测试，验证：

```ts
it('routes openai/funasr/google/azure/aliyun/doubao to main execution', () => {})
it('routes whisper-local to worker execution', () => {})
```

- [ ] **Step 3: Write the failing session repository tests**

在 `src/main/typeless-daemon/__tests__/session-repository.test.ts` 新增测试，验证：

```ts
it('creates or reuses the angrymiao singleton session', async () => {})
it('inserts user and assistant placeholder messages in order', async () => {})
```

- [ ] **Step 4: Write the failing daemon integration test**

在 `src/main/typeless-daemon/__tests__/typeless-daemon.test.ts` 新增测试，验证：

```ts
it('continues typeless flow after the main chat window is destroyed', async () => {})
```

关键断言：

- 热键开始后会命令 worker 录音
- 停止后会进入 ASR
- 拿到 transcript 后进入 LLM
- tool call 时进入 MCP
- 最终进入 result

- [ ] **Step 5: Run the targeted tests to verify RED**

Run:

```bash
pnpm exec vitest run src/main/typeless-daemon/__tests__/typeless-state-machine.test.ts src/main/typeless-daemon/__tests__/asr-executor.test.ts src/main/typeless-daemon/__tests__/session-repository.test.ts src/main/typeless-daemon/__tests__/typeless-daemon.test.ts
```

Expected:

```text
FAIL because typeless daemon modules do not exist yet
```

## Task 2: Create The Typeless State Machine And Runtime Snapshot

**Files:**
- Create: `src/main/typeless-daemon/typeless-state-machine.ts`
- Create: `src/main/typeless-daemon/runtime-snapshot.ts`
- Create: `src/main/typeless-daemon/__tests__/typeless-state-machine.test.ts`

- [ ] **Step 1: Implement runtime snapshot types**

在 `src/main/typeless-daemon/runtime-snapshot.ts` 定义：

```ts
export type TypelessDaemonPhase = 'idle' | 'recording' | 'asr' | 'llm' | 'mcp' | 'result' | 'error'

export interface TypelessRuntimeSnapshot {
  phase: TypelessDaemonPhase
  sessionId?: string
  userMessageId?: string
  asrText?: string
  streamingText?: string
  activeToolName?: string
  replyText?: string
  startedAt?: number
  errorMessage?: string
}
```

- [ ] **Step 2: Implement the state machine**

在 `src/main/typeless-daemon/typeless-state-machine.ts` 实现：

```ts
createTypelessStateMachine({
  onSnapshotChange,
})
```

至少提供：

- `beginRecording()`
- `setStreamingText(text)`
- `startAsr()`
- `startLlm(context)`
- `startMcp(toolName)`
- `completeResult(payload)`
- `fail(message)`
- `cancel()`
- `getSnapshot()`

- [ ] **Step 3: Make the state machine tests pass**

Run:

```bash
pnpm exec vitest run src/main/typeless-daemon/__tests__/typeless-state-machine.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/main/typeless-daemon/runtime-snapshot.ts src/main/typeless-daemon/typeless-state-machine.ts src/main/typeless-daemon/__tests__/typeless-state-machine.test.ts
git commit -m "feat(voice): 添加 typeless 后台状态机"
```

## Task 3: Introduce The Hidden Voice Worker Window

**Files:**
- Create: `src/main/typeless-daemon/voice-worker-ipc.ts`
- Create: `src/main/typeless-daemon/voice-worker-window.ts`
- Create: `src/preload/voice-worker.ts`
- Create: `src/renderer/voice-worker/index.ts`
- Create: `src/renderer/voice-worker/worker-recorder.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Define the worker IPC contract**

在 `src/main/typeless-daemon/voice-worker-ipc.ts` 定义：

```ts
export type VoiceWorkerCommand =
  | { type: 'start-recording'; microphoneDeviceId?: string }
  | { type: 'stop-recording' }
  | { type: 'cancel-recording' }
  | { type: 'run-whisper-transcribe'; requestId: string; audioBuffer: Uint8Array }
```

以及对应结果事件类型：

```ts
export type VoiceWorkerEvent =
  | { type: 'audio-level'; level: number }
  | { type: 'recording-stopped'; audioBuffer: Uint8Array; mimeType: string }
  | { type: 'recording-failed'; message: string }
  | { type: 'whisper-result'; requestId: string; text?: string; error?: string }
```

- [ ] **Step 2: Implement the hidden worker window manager**

在 `src/main/typeless-daemon/voice-worker-window.ts` 实现：

- `ensureVoiceWorkerWindow()`
- `destroyVoiceWorkerWindow()`
- `sendCommand()`
- `subscribe()`

要求：

- 窗口默认隐藏
- 崩溃后可重建
- 不参与主窗口关闭生命周期

- [ ] **Step 3: Implement worker preload and recorder**

在 `src/preload/voice-worker.ts` 暴露最小 API。  
在 `src/renderer/voice-worker/worker-recorder.ts` 复用现有 `VoiceRecorder` 逻辑，输出最终录音 `Blob/ArrayBuffer`。

- [ ] **Step 4: Wire the worker startup in main**

在 `src/main/main.ts` 中应用启动时初始化 worker manager，在 `before-quit` 时销毁。

- [ ] **Step 5: Run a focused smoke test**

Run:

```bash
pnpm exec vitest run src/main/typeless-daemon/__tests__/typeless-daemon.test.ts
```

Expected:

```text
仍然 FAIL，但失败点应从“模块不存在”收敛到“daemon 未接入 worker”
```

- [ ] **Step 6: Commit**

```bash
git add src/main/typeless-daemon/voice-worker-ipc.ts src/main/typeless-daemon/voice-worker-window.ts src/preload/voice-worker.ts src/renderer/voice-worker/index.ts src/renderer/voice-worker/worker-recorder.ts src/main/main.ts
git commit -m "feat(voice): 引入隐藏录音 worker 窗口"
```

## Task 4: Extract Session Repository For Main-Side Typeless Ownership

**Files:**
- Create: `src/main/typeless-daemon/session-repository.ts`
- Modify: `src/renderer/packages/voice/angrymiao-session.ts`
- Modify: `src/renderer/stores/session/messages.ts`
- Create: `src/main/typeless-daemon/__tests__/session-repository.test.ts`

- [ ] **Step 1: Extract the singleton session creation rules**

把 `angrymiao` session 的纯规则抽成主进程可复用函数，例如：

```ts
export function createAngrymiaoSessionDraft(): Omit<Session, 'id'> {}
export function normalizeAngrymiaoSession(session: Session): Session {}
```

这些函数不应依赖 renderer store。

- [ ] **Step 2: Implement the main-side repository**

在 `src/main/typeless-daemon/session-repository.ts` 实现：

- `ensureAngrymiaoSession({ purgeOthers?: boolean })`
- `insertMessage(sessionId, message)`
- `updateMessage(sessionId, messageId, updater)`
- `getSession(sessionId)`
- `getSessionSettings(sessionId)`

要求：

- 底层直接复用现有存储约定
- 不依赖 React Query

- [ ] **Step 3: Make the repository tests pass**

Run:

```bash
pnpm exec vitest run src/main/typeless-daemon/__tests__/session-repository.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/main/typeless-daemon/session-repository.ts src/renderer/packages/voice/angrymiao-session.ts src/renderer/stores/session/messages.ts src/main/typeless-daemon/__tests__/session-repository.test.ts
git commit -m "refactor(voice): 抽离 typeless 会话仓储"
```

## Task 5: Move MCP Control To Main

**Files:**
- Create: `src/main/typeless-daemon/main-mcp-controller.ts`
- Modify: `src/renderer/packages/mcp/controller.ts`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Extract MCP transport-agnostic logic**

从 renderer `mcpController` 中抽出共享逻辑：

- server config normalization
- status model
- tool name normalization

- [ ] **Step 2: Implement `main`-side MCP controller**

在 `src/main/typeless-daemon/main-mcp-controller.ts` 中实现：

- `bootstrap(serverConfigs)`
- `startServer(config)`
- `stopServer(id)`
- `updateServer(config)`
- `getAvailableTools(options?)`

要求：

- 行为与现有 renderer 版本保持一致
- tool set 可直接供 generation runner 使用

- [ ] **Step 3: Make `main` own MCP lifecycle**

在 `src/main/main.ts` 应用启动时初始化主进程 MCP controller。  
renderer 若仍需展示状态，后续改为订阅主进程快照。

- [ ] **Step 4: Add or update focused tests**

若现有 renderer MCP 测试可复用，则迁移；否则新增最小测试，验证：

```ts
it('returns available tools from running servers in main', async () => {})
```

- [ ] **Step 5: Commit**

```bash
git add src/main/typeless-daemon/main-mcp-controller.ts src/renderer/packages/mcp/controller.ts src/main/main.ts
git commit -m "refactor(mcp): 迁移后台工具控制到主进程"
```

## Task 6: Implement Main-Side ASR Executor

**Files:**
- Create: `src/main/typeless-daemon/asr-executor.ts`
- Modify: `src/renderer/packages/voice/asr/index.ts`
- Modify: `src/renderer/packages/voice/asr/openai.ts`
- Modify: `src/renderer/packages/voice/asr/azure.ts`
- Modify: `src/renderer/packages/voice/asr/google.ts`
- Modify: `src/renderer/packages/voice/asr/aliyun.ts`
- Modify: `src/renderer/packages/voice/asr/funasr-local.ts`
- Modify: `src/renderer/packages/voice/asr/whisper-local.ts`
- Create: `src/main/typeless-daemon/__tests__/asr-executor.test.ts`

- [ ] **Step 1: Remove renderer-only assumptions from fetch-based providers**

让这些 provider 可在 `main` 复用，避免显式依赖：

- `window`
- DOM-only types
- browser-only globals unless Node 20 等价可用

- [ ] **Step 2: Implement the executor routing**

在 `src/main/typeless-daemon/asr-executor.ts` 中实现：

```ts
executeAsr({
  provider,
  settings,
  audioBuffer,
  workerBridge,
}): Promise<{ text: string }>
```

路由规则：

- `whisper-local` -> worker
- `doubao/openai/azure/google/aliyun/funasr-local` -> main

- [ ] **Step 3: Make the executor tests pass**

Run:

```bash
pnpm exec vitest run src/main/typeless-daemon/__tests__/asr-executor.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 4: Commit**

```bash
git add src/main/typeless-daemon/asr-executor.ts src/renderer/packages/voice/asr/index.ts src/renderer/packages/voice/asr/openai.ts src/renderer/packages/voice/asr/azure.ts src/renderer/packages/voice/asr/google.ts src/renderer/packages/voice/asr/aliyun.ts src/renderer/packages/voice/asr/funasr-local.ts src/renderer/packages/voice/asr/whisper-local.ts src/main/typeless-daemon/__tests__/asr-executor.test.ts
git commit -m "feat(voice): 添加后台 ASR 执行器"
```

## Task 7: Extract Main-Side Generation Runner

**Files:**
- Create: `src/main/typeless-daemon/generation-runner.ts`
- Modify: `src/renderer/packages/model-calls/stream-text.ts`
- Modify: `src/renderer/stores/session/messages.ts`
- Modify: `src/main/typeless-daemon/session-repository.ts`

- [ ] **Step 1: Extract a renderer-independent stream-text core**

把 `stream-text` 中真正与 UI 无关的部分抽成纯函数，例如：

```ts
export async function streamTextCore(args: {
  model
  sessionId
  messages
  toolSet
  onResultChange
  onStatusChange
}) {}
```

- [ ] **Step 2: Implement the main-side generation runner**

在 `src/main/typeless-daemon/generation-runner.ts` 中实现：

- `submitTypelessPrompt({ sessionId, text })`
- `runGeneration({ sessionId, userMessageId })`
- `subscribeToLifecycle()`

职责：

- 插入 user message
- 插入 assistant placeholder
- 驱动模型生成
- 在 tool call 时调用主进程 MCP controller
- 持续回写 assistant message

- [ ] **Step 3: Add focused generation tests**

新增或迁移定向测试，验证：

```ts
it('persists assistant updates while generating in main', async () => {})
it('continues generation after tool execution', async () => {})
```

- [ ] **Step 4: Run the focused generation tests**

Run:

```bash
pnpm exec vitest run src/main/typeless-daemon/__tests__/typeless-daemon.test.ts
```

Expected:

```text
仍可能 FAIL，但失败点应收敛到 daemon orchestration 未接完
```

- [ ] **Step 5: Commit**

```bash
git add src/main/typeless-daemon/generation-runner.ts src/renderer/packages/model-calls/stream-text.ts src/renderer/stores/session/messages.ts src/main/typeless-daemon/session-repository.ts
git commit -m "refactor(voice): 抽离后台生成执行器"
```

## Task 8: Wire The Full Typeless Daemon Flow In Main

**Files:**
- Create: `src/main/typeless-daemon/typeless-daemon.ts`
- Modify: `src/main/global-keyboard-hook.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/typeless-overlay.ts`
- Modify: `src/main/typeless-chat-result.ts`
- Create: `src/main/typeless-daemon/__tests__/typeless-daemon.test.ts`

- [ ] **Step 1: Implement the daemon orchestration**

在 `src/main/typeless-daemon/typeless-daemon.ts` 中实现：

- `handleHotkeyDown()`
- `handleHotkeyUp()`
- `cancelCurrentOperation()`
- `getRuntimeSnapshot()`
- `subscribe(listener)`

执行顺序：

1. 热键开始 -> worker 录音 -> overlay
2. 停止 -> ASR executor
3. transcript -> generation runner
4. tool call -> main MCP controller
5. 结果 -> overlay / result window

- [ ] **Step 2: Rewire the hotkey path**

在 `src/main/global-keyboard-hook.ts` 中：

- typeless 模式不再依赖 `mainWindow.webContents.send('hotkey:*')`
- 改成直接通知 daemon

保留 Chat 模式原行为。

- [ ] **Step 3: Initialize daemon in `main.ts`**

在 `src/main/main.ts`：

- 应用启动时创建 daemon
- 主窗口销毁时不销毁 daemon
- `before-quit` 时统一销毁 daemon、worker、overlay、result window

- [ ] **Step 4: Make the daemon integration test pass**

Run:

```bash
pnpm exec vitest run src/main/typeless-daemon/__tests__/typeless-daemon.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/main/typeless-daemon/typeless-daemon.ts src/main/global-keyboard-hook.ts src/main/main.ts src/main/typeless-overlay.ts src/main/typeless-chat-result.ts src/main/typeless-daemon/__tests__/typeless-daemon.test.ts
git commit -m "feat(voice): 接入 typeless 后台 daemon 主链路"
```

## Task 9: Convert Chatbox Window Into A Typeless Observer

**Files:**
- Modify: `src/shared/electron-types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/renderer/routes/__root.tsx`
- Modify: `src/renderer/hooks/useVoiceController.ts`
- Modify: `src/renderer/hooks/useVoiceController.test.tsx`

- [ ] **Step 1: Add runtime snapshot IPC to preload**

在 `src/preload/index.ts` 暴露：

- `getTypelessRuntimeSnapshot()`
- `onTypelessRuntimeSnapshot(callback)`

- [ ] **Step 2: Rework `useVoiceController` responsibilities**

让 `useVoiceController`：

- 继续负责 Chat 模式语音
- 在 Typeless 模式下只负责 UI 观察和必要同步
- 不再作为 typeless 主流程 owner

- [ ] **Step 3: Rework root initialization**

在 `src/renderer/routes/__root.tsx` 中：

- 启动时拉取 snapshot
- 订阅后台 typeless 状态
- 根据后台状态展示 Typeless 组件

- [ ] **Step 4: Update renderer tests**

在 `src/renderer/hooks/useVoiceController.test.tsx` 中新增/调整测试：

```tsx
it('hydrates typeless ui from main snapshot after renderer re-creation', async () => {})
```

- [ ] **Step 5: Run the renderer-focused tests**

Run:

```bash
pnpm exec vitest run src/renderer/hooks/useVoiceController.test.tsx
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/electron-types.ts src/preload/index.ts src/renderer/routes/__root.tsx src/renderer/hooks/useVoiceController.ts src/renderer/hooks/useVoiceController.test.tsx
git commit -m "refactor(voice): 让 chatbox 成为 typeless 观察者"
```

## Task 10: Run Final Verification And Manual Acceptance

**Files:**
- Verify only

- [ ] **Step 1: Run the targeted automated suite**

Run:

```bash
pnpm exec vitest run src/main/typeless-daemon/__tests__/typeless-state-machine.test.ts src/main/typeless-daemon/__tests__/asr-executor.test.ts src/main/typeless-daemon/__tests__/session-repository.test.ts src/main/typeless-daemon/__tests__/typeless-daemon.test.ts src/renderer/hooks/useVoiceController.test.tsx
```

Expected:

```text
PASS
```

- [ ] **Step 2: Run focused static checks**

Run:

```bash
cmd /c node_modules\\.bin\\biome.cmd check src\\main\\main.ts src\\main\\global-keyboard-hook.ts src\\main\\typeless-overlay.ts src\\main\\typeless-chat-result.ts src\\main\\typeless-daemon\\*.ts src\\preload\\index.ts src\\preload\\voice-worker.ts src\\renderer\\routes\\__root.tsx src\\renderer\\hooks\\useVoiceController.ts src\\renderer\\packages\\voice\\asr\\*.ts src\\renderer\\stores\\session\\messages.ts src\\renderer\\packages\\model-calls\\stream-text.ts src\\renderer\\packages\\mcp\\controller.ts src\\renderer\\voice-worker\\*.ts src\\shared\\electron-types.ts
```

Expected:

```text
PASS
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm check
```

Expected:

- PASS，或
- 若失败，明确区分是否为仓库已有问题

- [ ] **Step 4: Complete the manual acceptance checklist**

手动验证以下场景：

1. 主聊天窗口打开，长按后 typeless 正常工作
2. 主聊天窗口关闭并销毁后，长按仍可完成 `录音 -> ASR -> LLM -> MCP -> result`
3. 在 `recording` 阶段销毁主聊天窗口，当前轮次继续成功
4. 在 `llm` 阶段销毁主聊天窗口，当前轮次继续成功
5. 在 `mcp` 阶段销毁主聊天窗口，当前轮次继续成功
6. 主聊天窗口重新打开后，可以看到本轮会话与结果
7. `whisper-local`、`doubao`、`funasr-local` 至少各验证一次

- [ ] **Step 5: Final commit**

```bash
git status --short
git add .
git commit -m "feat(voice): 支持 typeless 后台常驻运行"
```

## Notes For Execution

- Phase 1 到 Phase 4 的关键目标是先让 `main` 真正拥有 typeless 运行权；在这之前，不要急着优化 UI。
- 若 `generation-runner` 迁移中发现 `stream-text.ts` 难以直接抽离，优先新增 `stream-text-core.ts`，不要继续把 renderer store 依赖带进 `main`。
- `whisper-local` 若在 worker 中仍有环境兼容问题，本轮允许暂时把后台 typeless 支持矩阵限定为 `doubao/openai/azure/google/aliyun/funasr-local`，但必须在交付时明确说明。
