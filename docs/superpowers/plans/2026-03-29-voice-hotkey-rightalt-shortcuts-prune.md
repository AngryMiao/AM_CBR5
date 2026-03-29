# Voice Hotkey RightAlt And Shortcut Prune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将语音快捷键改为精确物理键位录制与匹配，默认值改为 `RightAlt`，删除 voice 键盘快捷键/驱动功能，并把 Chatbox 通用快捷键裁剪为只保留“发送”和“窗口显隐”。

**Architecture:** 新增共享热键规则模块，统一 renderer 录制、设置校验和 main 注册语义，彻底禁止 `Ctrl`/`Alt` 这类不分左右的旧格式。voice 侧删除“语音触发词映射键盘控制”的整条链路；Chatbox 通用快捷键保留 `quickToggle` 与 `inputBoxSendMessage` 两项配置，其余快捷键支持和设置项全部移除，但对应 UI 功能入口保留。

**Tech Stack:** TypeScript、Electron main/preload、React、TanStack Router、Vitest、Zod

---

## File Structure

- Create: `src/shared/voice-hotkey.ts`
  - 统一定义精确热键 token、录制值规范化、旧值回退、冲突校验辅助。
- Create: `src/shared/voice-hotkey.test.ts`
  - 覆盖 `RightAlt` 默认值、左右修饰键、旧值拒收回退、冲突判断。
- Create: `src/main/global-keyboard-hook.test.ts`
  - 覆盖 `RightAlt` 单键、`LeftCtrl`/`RightCtrl` 区分、精确集合匹配。
- Create: `src/renderer/components/voice/VoiceHotkeyRecorder.tsx`
  - 从设置页拆出录制控件，负责 `KeyboardEvent.code` 捕获与展示。
- Create: `src/renderer/components/voice/VoiceHotkeyRecorder.test.tsx`
  - 覆盖 `AltRight -> RightAlt`、`ControlLeft + KeyK -> LeftCtrl+K`、`Escape` 取消、冲突阻止。
- Create: `src/renderer/packages/voice/intent-detector.test.ts`
  - 覆盖删除 `control` 分支后只剩 `chat/input` 语义。
- Modify: `src/shared/types/voice.ts`
  - 语音配置只保留必要字段，`toggleVoice` 默认值改为 `RightAlt`。
- Modify: `src/shared/types/settings.ts`
  - 通用快捷键 schema 只保留 `quickToggle` 与 `inputBoxSendMessage`。
- Modify: `src/shared/defaults.ts`
  - 默认语音热键改为 `RightAlt`，默认通用快捷键仅保留窗口显隐与发送。
- Modify: `src/main/global-keyboard-hook.ts`
  - 从“修饰键布尔位 + 主键”改为“精确按键集合匹配”。
- Modify: `src/main/main.ts`
  - 语音快捷键注册改用共享规则，默认 fallback 为 `RightAlt`；通用快捷键只注册窗口显隐。
- Modify: `src/renderer/hooks/useVoiceSettings.ts`
  - 删除 keyboard shortcut 默认填充逻辑，保存前统一规范/校验语音热键。
- Modify: `src/renderer/routes/settings/voice.tsx`
  - 用录制控件替换旧 `HotkeyPicker`，删除键盘驱动和 voice 键盘快捷键映射区块。
- Modify: `src/renderer/routes/settings/hotkeys.tsx`
  - 保留页面，但只显示“窗口显隐”和“发送”两项设置。
- Modify: `src/renderer/components/Shortcut.tsx`
  - 只渲染两项通用快捷键。
- Modify: `src/renderer/hooks/useShortcut.tsx`
  - 若仍存在仅服务已删除快捷键的分支，裁掉无用逻辑。
- Modify: `src/renderer/components/InputBox/InputBox.tsx`
  - 确认仅继续读取 `inputBoxSendMessage`，删除对已移除快捷键的依赖。
- Modify: `src/renderer/packages/voice/intent-detector.ts`
  - 删除 `control` 类型与 `keyboardShortcuts` 参数。
- Modify: `src/renderer/packages/agent-skills/angrymiao-voice-control.ts`
  - 删除 keyboard shortcut prompt block。
- Modify: `src/renderer/packages/voice/angrymiao-session.ts`
  - 删除 `keyboardShortcuts` 相关参数。
- Modify: `src/renderer/packages/voice/typeless-request.ts`
  - 删除 `keyboardShortcuts` 相关参数。
- Modify: `src/renderer/hooks/useVoiceController.ts`
  - 删除 `keyboardShortcuts` 传递和相关分支。
- Delete or stop importing: `src/shared/defaults/keyboard-shortcuts.ts`
  - 若无剩余引用则直接删除；若仍有其他无关模块引用，先断开 voice 侧依赖再决定是否删文件。

## Task 1: Add Shared Exact Voice Hotkey Rules

**Files:**
- Create: `src/shared/voice-hotkey.ts`
- Test: `src/shared/voice-hotkey.test.ts`
- Modify: `src/shared/types/voice.ts`
- Modify: `src/shared/defaults.ts`

- [ ] **Step 1: Write the failing shared hotkey tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VOICE_HOTKEY,
  normalizeRecordedVoiceHotkey,
  normalizeStoredVoiceHotkey,
  isValidVoiceHotkey,
} from './voice-hotkey'

describe('normalizeRecordedVoiceHotkey', () => {
  it('normalizes AltRight to RightAlt', () => {
    expect(normalizeRecordedVoiceHotkey(['AltRight'])).toBe('RightAlt')
  })

  it('keeps left and right modifiers distinct in combinations', () => {
    expect(normalizeRecordedVoiceHotkey(['ControlLeft', 'KeyK'])).toBe('LeftCtrl+K')
  })
})

describe('normalizeStoredVoiceHotkey', () => {
  it('falls back to RightAlt for legacy Alt/Ctrl format', () => {
    expect(normalizeStoredVoiceHotkey('Ctrl+Shift+V')).toBe('RightAlt')
  })
})

describe('isValidVoiceHotkey', () => {
  it('accepts a single right-side modifier key', () => {
    expect(isValidVoiceHotkey('RightAlt')).toBe(true)
  })
})

describe('DEFAULT_VOICE_HOTKEY', () => {
  it('uses RightAlt', () => {
    expect(DEFAULT_VOICE_HOTKEY).toBe('RightAlt')
  })
})
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
pnpm test -- src/shared/voice-hotkey.test.ts
```

Expected:

- FAIL，提示模块不存在或 `RightAlt` 默认值不匹配

- [ ] **Step 3: Implement the minimal shared hotkey module and defaults**

要求：

- 只接受精确 token：`LeftCtrl/RightCtrl/LeftShift/RightShift/LeftAlt/RightAlt/LeftMeta/RightMeta`
- 允许单键修饰键
- 不接受 `Ctrl/Alt/Shift/Meta`
- 读到旧值时直接回退 `RightAlt`
- `src/shared/types/voice.ts` 与 `src/shared/defaults.ts` 的默认值统一改成 `RightAlt`

- [ ] **Step 4: Run the targeted test to verify GREEN**

Run:

```bash
pnpm test -- src/shared/voice-hotkey.test.ts
```

Expected:

- PASS

## Task 2: Convert Main Hotkey Matching to Exact-Key Sets

**Files:**
- Modify: `src/main/global-keyboard-hook.ts`
- Modify: `src/main/main.ts`
- Test: `src/main/global-keyboard-hook.test.ts`
- Reference: `src/shared/voice-hotkey.ts`

- [ ] **Step 1: Write the failing main hotkey tests**

```ts
import { describe, expect, it } from 'vitest'
import { matchesExactHotkey, parseShortcut } from './global-keyboard-hook'

describe('parseShortcut', () => {
  it('parses RightAlt as an exact single-key shortcut', () => {
    expect(parseShortcut('RightAlt')).toEqual(new Set(['RightAlt']))
  })

  it('keeps LeftCtrl+K distinct from RightCtrl+K', () => {
    expect(parseShortcut('LeftCtrl+K')).not.toEqual(parseShortcut('RightCtrl+K'))
  })
})

describe('matchesExactHotkey', () => {
  it('matches RightAlt only when RightAlt is pressed', () => {
    expect(matchesExactHotkey(new Set(['RightAlt']), new Set(['RightAlt']))).toBe(true)
    expect(matchesExactHotkey(new Set(['RightAlt']), new Set(['LeftAlt']))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the targeted test to verify RED**

Run:

```bash
pnpm test -- src/main/global-keyboard-hook.test.ts
```

Expected:

- FAIL，当前实现仍是聚合修饰键布尔位，无法区分左右

- [ ] **Step 3: Implement the minimal exact-key matching**

要求：

- `global-keyboard-hook.ts` 不再依赖 `ctrl/meta/shift/alt` 聚合布尔位做热键匹配
- 使用按下 token 集合与目标 token 集合做精确比较
- `main.ts` 的 fallback 改成 `RightAlt`
- 若读取到非法旧语音热键，注册时也回退 `RightAlt`

- [ ] **Step 4: Run the targeted test to verify GREEN**

Run:

```bash
pnpm test -- src/main/global-keyboard-hook.test.ts
```

Expected:

- PASS

## Task 3: Replace Voice Hotkey Picker With Recorder UI

**Files:**
- Create: `src/renderer/components/voice/VoiceHotkeyRecorder.tsx`
- Test: `src/renderer/components/voice/VoiceHotkeyRecorder.test.tsx`
- Modify: `src/renderer/routes/settings/voice.tsx`
- Modify: `src/renderer/hooks/useVoiceSettings.ts`
- Reference: `src/shared/voice-hotkey.ts`

- [ ] **Step 1: Write the failing recorder tests**

```tsx
it('records AltRight as RightAlt', async () => {
  // focus recorder and fire keydown/keyup with code AltRight
  expect(onChange).toHaveBeenCalledWith('RightAlt')
})

it('records ControlLeft + KeyK as LeftCtrl+K', async () => {
  expect(onChange).toHaveBeenCalledWith('LeftCtrl+K')
})

it('cancels recording on Escape and restores the previous value', async () => {
  expect(screen.getByDisplayValue('RightAlt')).toBeInTheDocument()
})

it('blocks saving when the voice hotkey conflicts with quickToggle or send shortcut', async () => {
  expect(onConflict).toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalledWith('Alt+`')
})
```

- [ ] **Step 2: Run the targeted tests to verify RED**

Run:

```bash
pnpm test -- src/renderer/components/voice/VoiceHotkeyRecorder.test.tsx
```

Expected:

- FAIL，当前设置页仍是分类点选器，不支持精确录制和冲突阻止

- [ ] **Step 3: Implement the minimal recorder and settings integration**

要求：

- 设置页语音快捷键只保留录制控件
- 删除旧 `HotkeyPicker` 分类点选 UI
- `useVoiceSettings.ts` 删除 `keyboardShortcuts` 自动补默认值逻辑
- 保存前先调用共享规范化与冲突检测
- 冲突目标只覆盖仍然保留的通用快捷键：
  - `quickToggle`
  - `inputBoxSendMessage`

- [ ] **Step 4: Run the targeted tests to verify GREEN**

Run:

```bash
pnpm test -- src/renderer/components/voice/VoiceHotkeyRecorder.test.tsx
```

Expected:

- PASS

## Task 4: Remove Voice Keyboard Shortcut Feature End-To-End

**Files:**
- Modify: `src/renderer/packages/voice/intent-detector.ts`
- Test: `src/renderer/packages/voice/intent-detector.test.ts`
- Modify: `src/renderer/packages/agent-skills/angrymiao-voice-control.ts`
- Modify: `src/renderer/packages/voice/angrymiao-session.ts`
- Modify: `src/renderer/packages/voice/typeless-request.ts`
- Modify: `src/renderer/hooks/useVoiceController.ts`
- Modify: `src/shared/types/voice.ts`
- Modify: `src/shared/types/settings.ts`
- Modify: `src/renderer/routes/settings/voice.tsx`
- Delete or stop importing: `src/shared/defaults/keyboard-shortcuts.ts`

- [ ] **Step 1: Write the failing tests for feature removal**

```ts
import { describe, expect, it } from 'vitest'
import { determineIntent } from './intent-detector'
import { buildAngrymiaoAgentSkillPrompt } from '../agent-skills/angrymiao-voice-control'

describe('determineIntent', () => {
  it('no longer returns control intent', () => {
    expect(determineIntent('复制').type).toBe('input')
  })
})

describe('buildAngrymiaoAgentSkillPrompt', () => {
  it('does not inject keyboard shortcut control instructions', () => {
    expect(buildAngrymiaoAgentSkillPrompt('win32')).not.toContain('keyboard_control')
  })
})
```

- [ ] **Step 2: Run the targeted tests to verify RED**

Run:

```bash
pnpm test -- src/renderer/packages/voice/intent-detector.test.ts src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts
```

Expected:

- FAIL，仍存在 `control` 意图或 keyboard shortcut prompt block

- [ ] **Step 3: Implement the minimal removal**

要求：

- `voice` 配置模型删除 `keyboardDriverPath` 与 `keyboardShortcuts`
- `voice.tsx` 删除键盘驱动和映射设置区块
- `determineIntent` 只保留 `chat` / `input`
- `angrymiao-session.ts`、`typeless-request.ts`、`useVoiceController.ts` 删除 `keyboardShortcuts` 参数链路
- 若 `src/shared/defaults/keyboard-shortcuts.ts` 已无剩余引用，则直接删除；否则本任务至少断开所有 voice 侧和 settings 侧引用

- [ ] **Step 4: Run the targeted tests to verify GREEN**

Run:

```bash
pnpm test -- src/renderer/packages/voice/intent-detector.test.ts src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts
```

Expected:

- PASS

## Task 5: Prune Chatbox Shortcut Settings to Only Send And Window Toggle

**Files:**
- Modify: `src/shared/types/settings.ts`
- Modify: `src/shared/defaults.ts`
- Modify: `src/renderer/routes/settings/hotkeys.tsx`
- Modify: `src/renderer/components/Shortcut.tsx`
- Modify: `src/renderer/components/InputBox/InputBox.tsx`
- Modify: `src/main/main.ts`

- [ ] **Step 1: Write the failing pruning tests**

```ts
it('only exposes quickToggle and inputBoxSendMessage in shortcut settings', () => {
  expect(renderedLabels).toEqual(['Show/Hide the Application Window', 'Send'])
})

it('keeps Enter send behavior but removes dependency on deleted shortcut names', () => {
  expect(shortcuts.inputBoxSendMessage).toBe('Enter')
  expect('newChat' in shortcuts).toBe(false)
})
```

- [ ] **Step 2: Run the targeted tests to verify RED**

Run:

```bash
pnpm test -- src/shared/types.test.ts
```

Expected:

- FAIL，schema/defaults 仍包含大量无关快捷键字段

- [ ] **Step 3: Implement the minimal shortcut pruning**

要求：

- `Settings['shortcuts']` 只保留：
  - `quickToggle`
  - `inputBoxSendMessage`
- 设置页只显示这两项
- `main.ts` 只注册 `quickToggle`
- 发送逻辑继续沿用 `inputBoxSendMessage`
- 删除对 `inputBoxFocus/newChat/dialogOpenSearch/...` 等已删除快捷键字段的读取
- 底层对应功能不删除，只是移除快捷键支持与设置项

- [ ] **Step 4: Run the targeted tests to verify GREEN**

Run:

```bash
pnpm test -- src/shared/types.test.ts
```

Expected:

- PASS

## Task 6: Final Verification

**Files:**
- Modify: none
- Test: changed files only

- [ ] **Step 1: Run the focused test suite**

Run:

```bash
pnpm test -- src/shared/voice-hotkey.test.ts src/main/global-keyboard-hook.test.ts src/renderer/components/voice/VoiceHotkeyRecorder.test.tsx src/renderer/packages/voice/intent-detector.test.ts src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts src/shared/types.test.ts src/main/typeless-overlay.test.ts src/main/typeless-chat-result.test.ts
```

Expected:

- PASS

- [ ] **Step 2: Run repository typecheck signal**

Run:

```bash
pnpm check
```

Expected:

- 若 FAIL，必须记录是否命中新改文件
- 若命中新改文件，先修复
- 若未命中新改文件，明确标记为仓库既有问题

- [ ] **Step 3: Run residual reference checks**

Run:

```bash
git grep -n "keyboardShortcuts\\|keyboardDriverPath\\|keyboard_control\\|Ctrl+Shift+V" -- src
git grep -n "inputBoxFocus\\|newChat\\|newPictureChat\\|dialogOpenSearch\\|messageListRefreshContext\\|sessionListNavNext\\|sessionListNavPrev\\|optionNavUp\\|optionNavDown\\|optionSelect\\|inputBoxSendMessageWithoutResponse" -- src
```

Expected:

- voice 键盘快捷键链路已被移除
- 通用快捷键只剩窗口显隐和发送

- [ ] **Step 4: Record manual verification results**

至少验证：

1. 设置页默认显示 `RightAlt`
2. 录制 `RightAlt`、`LeftCtrl`、`LeftCtrl+K` 时能正确显示和保存
3. 旧值 `Ctrl+Shift+V` 不再保留，重新进入设置时回退为 `RightAlt`
4. 语音设置页不再显示“键盘控制驱动”和“键盘快捷键映射”
5. Chatbox 快捷键设置页只剩“窗口显隐”和“发送”
6. `Enter` 仍能发送消息
7. 窗口显隐快捷键仍可用

