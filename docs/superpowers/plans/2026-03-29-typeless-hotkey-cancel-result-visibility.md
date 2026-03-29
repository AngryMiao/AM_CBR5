# Typeless 热键中断与结果窗可见性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 typeless 模式稳定支持“单击取消当前轮、长按终止并重启新一轮录音”，并修复关闭极简聊天结果窗后错误弹出 chatbox 的回归问题。

**Architecture:** 在 renderer 的 `useVoiceController` 中引入统一的 typeless operation 状态机，用 `operationId` 保护录音、ASR、LLM/MCP、结果窗显示的整条链路；在 main 的 `typeless-chat-result` 中记录结果窗显示前的主窗口可见性快照，关闭结果窗时严格恢复原语义而不是依赖系统焦点回退。整个改动保持现有热键底层实现不变，只在状态机和窗口控制层补齐行为约束。

**Tech Stack:** React Hooks, Jotai, Electron main/preload IPC, Vitest, Testing Library

---

## File Structure

### Existing files to modify

- `src/renderer/hooks/useVoiceController.ts`
  - typeless 热键状态机主入口
  - 录音、ASR、typeless request、结果窗显示链路的统一 owner
- `src/renderer/hooks/useVoiceController.test.tsx`
  - renderer 侧 typeless 热键中断/重启/结果窗完成后不取消的回归测试
- `src/renderer/packages/voice/typeless-request.ts`
  - 透传或接收 operation 上下文，保证旧轮结果不会回写当前轮状态
- `src/main/typeless-chat-result.ts`
  - 结果窗显示前主窗口可见性快照
  - 手动关闭结果窗时的窗口行为保护
- `src/main/typeless-chat-result.test.ts`
  - 结果窗关闭后主窗口可见性保持的主进程回归测试

### Existing files to inspect while implementing

- `src/main/global-keyboard-hook.ts`
  - `hotkey:down/up` 的发送语义，确认不需要动底层长按监听
- `src/main/main.ts`
  - `registerTypelessChatResultIpc` glue code
  - 主窗口显示/隐藏辅助函数
- `src/renderer/stores/voiceStore.ts`
  - 现有 typeless request / typeless chat result / typeless status atom

## Task 1: 锁定 Renderer 热键状态机的失败用例

**Files:**
- Modify: `src/renderer/hooks/useVoiceController.test.tsx`
- Inspect: `src/renderer/hooks/useVoiceController.ts`

- [ ] **Step 1: 为“单击取消当前轮”补 failing test**

```tsx
it('cancels the active typeless operation on short tap without starting a new recording', async () => {
  // 先让当前轮进入 asr/处理中
  // 模拟 hotkey:down -> hotkey:up 的短按
  // 断言：
  // 1. 当前轮被取消
  // 2. recorder.start 没有再次被调用
  // 3. typeless overlay 被隐藏
})
```

- [ ] **Step 2: 运行单测确认它失败**

Run: `pnpm test -- src/renderer/hooks/useVoiceController.test.tsx`

Expected:
- FAIL，且失败原因是当前实现不会在处理中短按时执行统一取消逻辑

- [ ] **Step 3: 为“长按时取消旧轮并重启新录音”补 failing test**

```tsx
it('restarts a new typeless recording on long press while a previous operation is active', async () => {
  // 先让上一轮进入 asr/llm/mcp 之一
  // 模拟 hotkey:down 持续超过 180ms，再 keyup
  // 断言：
  // 1. 旧轮被取消
  // 2. 新一轮 recorder.start 被调用
  // 3. 新一轮拥有新的 operationId
})
```

- [ ] **Step 4: 为“结果窗显示后不再可取消”补 failing test**

```tsx
it('does not cancel the completed typeless flow after chat result is already visible', async () => {
  // 先让流程进入 result
  // 再模拟 hotkey 短按
  // 断言：
  // 1. 不触发 cancelCurrentOperation
  // 2. 不隐藏 typeless chat result
  // 3. 不启动新录音
})
```

- [ ] **Step 5: 提交测试脚手架**

```bash
git add src/renderer/hooks/useVoiceController.test.tsx
git commit -m "test: cover typeless hotkey cancel and restart flow"
```

## Task 2: 实现 Renderer 侧 typeless operation 状态机

**Files:**
- Modify: `src/renderer/hooks/useVoiceController.ts`
- Modify: `src/renderer/packages/voice/typeless-request.ts`
- Inspect: `src/renderer/stores/voiceStore.ts`
- Test: `src/renderer/hooks/useVoiceController.test.tsx`

- [ ] **Step 1: 在 `useVoiceController` 中增加 operation 元数据与阶段定义**

```ts
type TypelessOperationPhase = 'idle' | 'recording' | 'asr' | 'llm' | 'mcp' | 'result'

type TypelessOperationState = {
  id: number
  phase: TypelessOperationPhase
  restartRequested: boolean
}
```

- [ ] **Step 2: 抽出统一的取消入口**

```ts
const cancelCurrentOperation = useCallback(async () => {
  // 仅在 recording / asr / llm / mcp 阶段生效
  // 递增 operationId，使旧轮异步结果自动失效
  // 停止 recorder（如果还在录）
  // 清理 typelessRequest / typelessStatus / streamingText
  // 隐藏 typeless overlay
}, [])
```

- [ ] **Step 3: 重写 `handleHotkeyDown` 的忙碌阶段行为**

```ts
if (isTypelessCancelablePhase(currentPhase)) {
  longPressStartAtRef.current = Date.now()
  pendingRestartRef.current = true
  await cancelCurrentOperation()
  longPressRestartTimerRef.current = setTimeout(() => {
    if (pendingRestartRef.current) {
      pendingRestartRef.current = false
      void activateVoiceInputRef.current()
    }
  }, 180)
  return
}
```

- [ ] **Step 4: 重写 `handleHotkeyUp` 的单击/长按收敛逻辑**

```ts
if (busyTapCandidate) {
  clearTimeout(longPressRestartTimerRef.current)
  if (pressDuration < 180) {
    // 单击取消，只结束，不重启
    pendingRestartRef.current = false
    return
  }
  // 长按路径的重启已在 timer 或 down 阶段完成，这里只做收尾
}
```

- [ ] **Step 5: 给录音、ASR、typeless request 提交流程加 operationId 护栏**

```ts
const operationId = beginTypelessOperation('recording')
await recorder.start()
if (!isCurrentOperation(operationId)) return false

const text = await asrProvider.transcribe(audioBlob)
if (!isCurrentOperation(operationId)) return null

const { context, submitPromise } = await startTypelessRequest({ ..., operationId })
if (!isCurrentOperation(operationId)) return
```

- [ ] **Step 6: 在结果窗出现时显式切到 `result` 阶段**

```ts
setCurrentTypelessOperation((prev) =>
  prev && prev.id === operationId ? { ...prev, phase: 'result' } : prev
)
```

- [ ] **Step 7: 运行测试确认 renderer 状态机变绿**

Run: `pnpm test -- src/renderer/hooks/useVoiceController.test.tsx`

Expected:
- PASS

- [ ] **Step 8: 提交 renderer 状态机实现**

```bash
git add src/renderer/hooks/useVoiceController.ts src/renderer/hooks/useVoiceController.test.tsx src/renderer/packages/voice/typeless-request.ts
git commit -m "feat: add typeless hotkey cancel and restart state machine"
```

## Task 3: 锁定 Main 侧结果窗关闭后的主窗口可见性回归

**Files:**
- Modify: `src/main/typeless-chat-result.test.ts`
- Inspect: `src/main/typeless-chat-result.ts`
- Inspect: `src/main/main.ts`

- [ ] **Step 1: 为“主窗口原本隐藏时，关闭结果窗后仍保持隐藏”补 failing test**

```ts
it('keeps the main window hidden after closing the typeless result when it was hidden before showing result', async () => {
  // 构造 mainWindowVisible=false 的快照
  // show result
  // simulate close
  // 断言不会触发 mainWindow.show / focus
})
```

- [ ] **Step 2: 为“主窗口原本显示时，关闭结果窗后不改变可见性”补 failing test**

```ts
it('does not toggle main window visibility when closing the typeless result if main window was already visible', async () => {
  // 构造 mainWindowVisible=true
  // simulate close
  // 断言没有额外 hide/show toggle
})
```

- [ ] **Step 3: 运行单测确认它失败**

Run: `pnpm test -- src/main/typeless-chat-result.test.ts`

Expected:
- FAIL，且失败原因是当前实现没有主窗口可见性快照保护

- [ ] **Step 4: 提交主进程测试脚手架**

```bash
git add src/main/typeless-chat-result.test.ts
git commit -m "test: cover typeless result close visibility behavior"
```

## Task 4: 实现 Main 侧结果窗可见性快照

**Files:**
- Modify: `src/main/typeless-chat-result.ts`
- Modify: `src/main/main.ts`（仅在需要 glue 时）
- Test: `src/main/typeless-chat-result.test.ts`

- [ ] **Step 1: 在结果窗模块中记录主窗口可见性快照**

```ts
let mainWindowVisibilityBeforeResult = false

export function showTypelessChatResult(payload, options?: { mainWindowVisible?: boolean }) {
  mainWindowVisibilityBeforeResult = !!options?.mainWindowVisible
  ...
}
```

- [ ] **Step 2: 关闭结果窗时只发关闭事件，不执行 chatbox 显示切换**

```ts
chatResultWindow.on('close', (event) => {
  event.preventDefault()
  chatResultWindow?.blur()
  chatResultWindow?.hide()
  emitTypelessChatResultClosed(...)
  // 不在这里 show/focus mainWindow
})
```

- [ ] **Step 3: 如果需要，从 `main.ts` 传入显示前快照**

```ts
show: (payload) =>
  showTypelessChatResult(payload, {
    mainWindowVisible: !!mainWindow && mainWindow.isVisible(),
  })
```

- [ ] **Step 4: 运行主进程测试确认变绿**

Run: `pnpm test -- src/main/typeless-chat-result.test.ts`

Expected:
- PASS

- [ ] **Step 5: 提交主进程可见性修复**

```bash
git add src/main/typeless-chat-result.ts src/main/typeless-chat-result.test.ts src/main/main.ts
git commit -m "fix: preserve main window visibility when closing typeless result"
```

## Task 5: 集成回归与定向检查

**Files:**
- Modify if needed: `src/renderer/hooks/useVoiceController.ts`
- Modify if needed: `src/main/typeless-chat-result.ts`
- Verify:
  - `src/renderer/hooks/useVoiceController.test.tsx`
  - `src/main/typeless-chat-result.test.ts`
  - `src/shared/voice-hotkey.test.ts`
  - `src/main/global-keyboard-hook.test.ts`
  - `src/renderer/components/voice/VoiceHotkeyRecorder.test.tsx`
  - `src/main/typeless-overlay.test.ts`

- [ ] **Step 1: 跑 typeless 与热键相关回归集**

Run:

```bash
pnpm test -- src/renderer/hooks/useVoiceController.test.tsx src/main/typeless-chat-result.test.ts src/shared/voice-hotkey.test.ts src/main/global-keyboard-hook.test.ts src/renderer/packages/voice/intent-detector.test.ts src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts src/renderer/components/voice/VoiceHotkeyRecorder.test.tsx src/shared/shortcut-settings.test.ts src/renderer/components/Shortcut.test.ts src/main/typeless-overlay.test.ts src/renderer/storage/StoreStorage.test.ts
```

Expected:
- PASS，所有 typeless / 热键 / 极简窗口相关测试保持绿色

- [ ] **Step 2: 跑本次修改范围的类型检查**

Run:

```bash
$ErrorActionPreference='Continue'; pnpm check 2>&1 | Select-String -Pattern 'src/renderer/hooks/useVoiceController.ts|src/renderer/hooks/useVoiceController.test.tsx|src/renderer/packages/voice/typeless-request.ts|src/main/typeless-chat-result.ts|src/main/typeless-chat-result.test.ts|src/main/main.ts' | ForEach-Object { $_.Line }
```

Expected:
- 无输出

- [ ] **Step 3: 手工回归验证**

验证场景：

1. 主窗口隐藏，长按语音快捷键进入录音，松手正常进入 ASR/LLM/MCP
2. 在 `asr / llm / mcp` 期间单击快捷键，当前轮被取消且不重启
3. 在 `asr / llm / mcp` 期间长按快捷键，旧轮终止，新一轮录音启动
4. 结果窗已经弹出时再按快捷键，不取消已完成结果
5. 主窗口隐藏时关闭结果窗，chatbox 不应显示
6. 主窗口显示时关闭结果窗，chatbox 保持原样，不额外切换

- [ ] **Step 4: 最终提交**

```bash
git add src/renderer/hooks/useVoiceController.ts src/renderer/hooks/useVoiceController.test.tsx src/renderer/packages/voice/typeless-request.ts src/main/typeless-chat-result.ts src/main/typeless-chat-result.test.ts src/main/main.ts docs/superpowers/specs/2026-03-29-typeless-hotkey-cancel-result-visibility-design.md docs/superpowers/plans/2026-03-29-typeless-hotkey-cancel-result-visibility.md
git commit -m "fix: stabilize typeless hotkey cancellation and result visibility"
```
