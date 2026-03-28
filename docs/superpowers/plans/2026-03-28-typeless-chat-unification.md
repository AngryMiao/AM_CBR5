# Typeless Chat Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让桌面端 `typeless` 模式在 ASR 完成后统一复用 angrymiao chat 主链路，并基于真实 assistant 消息状态驱动 overlay、工具执行态和结果窗口。

**Architecture:** 录音与 ASR 仍由 `useVoiceController` 驱动；ASR 返回文本后不再走本地 `determineIntent()`，而是统一提交到 angrymiao session。提交路径必须先建立 `TypelessRequestContext`，再以 fire-and-observe 方式触发 `submitNewUserMessage(...)`，这样 renderer 才能在 assistant 流式生成期间观察到 `thinking / inserting / executing`。新增纯函数模块负责“请求上下文 + assistant message -> typeless 领域执行态”推导，renderer 再把领域态映射为 overlay 或结果窗口；旧的 `text:insert` IPC 在统一链路稳定后删除。

**Tech Stack:** Electron main/preload IPC、React hooks、Jotai atoms、Vitest、Testing Library、MCP skill runtime

---

## Execution Prerequisites

- 当前工作区已有未提交改动，且包含 `typeless` 相关文件。执行本计划前，控制器必须先用 `@superpowers:using-git-worktrees` 创建隔离 worktree，避免把本轮实现与现有改动混在一起。
- 新分支名称使用 `codex/typeless-chat-unification`。
- 如果仓库里仍不存在 `.worktrees/` 或 `worktrees/`，控制器需先询问用户 worktree 目录位置，再创建 worktree。
- 进入 worktree 后先运行：

```bash
pnpm install
pnpm test -- src/main/hotkey-dispatch.test.ts src/main/typeless-overlay.test.ts
```

预期：依赖安装成功；现有 hotkey/overlay 相关测试通过，确认基线可继续。

## File Structure

- Create: `src/renderer/packages/voice/typeless-execution-state.ts`
  纯函数模块。只负责：
  - 根据 `userMessageId` 精确定位本轮 assistant message
  - 根据 `assistant.generating / error / contentParts` 推导 `thinking / inserting / executing / success / error / chat_result`
  - 将领域态映射为 overlay 显示态或“隐藏 overlay”

- Create: `src/renderer/packages/voice/typeless-execution-state.test.ts`
  覆盖状态推导和 assistant message 定位逻辑。

- Create: `src/renderer/packages/voice/typeless-request.ts`
  纯函数/轻依赖模块。负责统一启动 typeless transcript 提交流程，返回 `TypelessRequestContext + submitPromise`，确保 request context 在 `submitNewUserMessage(...)` 完整返回前就已建立。

- Create: `src/renderer/packages/voice/typeless-request.test.ts`
  覆盖 session 获取、user message 构造、context 返回等提交路径。

- Modify: `src/renderer/stores/voiceStore.ts`
  增加 `typelessRequestAtom`，保留 `typelessStatusAtom` 作为 UI 展示状态，不再让业务语义完全依赖手工状态。

- Modify: `src/renderer/components/voice/TypelessChatResult.tsx`
  改为根据 `typelessRequestAtom + useSession(sessionId)` 精确定位 assistant message，只在 `chat_result` 时渲染。

- Create: `src/renderer/components/voice/TypelessChatResult.test.tsx`
  覆盖“普通问答显示结果 / 工具调用不显示结果窗”。

- Modify: `src/renderer/hooks/useVoiceController.ts`
  去掉 typeless 主路径上的本地 `determineIntent()`/`handleControlIntent()`/`handleInputIntent()`/`handleChatIntent()` 分流，统一改成 `submitTypelessRequest()`；overlay 同步逻辑改为依赖执行态推导。

- Modify: `src/preload/index.ts`
  删除 `insertText` / `isTextInsertionSupported` 暴露。

- Modify: `src/shared/electron-types.ts`
  删除旧 `insertText` / `isTextInsertionSupported` 类型。

- Modify: `src/main/main.ts`
  删除 `text:insert` / `text:isInsertionSupported` IPC。

- Delete: `src/main/text-inserter.ts`
  旧主进程 `clipboard + paste` 输入链路。

## Task 1: Build Typeless Execution-State Derivation

**Files:**
- Create: `src/renderer/packages/voice/typeless-execution-state.ts`
- Test: `src/renderer/packages/voice/typeless-execution-state.test.ts`

- [ ] **Step 1: Write the failing tests for assistant-message lookup and state mapping**

```ts
import { createMessage } from '@shared/types'
import { describe, expect, it } from 'vitest'
import {
  deriveTypelessExecutionState,
  findAssistantMessageForUser,
} from './typeless-execution-state'

describe('findAssistantMessageForUser', () => {
  it('returns the assistant message immediately following the tracked user message', () => {
    const olderUser = createMessage('user', 'older')
    const olderAssistant = createMessage('assistant', 'older reply')
    const trackedUser = createMessage('user', 'tracked')
    const trackedAssistant = createMessage('assistant', 'tracked reply')

    const result = findAssistantMessageForUser(
      [olderUser, olderAssistant, trackedUser, trackedAssistant],
      trackedUser.id
    )

    expect(result?.id).toBe(trackedAssistant.id)
  })
})

describe('deriveTypelessExecutionState', () => {
  it('maps generating reasoning-only assistant output to thinking', () => {
    const assistant = createMessage('assistant', '')
    assistant.generating = true
    assistant.contentParts = [{ type: 'reasoning', text: 'Thinking...' }]

    const state = deriveTypelessExecutionState({ assistantMessage: assistant })

    expect(state.phase).toBe('thinking')
  })

  it('keeps type_text requests in inserting while assistant is still generating', () => {
    const assistant = createMessage('assistant', '')
    assistant.generating = true
    assistant.contentParts = [
      {
        type: 'tool-call',
        state: 'result',
        toolCallId: 'tc1',
        toolName: 'mcp__system-control__type_text',
        args: { text: '你好' },
        result: { ok: true },
      },
    ]

    const state = deriveTypelessExecutionState({ assistantMessage: assistant })

    expect(state.phase).toBe('inserting')
  })
})
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
pnpm test -- src/renderer/packages/voice/typeless-execution-state.test.ts
```

Expected: FAIL，提示模块或导出不存在，或实现尚未满足断言。

- [ ] **Step 3: Implement the minimal pure-state module**

```ts
import type { Message } from '@shared/types'

export type TypelessExecutionPhase =
  | 'idle'
  | 'thinking'
  | 'inserting'
  | 'executing'
  | 'success'
  | 'error'
  | 'chat_result'

export function findAssistantMessageForUser(messages: Message[], userMessageId: string) {
  const userIndex = messages.findIndex((message) => message.id === userMessageId)
  if (userIndex < 0) return null
  return messages.slice(userIndex + 1).find((message) => message.role === 'assistant') ?? null
}

export function deriveTypelessExecutionState(args: { assistantMessage: Message | null }) {
  const assistantMessage = args.assistantMessage
  if (!assistantMessage) return { phase: 'thinking' as const }

  if (assistantMessage.error) return { phase: 'error' as const, message: assistantMessage.error }

  const toolCallParts = (assistantMessage.contentParts || []).filter((part) => part.type === 'tool-call')
  const hasTypeTextToolCall = toolCallParts.some((part) => part.toolName === 'mcp__system-control__type_text')
  const hasToolError = toolCallParts.some((part) => part.state === 'error')

  if (assistantMessage.generating && toolCallParts.length > 0) {
    return { phase: hasTypeTextToolCall ? ('inserting' as const) : ('executing' as const) }
  }
  if (assistantMessage.generating && toolCallParts.length === 0) {
    return { phase: 'thinking' as const }
  }
  if (toolCallParts.length > 0) {
    return { phase: hasToolError ? ('error' as const) : ('success' as const) }
  }
  const hasText = (assistantMessage.contentParts || []).some((part) => part.type === 'text' && part.text.trim())
  return hasText ? { phase: 'chat_result' as const } : { phase: 'error' as const, message: '未生成可用结果' }
}
```

- [ ] **Step 4: Run the targeted test to verify GREEN**

Run:

```bash
pnpm test -- src/renderer/packages/voice/typeless-execution-state.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/packages/voice/typeless-execution-state.ts src/renderer/packages/voice/typeless-execution-state.test.ts
git commit -m "feat: derive typeless execution state"
```

## Task 2: Build Unified Typeless Request Submission

**Files:**
- Create: `src/renderer/packages/voice/typeless-request.ts`
- Test: `src/renderer/packages/voice/typeless-request.test.ts`

- [ ] **Step 1: Write the failing tests for request submission**

```ts
import { describe, expect, it, vi } from 'vitest'
import { startTypelessRequest } from './typeless-request'

describe('startTypelessRequest', () => {
  it('returns tracked request context before waiting for the submit promise to settle', async () => {
    const ensureSession = vi.fn().mockResolvedValue({ id: 'session-1' })
    let resolveSubmit: (() => void) | undefined
    const submit = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve
        })
    )

    const { context, submitPromise } = await startTypelessRequest({
      text: '输入你好世界',
      keyboardShortcuts: [],
      ensureSession,
      submit,
      now: () => 123456,
    })

    expect(ensureSession).toHaveBeenCalledWith({ keyboardShortcuts: [], purgeOthers: false })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(context.sessionId).toBe('session-1')
    expect(context.userMessageId).toBeTruthy()
    expect(context.userText).toBe('输入你好世界')
    expect(context.startedAt).toBe(123456)

    resolveSubmit?.()
    await submitPromise
  })
})
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
pnpm test -- src/renderer/packages/voice/typeless-request.test.ts
```

Expected: FAIL，提示模块缺失，或当前实现无法在提交 Promise 未完成前返回 request context。

- [ ] **Step 3: Implement the minimal request helper**

```ts
import { createMessage } from '@shared/types'
import type { KeyboardShortcut } from '@shared/types/voice'
import type { Message } from '@shared/types'

export interface TypelessRequestContext {
  sessionId: string
  userMessageId: string
  userText: string
  startedAt: number
}

export async function startTypelessRequest(args: {
  text: string
  keyboardShortcuts: KeyboardShortcut[]
  ensureSession: (options: { keyboardShortcuts: KeyboardShortcut[]; purgeOthers: boolean }) => Promise<{ id: string }>
  submit: (sessionId: string, params: { newUserMsg: Message; needGenerating: boolean }) => Promise<unknown>
  now?: () => number
}): Promise<{ context: TypelessRequestContext; submitPromise: Promise<unknown> }> {
  const session = await args.ensureSession({
    keyboardShortcuts: args.keyboardShortcuts,
    purgeOthers: false,
  })
  const newUserMsg = createMessage('user', args.text)
  const submitPromise = args.submit(session.id, {
    newUserMsg,
    needGenerating: true,
  })
  return {
    context: {
      sessionId: session.id,
      userMessageId: newUserMsg.id,
      userText: args.text,
      startedAt: (args.now ?? Date.now)(),
    },
    submitPromise,
  }
}
```

- [ ] **Step 4: Run the targeted test to verify GREEN**

Run:

```bash
pnpm test -- src/renderer/packages/voice/typeless-request.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/packages/voice/typeless-request.ts src/renderer/packages/voice/typeless-request.test.ts
git commit -m "feat: add typeless request bootstrap helper"
```

## Task 3: Integrate Request Tracking into Renderer UI Flow

**Files:**
- Modify: `src/renderer/stores/voiceStore.ts`
- Modify: `src/renderer/components/voice/TypelessChatResult.tsx`
- Modify: `src/renderer/hooks/useVoiceController.ts`
- Test: `src/renderer/components/voice/TypelessChatResult.test.tsx`

- [ ] **Step 1: Write the failing result-window integration tests**

```tsx
/**
 * @vitest-environment jsdom
 */
import { Provider, createStore } from 'jotai'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TypelessChatResult } from './TypelessChatResult'
import { typelessRequestAtom } from '@/stores/voiceStore'

vi.mock('@/stores/chatStore', () => ({
  useSession: vi.fn(),
}))

it('renders the assistant reply for a plain chat_result request', () => {
  // mock useSession to return tracked user + plain assistant reply
  // set typelessRequestAtom with tracked userMessageId
  // expect rendered text to contain assistant reply only
})

it('renders nothing when the tracked assistant message contains tool calls', () => {
  // mock useSession to return tracked user + assistant tool-call
  // expect query result to be null
})
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
pnpm test -- src/renderer/components/voice/TypelessChatResult.test.tsx
```

Expected: FAIL，提示 `typelessRequestAtom` 缺失或组件行为不符合断言。

- [ ] **Step 3: Integrate the new helpers with minimal production changes**

```ts
// src/renderer/stores/voiceStore.ts
import type { TypelessRequestContext } from '@/packages/voice/typeless-request'

export const typelessRequestAtom = atom<TypelessRequestContext | null>(null)
export const closeTypelessChatResult = atom(null, (_get, set) => {
  set(typelessRequestAtom, null)
})

// src/renderer/components/voice/TypelessChatResult.tsx
const request = useAtomValue(typelessRequestAtom)
const { session } = useSession(request?.sessionId ?? null)
const assistantMessage = findAssistantMessageForUser(session?.messages ?? [], request?.userMessageId ?? '')
const executionState = deriveTypelessExecutionState({ assistantMessage })

if (!request || executionState.phase !== 'chat_result') return null

// src/renderer/hooks/useVoiceController.ts
if (settings.workMode === 'typeless') {
  const { context, submitPromise } = await startTypelessRequest({
    text,
    keyboardShortcuts: settings.keyboardShortcuts || [],
    ensureSession: ensureAngrymiaoSession,
    submit: submitNewUserMessage,
  })
  setTypelessRequest(context)
  void submitPromise.catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    setTypelessStatus({ type: 'error', message })
    setTypelessRequest(null)
  })
}
```

额外要求：

- 删除 `determineIntent` 的 typeless 主路径调用。
- 删除 `handleControlIntent()`、`handleInputIntent()`、`handleChatIntent()` 作为 typeless 主流程入口。
- 退役旧 `typelessChatResultAtom`，避免和 `typelessRequestAtom` 并存形成双状态源。
- overlay 同步逻辑改为：
  - `listening / processing` 仍使用录音态
  - 若存在 `typelessRequestAtom`，根据 `deriveTypelessExecutionState()` 写入 `typelessStatusAtom`
  - `chat_result` 必须映射为“隐藏 overlay，不写入 overlay 模式”
- 只有 `chat_result` 才允许 `TypelessChatResult` 渲染。
- 结果窗只展示 assistant 回复，不重复展示 `userText`。
- `TypelessRequestContext` 生命周期必须显式落地：
  - `submitPromise.catch(...)` 时立刻 `setTypelessRequest(null)`
  - `success / error` 必须接入 `src/renderer/hooks/useVoiceController.ts` 现有 overlay 自动隐藏计时器，在 hide timer 完成时同步 `setTypelessRequest(null)`
  - `chat_result` 必须替换 `src/renderer/components/voice/TypelessChatResult.tsx` 当前关闭路径，改为在用户点击关闭结果窗时通过 `closeTypelessChatResult` 清空 `typelessRequestAtom`

- [ ] **Step 4: Run the targeted tests to verify GREEN**

Run:

```bash
pnpm test -- src/renderer/packages/voice/typeless-execution-state.test.ts src/renderer/packages/voice/typeless-request.test.ts src/renderer/components/voice/TypelessChatResult.test.tsx
```

Expected: PASS

- [ ] **Step 5: Verify request cleanup paths with a dedicated regression test**

在 `src/renderer/components/voice/TypelessChatResult.test.tsx` 或相邻测试中补一条：

- 关闭结果窗会清空 `typelessRequestAtom`
- 工具执行完成的 `success`/`error` 路径不会留下 stale request

Run:

```bash
pnpm test -- src/renderer/components/voice/TypelessChatResult.test.tsx
```

Expected: PASS

- [ ] **Step 6: Run a focused typecheck on the changed renderer code**

Run:

```bash
pnpm check
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/renderer/stores/voiceStore.ts src/renderer/components/voice/TypelessChatResult.tsx src/renderer/components/voice/TypelessChatResult.test.tsx src/renderer/hooks/useVoiceController.ts
git commit -m "feat: unify typeless renderer flow with chat pipeline"
```

## Task 4: Remove the Legacy Text-Insertion IPC

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/electron-types.ts`
- Delete: `src/main/text-inserter.ts`

- [ ] **Step 1: Verify the legacy path is no longer used**

Run:

```bash
git grep -n -I -E "insertTextToActiveApp|insertText\\(|text:insert|text:isInsertionSupported" src/main src/preload src/renderer src/shared
```

Expected before cleanup: 仅剩旧 IPC 定义与实现，不再有 renderer 业务调用。

- [ ] **Step 2: Remove the dead IPC and legacy text inserter**

```ts
// src/main/main.ts
// 删除：
// import { insertTextToActiveApp, isTextInsertionSupported } from './text-inserter'
// ipcMain.handle('text:insert', ...)
// ipcMain.handle('text:isInsertionSupported', ...)

// src/preload/index.ts
// 删除 insertText / isTextInsertionSupported 暴露

// src/shared/electron-types.ts
// 删除旧 insertText 类型
```

并删除文件：

```bash
git rm src/main/text-inserter.ts
```

- [ ] **Step 3: Run regression checks after cleanup**

Run:

```bash
pnpm test -- src/main/hotkey-dispatch.test.ts src/main/typeless-overlay.test.ts src/renderer/packages/voice/typeless-execution-state.test.ts src/renderer/packages/voice/typeless-request.test.ts src/renderer/components/voice/TypelessChatResult.test.tsx
pnpm check
```

Expected: PASS

- [ ] **Step 4: Confirm no dead references remain**

Run:

```bash
git grep -n -I -E "insertTextToActiveApp|insertText\\(|text:insert|text:isInsertionSupported" src/main src/preload src/renderer src/shared
```

Expected: no output

- [ ] **Step 5: Commit**

```bash
git add src/main/main.ts src/preload/index.ts src/shared/electron-types.ts
git commit -m "refactor: remove legacy typeless text insertion ipc"
```

## Task 5: Final Verification and Review Handoff

**Files:**
- Modify: none
- Test: existing changed files only

- [ ] **Step 1: Run the focused verification suite**

Run:

```bash
pnpm test -- src/main/hotkey-dispatch.test.ts src/main/typeless-overlay.test.ts src/renderer/packages/voice/typeless-execution-state.test.ts src/renderer/packages/voice/typeless-request.test.ts src/renderer/components/voice/TypelessChatResult.test.tsx
pnpm check
```

Expected: PASS

- [ ] **Step 2: Run a targeted desktop build verification**

Run:

```bash
pnpm build:skill-bundles
pnpm build:main
pnpm build:preload
pnpm build:renderer
```

Expected: PASS

- [ ] **Step 3: Record manual verification checklist results**

至少手动验证：

- “输入你好世界” -> `thinking -> inserting -> success`，不弹结果窗。
- “复制” -> `thinking -> executing -> success`，不弹结果窗。
- “解释一下量子纠缠” -> `thinking -> chat_result`，弹极简结果窗。
- 工具失败场景 -> `error`。

- [ ] **Step 4: Commit any last test-only or wiring fixes**

```bash
git add -A
git commit -m "test: finalize typeless chat unification verification"
```
