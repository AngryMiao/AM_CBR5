# Typeless Global Chat Result Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让桌面端 `typeless` 在保留现有底部全局状态条的前提下，为纯聊天回复新增一个全局屏幕居中的结果卡片，并展示 ASR 文本与 AI 回复。

**Architecture:** 保留 `src/main/typeless-overlay.ts` 作为底部状态条，不再把桌面端纯聊天结果渲染为 renderer 内卡片。新增独立的主进程中央结果窗口模块与 IPC；renderer 继续基于 `TypelessRequestContext + assistant message` 推导 `chat_result`，并在满足条件时驱动中央结果窗口显示、关闭回流与新一轮抢占关闭。

**Tech Stack:** Electron BrowserWindow / IPC、preload bridge、React hooks、Jotai、Vitest、Testing Library

---

## Execution Prerequisites

- 用户已明确要求：
  - 不使用 worktree 隔离
  - 直接在当前分支 `refactor/angrymiao-voice-control` 上继续开发
- 当前工作区已有未提交改动，且包含本特性的半成品实现。执行本计划时：
  - 不要回滚或覆盖无关改动
  - 只针对本计划列出的文件做增量修改
  - `.superpowers/` 是本轮 brainstorming 产生的本地辅助文件，不要加入功能提交
- 开始实现前先运行基线验证：

```bash
pnpm test -- src/main/hotkey-dispatch.test.ts src/main/typeless-overlay.test.ts src/renderer/packages/voice/typeless-execution-state.test.ts src/renderer/packages/voice/typeless-request.test.ts src/renderer/components/voice/TypelessChatResult.test.tsx src/renderer/hooks/useVoiceController.test.tsx
```

预期：

- 现有定向测试通过
- 如果失败，先定位失败是否来自工作区已有未提交改动，再继续实施

## File Structure

- Create: `src/main/typeless-chat-result.ts`
  - 新的全局中央聊天结果窗口模块
  - 负责创建/复用 `BrowserWindow`
  - 负责居中定位、展示 `asrText/replyText`、手动关闭与关闭回流

- Create: `src/main/typeless-chat-result.test.ts`
  - 覆盖中央结果窗口配置、定位、全局悬浮配置、关闭事件与 payload 更新
  - 覆盖 IPC 注册 helper 与关闭回流

- Modify: `src/main/main.ts`
  - 注册 `typelessChatResult:show` / `typelessChatResult:hide`
  - 将中央结果窗口的关闭事件回传到主窗口 renderer
  - 保留现有 `typelessOverlay:*` IPC

- Modify: `src/preload/index.ts`
  - 在 `electronAPI` 上暴露专用方法：
    - `showTypelessChatResult(payload)`
    - `hideTypelessChatResult()`
    - `onTypelessChatResultClosed(callback)`

- Create: `src/preload/index.test.ts`
  - 覆盖 preload 暴露与关闭事件订阅

- Modify: `src/shared/electron-types.ts`
  - 为上述专用方法与关闭事件补齐窄类型
  - 不修改全局 `invoke(channel: string, ...args: any[])` 设计

- Modify: `src/renderer/stores/voiceStore.ts`
  - `TypelessRequestContext.userText` 更名为 `asrText`
  - 新增 `typelessChatResultAtom`
  - 将 `closeTypelessChatResult` 改成“清 result，并按轮次清 request”，同时保持无参关闭当前结果的中间态兼容

- Create: `src/renderer/stores/voiceStore.test.ts`
  - 直接覆盖 `typelessChatResultAtom`
  - 直接覆盖 `closeTypelessChatResult` 的无参关闭与按 `userMessageId` 精确清理

- Modify: `src/renderer/packages/voice/typeless-request.ts`
  - 返回 `asrText`

- Modify: `src/renderer/packages/voice/typeless-request.test.ts`
  - 断言 `context.asrText`

- Modify: `src/renderer/hooks/useVoiceController.ts`
  - 新一轮 `startRecording()` 前先抢占关闭旧中央卡片
  - 在 `chat_result` 时显示中央结果卡片，而不是依赖 renderer 卡片组件
  - 订阅主进程关闭回流，只清对应 `userMessageId`
  - 保留底部状态条逻辑，不让工具执行路径误开中央卡片

- Modify: `src/renderer/hooks/useVoiceController.test.tsx`
  - 覆盖“纯聊天只开一次中央结果卡片”
  - 覆盖“新一轮开始前先 hide 旧卡片”
  - 覆盖“关闭回流只清对应轮次”
  - 在 Task 3 同步把直接构造 `TypelessRequestContext` 的 fixture 从 `userText` 改成 `asrText`

- Modify: `src/renderer/routes/__root.tsx`
  - 桌面端停止挂载 `TypelessChatResult`
  - 非桌面端保持现状

- Create: `src/renderer/routes/__root.test.tsx`
  - 覆盖桌面端 root 不再挂载 `TypelessChatResult`
  - 覆盖非桌面端 root 仍保留现有挂载

- Modify: `src/renderer/components/voice/TypelessChatResult.tsx`
  - 若保留，明确为非桌面端使用
  - 若确认无用，则在后续任务中删除

- Modify: `src/renderer/components/voice/TypelessChatResult.test.tsx`
  - 缩小为非桌面端/组件局部行为测试
  - 在 Task 3 同步把直接构造 `TypelessRequestContext` 的 fixture 从 `userText` 改成 `asrText`

- Create: `src/renderer/components/voice/voice-surface-policy.ts`
  - 纯函数：决定桌面端是否还应挂载 renderer 内 `TypelessChatResult`

- Create: `src/renderer/components/voice/voice-surface-policy.test.ts`
  - 覆盖桌面端停用、非桌面端保留的分支判断

## Task 1: Add the Main-Process Global Chat Result Window

**Files:**
- Create: `src/main/typeless-chat-result.ts`
- Test: `src/main/typeless-chat-result.test.ts`
- Reference: `src/main/typeless-overlay.ts`

- [ ] **Step 1: Write the failing tests for the new centered result window**

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  buildTypelessChatResultWindowOptions,
  getTypelessChatResultDisplayBounds,
} from './typeless-chat-result'

describe('buildTypelessChatResultWindowOptions', () => {
  it('creates a clickable centered result window instead of a click-through overlay', () => {
    const options = buildTypelessChatResultWindowOptions()

    expect(options.frame).toBe(false)
    expect(options.transparent).toBe(true)
    expect(options.focusable).toBe(true)
  })
})

describe('getTypelessChatResultDisplayBounds', () => {
  it('centers the result window in the target display work area', () => {
    const bounds = getTypelessChatResultDisplayBounds({
      x: 100,
      y: 50,
      width: 1600,
      height: 900,
    })

    expect(bounds.x).toBeGreaterThan(100)
    expect(bounds.y).toBeGreaterThan(50)
  })
})

describe('showTypelessChatResult', () => {
  it('pushes userMessageId, asrText, and replyText into the window payload', async () => {
    await showTypelessChatResult({
      userMessageId: 'u1',
      asrText: '解释一下量子纠缠',
      replyText: '量子纠缠是...',
    })

    expect(executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('"userMessageId":"u1"'))
    expect(executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('"asrText":"解释一下量子纠缠"'))
    expect(executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('"replyText":"量子纠缠是..."'))
  })
})

describe('ensureTypelessChatResultWindow', () => {
  it('configures the result window as a global floating layer across workspaces', () => {
    const win = createMockBrowserWindow()

    ensureTypelessChatResultWindow({ createWindow: () => win })

    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(win.setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true })
  })

  it('shows inactive first and still reports manual close for the tracked result', async () => {
    const onClosed = vi.fn()
    const win = createMockBrowserWindow()

    bindTypelessChatResultWindow(win, { onClosed })
    await showTypelessChatResult({
      userMessageId: 'u1',
      asrText: '解释一下量子纠缠',
      replyText: '量子纠缠是...',
    })

    expect(win.showInactive).toHaveBeenCalled()
    win.emit('close')
    expect(onClosed).toHaveBeenCalledWith({ userMessageId: 'u1' })
  })
})
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
pnpm test -- src/main/typeless-chat-result.test.ts
```

Expected:

- FAIL，提示模块缺失或导出不存在

- [ ] **Step 3: Implement the minimal chat-result window module**

```ts
export type TypelessChatResultPayload = {
  userMessageId: string
  asrText: string
  replyText: string
}

export function buildTypelessChatResultWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 720,
    height: 420,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    focusable: true,
    skipTaskbar: true,
  }
}
```

额外要求：

- 多屏场景按“当前光标所在屏幕”的工作区中心定位
- 必须具备与 `typeless-overlay.ts` 一致的全局悬浮能力：
  - `setAlwaysOnTop(true, 'screen-saver')`
  - `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
- 首次展示尽量使用非抢焦点方式显示
- 首次展示使用 `showInactive()` 时，不能破坏后续用户手动关闭
- 不调用 `setIgnoreMouseEvents(true)`
- `showTypelessChatResult(...)` 必须把 `userMessageId / asrText / replyText` 推入页面状态
- 关闭时必须回传对应 `userMessageId`
- 主进程页面更新路径参考 `typeless-overlay.ts` 现有的 `did-finish-load + executeJavaScript` ready/update 模式

- [ ] **Step 4: Run the targeted test to verify GREEN**

Run:

```bash
pnpm test -- src/main/typeless-chat-result.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/typeless-chat-result.ts src/main/typeless-chat-result.test.ts
git commit -m "feat: add typeless global chat result window"
```

## Task 2: Wire Main/Preload IPC for the Result Window

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/preload/index.ts`
- Create: `src/preload/index.test.ts`
- Modify: `src/shared/electron-types.ts`
- Test: `src/main/typeless-chat-result.test.ts`
- Test: `src/preload/index.test.ts`

- [ ] **Step 1: Write the failing main/preload IPC wiring tests**

```ts
it('registers typelessChatResult show/hide handlers and relays close events to the main window', () => {
  const ipcMain = { handle: vi.fn() }
  const sendToMainWindow = vi.fn()
  let emitClosed: ((payload: { userMessageId: string }) => void) | undefined

  registerTypelessChatResultIpc({
    ipcMain,
    sendToMainWindow,
    show: vi.fn(),
    hide: vi.fn(),
    onClosed: (callback) => {
      emitClosed = callback
      return () => {}
    },
  })

  emitClosed?.({ userMessageId: 'u1' })
  expect(sendToMainWindow).toHaveBeenCalledWith('typelessChatResult:closed', { userMessageId: 'u1' })
})

it('preload exposes typed chat-result helpers instead of requiring raw invoke channel strings', async () => {
  await exposedApi.showTypelessChatResult({
    userMessageId: 'u1',
    asrText: '解释一下量子纠缠',
    replyText: '量子纠缠是...',
  })

  expect(ipcRenderer.invoke).toHaveBeenCalledWith('typelessChatResult:show', {
    userMessageId: 'u1',
    asrText: '解释一下量子纠缠',
    replyText: '量子纠缠是...',
  })
  expect(exposedApi.onTypelessChatResultClosed).toBeTypeOf('function')
})
```

- [ ] **Step 2: Run the targeted tests to verify RED**

Run:

```bash
pnpm test -- src/main/typeless-chat-result.test.ts src/preload/index.test.ts
```

Expected:

- FAIL，提示 IPC 注册 helper / preload 暴露尚不存在

- [ ] **Step 3: Implement minimal IPC wiring**

```ts
// typeless-chat-result.ts
export function registerTypelessChatResultIpc(args: {
  ipcMain: Pick<typeof import('electron').ipcMain, 'handle'>
  show: (payload: TypelessChatResultPayload) => void
  hide: () => void
  onClosed: (callback: (payload: { userMessageId: string }) => void) => () => void
  sendToMainWindow: (channel: string, payload: { userMessageId: string }) => void
}) {
  args.ipcMain.handle('typelessChatResult:show', (_event, payload) => {
    args.show(payload)
    return true
  })

  args.ipcMain.handle('typelessChatResult:hide', () => {
    args.hide()
    return true
  })

  args.onClosed((payload) => {
    args.sendToMainWindow('typelessChatResult:closed', payload)
  })
}
```

额外要求：

- `registerTypelessChatResultIpc(...)` 必须可单测，不要把验证压到整个 `main.ts`
- 主进程关闭回流应只发给真正主窗口，不发给 overlay/result 自身
- preload 必须显式暴露：
  - `showTypelessChatResult(payload)`
  - `hideTypelessChatResult()`
  - `onTypelessChatResultClosed(callback)`
- `ElectronIPC` 为上述专用方法和 payload 补齐窄类型，而不是试图给全局 `invoke` 做大范围 overload

- [ ] **Step 4: Run the targeted verification**

Run:

```bash
pnpm test -- src/main/typeless-chat-result.test.ts src/preload/index.test.ts src/main/hotkey-dispatch.test.ts src/main/typeless-overlay.test.ts
```

Expected:

- PASS
- 既有 hotkey / overlay 测试不回归

- [ ] **Step 5: Commit**

```bash
git add src/main/main.ts src/preload/index.ts src/preload/index.test.ts src/shared/electron-types.ts src/main/typeless-chat-result.ts src/main/typeless-chat-result.test.ts
git commit -m "feat: wire typeless chat result ipc"
```

## Task 3: Split Typeless Request State from Result-Window State

**Files:**
- Modify: `src/renderer/stores/voiceStore.ts`
- Create: `src/renderer/stores/voiceStore.test.ts`
- Modify: `src/renderer/packages/voice/typeless-request.ts`
- Modify: `src/renderer/packages/voice/typeless-request.test.ts`
- Modify: `src/renderer/hooks/useVoiceController.test.tsx`
- Modify: `src/renderer/components/voice/TypelessChatResult.test.tsx`

- [ ] **Step 1: Write the failing tests for `asrText` and store-level result cleanup**

```ts
it('stores asrText in the typeless request context', async () => {
  const { context } = await startTypelessRequest(/* ... */)
  expect(context.asrText).toBe('解释一下量子纠缠')
})

it('clears only the matching typeless request when closing a result by userMessageId', () => {
  store.set(typelessRequestAtom, {
    sessionId: 'session-new',
    userMessageId: 'u-new',
    asrText: '新的问题',
    startedAt: 2,
  })
  store.set(typelessChatResultAtom, {
    sessionId: 'session-old',
    userMessageId: 'u-old',
    asrText: '旧的问题',
    replyText: '旧的回答',
    shownAt: 1,
  })

  store.set(closeTypelessChatResult, { userMessageId: 'u-old' })

  expect(store.get(typelessChatResultAtom)).toBeNull()
  expect(store.get(typelessRequestAtom)?.userMessageId).toBe('u-new')
})
```

- [ ] **Step 2: Run the targeted tests to verify RED**

Run:

```bash
pnpm test -- src/renderer/packages/voice/typeless-request.test.ts src/renderer/stores/voiceStore.test.ts
```

Expected:

- FAIL，仍然断言旧字段 `userText`
- FAIL，`typelessChatResultAtom` / `closeTypelessChatResult` 尚未按新职责实现

- [ ] **Step 3: Implement the minimal state-model changes**

```ts
export interface TypelessRequestContext {
  sessionId: string
  userMessageId: string
  asrText: string
  startedAt: number
}

export interface TypelessChatResultContext {
  sessionId: string
  userMessageId: string
  asrText: string
  replyText: string
  shownAt: number
}

export const closeTypelessChatResult = atom(
  null,
  (get, set, payload?: { userMessageId?: string }) => {
    const currentRequest = get(typelessRequestAtom)
    const currentResult = get(typelessChatResultAtom)
    const targetUserMessageId =
      payload?.userMessageId ?? currentResult?.userMessageId ?? currentRequest?.userMessageId

    set(typelessChatResultAtom, null)

    if (!targetUserMessageId || currentRequest?.userMessageId === targetUserMessageId) {
      set(typelessRequestAtom, null)
    }
  }
)
```

额外要求：

- `typelessStatusAtom` 只服务底部状态条
- `typelessRequestAtom` 只服务 assistant 执行态推导
- `typelessChatResultAtom` 只服务中央结果卡片
- `closeTypelessChatResult` 需要支持“按 `userMessageId` 清理对应轮次”
- Task 3 内必须同步更新所有直接构造 `TypelessRequestContext` 的测试 fixture：
  - `src/renderer/hooks/useVoiceController.test.tsx`
  - `src/renderer/components/voice/TypelessChatResult.test.tsx`
- `closeTypelessChatResult` 在本任务阶段必须保持无参可调用，避免中间态破坏现有 `TypelessChatResult.tsx`；精确 payload 调用点放到 Task 4/5 再接入

- [ ] **Step 4: Run the targeted tests to verify GREEN**

Run:

```bash
pnpm test -- src/renderer/packages/voice/typeless-request.test.ts src/renderer/stores/voiceStore.test.ts src/renderer/hooks/useVoiceController.test.tsx src/renderer/components/voice/TypelessChatResult.test.tsx
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/voiceStore.ts src/renderer/stores/voiceStore.test.ts src/renderer/packages/voice/typeless-request.ts src/renderer/packages/voice/typeless-request.test.ts src/renderer/hooks/useVoiceController.test.tsx src/renderer/components/voice/TypelessChatResult.test.tsx
git commit -m "refactor: split typeless request and result state"
```

## Task 4: Drive the Main-Process Result Window from `useVoiceController`

**Files:**
- Modify: `src/renderer/hooks/useVoiceController.ts`
- Modify: `src/renderer/hooks/useVoiceController.test.tsx`
- Modify: `src/renderer/stores/voiceStore.ts`
- Reference: `src/renderer/packages/voice/typeless-execution-state.ts`

- [ ] **Step 1: Write the failing hook tests for chat-result display and close flow**

```tsx
it('shows the centered chat result window once for a pure chat_result assistant reply', async () => {
  expect(showTypelessChatResult).toHaveBeenCalledWith({
    userMessageId: trackedUser.id,
    asrText: '解释一下量子纠缠',
    replyText: '量子纠缠是...',
  })
})

it('hides the previous chat result window before starting a new recording', async () => {
  expect(hideTypelessChatResult).toHaveBeenCalled()
})

it('clears typelessStatus after showing the centered chat result window', async () => {
  expect(store.get(typelessStatusAtom)).toBeNull()
})

it('cleans only the matching request when the main process reports a close event', async () => {
  // emit onTypelessChatResultClosed for old userMessageId
  // expect current request to remain untouched
})

it('closes the centered chat result window and clears matching state when typeless mode is exited or the hook unmounts', async () => {
  expect(hideTypelessChatResult).toHaveBeenCalled()
})

it('does not show the centered chat result window for tool success states', async () => {
  expect(showTypelessChatResult).not.toHaveBeenCalled()
})

it('does not show the centered chat result window for tool error states', async () => {
  expect(showTypelessChatResult).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the targeted tests to verify RED**

Run:

```bash
pnpm test -- src/renderer/hooks/useVoiceController.test.tsx
```

Expected:

- FAIL，尚未调用 `typelessChatResult:*`
- FAIL，尚未处理关闭回流

- [ ] **Step 3: Implement the minimal renderer integration**

```ts
if (executionState.phase === 'chat_result' && request && replyText.trim()) {
  void window.electronAPI?.invoke('typelessOverlay:hide')
  setTypelessChatResult({
    sessionId: request.sessionId,
    userMessageId: request.userMessageId,
    asrText: request.asrText,
    replyText,
    shownAt: Date.now(),
  })
  void window.electronAPI?.showTypelessChatResult?.(payload)
}
```

额外要求：

- 去重条件必须依赖 `userMessageId`，避免重复 `show`
- `startRecording()` 开头先：
  - `hideTypelessChatResult()`
  - 清 `typelessChatResultAtom`
  - 清 `typelessRequestAtom`
  - 清 `typelessStatusAtom`
- `chat_result` 展示成功后，显式清空 `typelessStatusAtom`，避免 `typelessRequest` 清理后底部状态条回弹
- 只在 `chat_result` 路径打开中央结果卡片
- `success / error` 工具路径继续沿用底部状态条自动隐藏
- 工具 `success / error` 测试必须显式断言 `showTypelessChatResult` 从未被调用
- 订阅 `onTypelessChatResultClosed` 后，按 `userMessageId` 条件清理，避免旧事件误清新请求
- 在切出 `typeless` 模式、effect cleanup、窗口销毁清理时：
  - `hideTypelessChatResult()`
  - 清空匹配的 `typelessChatResultAtom`
  - 清空匹配的 `typelessRequestAtom`
  - 清空 `typelessStatusAtom`

- [ ] **Step 4: Run the targeted tests to verify GREEN**

Run:

```bash
pnpm test -- src/renderer/hooks/useVoiceController.test.tsx src/renderer/packages/voice/typeless-execution-state.test.ts
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useVoiceController.ts src/renderer/hooks/useVoiceController.test.tsx src/renderer/stores/voiceStore.ts
git commit -m "feat: drive typeless main-process result window"
```

## Task 5: Remove the Desktop Renderer Card Path

**Files:**
- Modify: `src/renderer/routes/__root.tsx`
- Create: `src/renderer/routes/__root.test.tsx`
- Create: `src/renderer/components/voice/voice-surface-policy.ts`
- Create: `src/renderer/components/voice/voice-surface-policy.test.ts`
- Modify: `src/renderer/components/voice/TypelessChatResult.tsx`
- Modify: `src/renderer/components/voice/TypelessChatResult.test.tsx`

- [ ] **Step 1: Write the failing desktop/non-desktop surface policy and root-mount tests**

```ts
it('disables renderer TypelessChatResult on desktop', () => {
  expect(shouldRenderInAppTypelessChatResult({ platformType: 'desktop' })).toBe(false)
})

it('keeps renderer TypelessChatResult for non-desktop platforms', () => {
  expect(shouldRenderInAppTypelessChatResult({ platformType: 'web' })).toBe(true)
})

it('does not mount TypelessChatResult in the desktop root when typeless mode is active', async () => {
  renderRoot({ platformType: 'desktop', workMode: 'typeless' })
  expect(screen.queryByTestId('typeless-chat-result')).toBeNull()
})
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
pnpm test -- src/renderer/components/voice/voice-surface-policy.test.ts src/renderer/routes/__root.test.tsx
```

Expected:

- FAIL，helper 尚不存在

- [ ] **Step 3: Implement the minimal removal**

按 spec 的确定路径执行，不再保留“直接删除组件”的分支：

```ts
// voice-surface-policy.ts
export function shouldRenderInAppTypelessChatResult(args: { platformType: string }) {
  return args.platformType !== 'desktop'
}

// __root.tsx
{voiceSettings.workMode === 'typeless'
  ? platform.type === 'desktop'
    ? null
    : <TypelessPanel />
  : <VoicePanel />}

{shouldRenderInAppTypelessChatResult({ platformType: platform.type }) ? <TypelessChatResult /> : null}
```

要求：

- 非桌面端保持现状
- 桌面端不能同时存在“主进程中央结果窗口 + renderer 右上角卡片”双展示源
- `TypelessChatResult.test.tsx` 只保留组件局部行为测试，不再承担桌面端挂载策略验证
- `__root.test.tsx` 必须直接覆盖桌面端不挂载、非桌面端仍挂载的集成行为，而不是只验证纯函数 helper

- [ ] **Step 4: Run the targeted verification**

Run:

```bash
pnpm test -- src/renderer/components/voice/voice-surface-policy.test.ts src/renderer/routes/__root.test.tsx src/renderer/components/voice/TypelessChatResult.test.tsx src/renderer/hooks/useVoiceController.test.tsx
```

Expected:

- PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/routes/__root.tsx src/renderer/routes/__root.test.tsx src/renderer/components/voice/voice-surface-policy.ts src/renderer/components/voice/voice-surface-policy.test.ts src/renderer/components/voice/TypelessChatResult.tsx src/renderer/components/voice/TypelessChatResult.test.tsx
git commit -m "refactor: remove desktop renderer typeless result card"
```

## Task 6: Final Verification and Manual Check

**Files:**
- Modify: none
- Test: changed files only

- [ ] **Step 1: Run the focused verification suite**

Run:

```bash
pnpm test -- src/main/hotkey-dispatch.test.ts src/main/typeless-overlay.test.ts src/main/typeless-chat-result.test.ts src/preload/index.test.ts src/renderer/packages/voice/typeless-execution-state.test.ts src/renderer/packages/voice/typeless-request.test.ts src/renderer/stores/voiceStore.test.ts src/renderer/components/voice/voice-surface-policy.test.ts src/renderer/routes/__root.test.tsx src/renderer/components/voice/TypelessChatResult.test.tsx src/renderer/hooks/useVoiceController.test.tsx
```

Expected:

- PASS

- [ ] **Step 2: Run repository typecheck signal**

Run:

```bash
pnpm check
```

Expected:

- 若 PASS：说明本轮接口改动未引入新的类型问题
- 若 FAIL：必须记录失败输出，并确认报错没有新增命中本轮修改文件；若命中本轮修改文件，先修复再继续

- [ ] **Step 3: Run desktop build verification**

Run:

```bash
pnpm build:skill-bundles
pnpm build:main
pnpm build:preload
pnpm build:renderer
```

Expected:

- PASS

- [ ] **Step 4: Run residual reference checks**

Run:

```bash
git grep -n "TypelessChatResult" -- src/renderer
git grep -n "typelessChatResult:show\\|typelessChatResult:hide" -- src/main src/preload src/shared src/renderer
```

Expected:

- 桌面端 renderer 卡片路径已不再参与显示
- 新 IPC 只在预期文件中出现

- [ ] **Step 5: Record manual verification results**

至少验证：

- “解释一下量子纠缠”
  - 底部状态条：`listening -> processing -> thinking`
  - 然后弹中央结果卡片
  - 卡片显示 `ASR 识别内容 + AI 聊天回复`
  - 不自动消失，点关闭后消失

- 卡片打开时再次触发 typeless
  - 旧卡片立即关闭
  - 新一轮进入 `listening`

- “复制”/“输入你好世界”
  - 只走底部状态条
  - 不弹中央结果卡片

- 切出 `typeless` 模式或窗口清理
  - 中央结果卡片关闭
  - 不残留旧 `status / request / result`

- [ ] **Step 6: Commit final verification-only fixes**

```bash
git add src/main/typeless-chat-result.ts src/main/typeless-chat-result.test.ts src/main/main.ts src/preload/index.ts src/preload/index.test.ts src/shared/electron-types.ts src/renderer/stores/voiceStore.ts src/renderer/stores/voiceStore.test.ts src/renderer/packages/voice/typeless-request.ts src/renderer/packages/voice/typeless-request.test.ts src/renderer/hooks/useVoiceController.ts src/renderer/hooks/useVoiceController.test.tsx src/renderer/routes/__root.tsx src/renderer/routes/__root.test.tsx src/renderer/components/voice/voice-surface-policy.ts src/renderer/components/voice/voice-surface-policy.test.ts src/renderer/components/voice/TypelessChatResult.tsx src/renderer/components/voice/TypelessChatResult.test.tsx
git commit -m "test: finalize typeless global chat result flow"
```
