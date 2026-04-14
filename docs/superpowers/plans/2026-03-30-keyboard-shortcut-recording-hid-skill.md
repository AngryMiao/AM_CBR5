# Keyboard Shortcut Recording And HID Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把语音设置里的“键盘快捷键”改成录制式输入，保存真实录制键名 `recordedKeys`，并把 HID 参考知识注入 Angrymiao voice skill，让 LLM 根据真实键名生成现有 `keyboard_control` 所需的 `keyCodes`。

**Architecture:** 保持现有 `keyboard_control({ keyCodes })` 协议与 `src/shared/defaults/keyboard-shortcuts.ts` 职责不变。前端新增一个独立的 `KeyboardShortcutRecorder` 负责采集 `KeyboardEvent.code`，`KeyboardControlSettings` 只负责列表编辑、风险提示和兼容旧 `keyCodes` 数据；共享层新增轻量 `voice-key-reference` 模块服务 UI 展示与“是否存在稳定 HID 映射”的判断；Angrymiao skill prompt 在保留默认 shortcut mapping 的同时，额外注入用户录制的 `recordedKeys` 和 bundle 内 `keyboard-hid-reference.md` 文档内容。

**Tech Stack:** TypeScript, React, Zod, Vitest, React Testing Library, Markdown skill bundle docs

---

## File Structure

- Modify: `src/shared/types/voice.ts`
  - 给 `KeyboardShortcutSchema` 增加可选 `recordedKeys?: string[]`
- Create: `src/shared/voice-key-reference.ts`
  - 维护 `KeyboardEvent.code` 展示名、排序、稳定 HID 映射判定、旧 `keyCodes` 提示辅助
- Create: `src/shared/voice-key-reference.test.ts`
  - 覆盖 `recordedKeys` schema、展示名、稳定映射判定、排序规则
- Create: `src/renderer/components/voice/KeyboardShortcutRecorder.tsx`
  - 独立封装录制逻辑，支持单键、多键、取消、清空、6 键上限
- Create: `src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx`
  - 覆盖录制单键、组合键、`Escape` 取消、`Backspace` 清空、超过 6 键阻止继续录制
- Modify: `src/renderer/components/voice/KeyboardControlSettings.tsx`
  - 移除手动点选 `KeyComboBuilder`，接入录制组件与未知 HID 风险提示，保存 `recordedKeys`
- Create: `src/renderer/components/voice/KeyboardControlSettings.test.tsx`
  - 覆盖新增快捷键、编辑快捷键、未知映射提示、旧 `keyCodes` 配置展示
- Modify: `src/renderer/packages/agent-skills/angrymiao-voice-control.ts`
  - 让 prompt 注入 `recordedKeys`、兼容保留 `keyCodes`、拼接 HID reference 文档
- Modify: `src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts`
  - 覆盖 prompt 中的 `recordedKeys` 列与 HID reference 注入
- Create: `voice-app/skill-bundles/angrymiao-voice-control/docs/keyboard-hid-reference.md`
  - 给 LLM 提供真实键名到 HID 的轻量参考文档

## Constraints

- `src/shared/defaults/keyboard-shortcuts.ts` 只读保留，不修改、不删除。
- 不修改 `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/index.ts` 和 `keyboard_control` 入参协议。
- 录制保存的真值是 `recordedKeys`，不是 `keyCodes`。
- 允许保存没有稳定 HID 映射的键，但 UI 必须明确显示“该键当前没有稳定 HID 映射，执行可能失败”。
- 录制上限为 6 个键。
- 旧数据只有 `keyCodes` 时仍可展示、启用、编辑；重新录制后再升级成 `recordedKeys`。

## Task 1: Add Shared `recordedKeys` Model And Voice Key Reference Helpers

**Files:**
- Modify: `src/shared/types/voice.ts`
- Create: `src/shared/voice-key-reference.ts`
- Create: `src/shared/voice-key-reference.test.ts`

- [ ] **Step 1: Write the failing shared tests**

创建 `src/shared/voice-key-reference.test.ts`，至少覆盖四类断言：

```ts
import { describe, expect, it } from 'vitest'
import { KeyboardShortcutSchema } from './types/voice'
import {
  getRecordedKeyDisplayLabel,
  hasStableHidMapping,
  orderRecordedKeys,
} from './voice-key-reference'

describe('KeyboardShortcutSchema', () => {
  it('accepts recordedKeys as optional keyboard event codes', () => {
    expect(
      KeyboardShortcutSchema.parse({
        id: 'ks_1',
        name: '粘贴',
        triggerWords: ['粘贴'],
        keyCodes: ['110700E0', '11070019', '10070019', '100700E0'],
        recordedKeys: ['ControlLeft', 'KeyV'],
        enabled: true,
      }).recordedKeys
    ).toEqual(['ControlLeft', 'KeyV'])
  })
})

describe('voice-key-reference helpers', () => {
  it('maps keyboard event codes to compact display labels', () => {
    expect(getRecordedKeyDisplayLabel('ControlLeft')).toBe('CtrlLeft')
    expect(getRecordedKeyDisplayLabel('KeyA')).toBe('A')
  })

  it('keeps modifiers before normal keys when ordering recorded keys', () => {
    expect(orderRecordedKeys(['KeyV', 'ControlLeft', 'ShiftLeft'])).toEqual([
      'ControlLeft',
      'ShiftLeft',
      'KeyV',
    ])
  })

  it('reports stable HID coverage for known keys only', () => {
    expect(hasStableHidMapping(['ControlLeft', 'KeyV'])).toBe(true)
    expect(hasStableHidMapping(['IntlRo'])).toBe(false)
  })
})
```

- [ ] **Step 2: Run the targeted shared test to verify RED**

Run:

```bash
pnpm exec vitest run src/shared/voice-key-reference.test.ts
```

Expected:

```text
FAIL because voice-key-reference.ts does not exist and recordedKeys is not defined on KeyboardShortcutSchema
```

- [ ] **Step 3: Implement the minimal shared model and helper module**

在 `src/shared/types/voice.ts` 中给 `KeyboardShortcutSchema` 增加：

```ts
recordedKeys: z.array(z.string()).optional(),
```

创建 `src/shared/voice-key-reference.ts`，导出最小但稳定的 UI/skill 辅助：

```ts
const DISPLAY_LABELS: Record<string, string> = {
  ControlLeft: 'CtrlLeft',
  ControlRight: 'CtrlRight',
  ShiftLeft: 'ShiftLeft',
  ShiftRight: 'ShiftRight',
  AltLeft: 'AltLeft',
  AltRight: 'AltRight',
  MetaLeft: 'Cmd/WinLeft',
  MetaRight: 'Cmd/WinRight',
  KeyA: 'A',
  Digit1: '1',
}

const MODIFIER_ORDER = [
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
] as const

const STABLE_HID_KEYS = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'MetaLeft',
  'KeyA',
  'KeyB',
  'KeyC',
  'Digit1',
  'Enter',
  'Escape',
  'Tab',
])
```

最少导出这些函数：

```ts
export function orderRecordedKeys(keys: string[]): string[] { /* modifier first, keep unique */ }
export function getRecordedKeyDisplayLabel(code: string): string { /* DISPLAY_LABELS fallback */ }
export function hasStableHidMapping(keys: string[]): boolean { /* every key in STABLE_HID_KEYS */ }
export function getMissingStableHidKeys(keys: string[]): string[] { /* filter unknown keys */ }
```

注意：

- 这里的稳定 HID 覆盖表只服务 UI 风险提示和 prompt 辅助，不替代 `keyboard-shortcuts.ts`
- 不要在这里生成 `keyCodes`
- 可以读取 `keyboard-shortcuts.ts` 已知命名作为参考，但不要修改那个文件

- [ ] **Step 4: Run the shared test to verify GREEN**

Run:

```bash
pnpm exec vitest run src/shared/voice-key-reference.test.ts
```

Expected:

```text
PASS all voice-key-reference helper tests
```

- [ ] **Step 5: Commit the shared slice**

```bash
git add src/shared/types/voice.ts src/shared/voice-key-reference.ts src/shared/voice-key-reference.test.ts
git commit -m "feat(voice): 增加录制键名参考模型"
```

## Task 2: Build The Recording-Style Keyboard Shortcut Recorder

**Files:**
- Create: `src/renderer/components/voice/KeyboardShortcutRecorder.tsx`
- Create: `src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx`
- Reference: `src/renderer/components/voice/VoiceHotkeyRecorder.tsx`
- Reference: `src/shared/voice-key-reference.ts`

- [ ] **Step 1: Write the failing recorder component tests**

创建 `src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx`，覆盖以下行为：

```tsx
it('records a single key using KeyboardEvent.code', async () => {
  render(<KeyboardShortcutRecorder value={[]} onChange={onChange} />)

  await user.click(screen.getByRole('button', { name: '录制' }))
  fireEvent.keyDown(window, { code: 'KeyA', key: 'a' })
  fireEvent.keyUp(window, { code: 'KeyA', key: 'a' })

  expect(onChange).toHaveBeenCalledWith(['KeyA'])
  expect(screen.getByDisplayValue('A')).toBeInTheDocument()
})

it('records multiple keys and orders modifiers first', async () => {
  render(<KeyboardShortcutRecorder value={[]} onChange={onChange} />)

  await user.click(screen.getByRole('button', { name: '录制' }))
  fireEvent.keyDown(window, { code: 'KeyV', key: 'v' })
  fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control' })
  fireEvent.keyUp(window, { code: 'KeyV', key: 'v' })

  expect(onChange).toHaveBeenCalledWith(['ControlLeft', 'KeyV'])
})

it('restores previous value when recording is cancelled by Escape', async () => {
  render(<KeyboardShortcutRecorder value={['ControlLeft', 'KeyV']} onChange={onChange} />)

  await user.click(screen.getByRole('button', { name: '录制' }))
  fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' })

  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByDisplayValue('CtrlLeft + V')).toBeInTheDocument()
})

it('clears the value on Backspace', async () => {
  render(<KeyboardShortcutRecorder value={['ControlLeft', 'KeyV']} onChange={onChange} />)

  await user.click(screen.getByRole('button', { name: '录制' }))
  fireEvent.keyDown(window, { code: 'Backspace', key: 'Backspace' })

  expect(onChange).toHaveBeenCalledWith([])
})

it('does not accept more than six keys', async () => {
  render(<KeyboardShortcutRecorder value={[]} onChange={onChange} />)

  await user.click(screen.getByRole('button', { name: '录制' }))
  ;['ControlLeft', 'ShiftLeft', 'AltLeft', 'MetaLeft', 'KeyA', 'KeyB', 'KeyC'].forEach((code) => {
    fireEvent.keyDown(window, { code, key: code })
  })

  expect(screen.getByText('最多录制 6 个键')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the targeted recorder test to verify RED**

Run:

```bash
pnpm exec vitest run src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx
```

Expected:

```text
FAIL because KeyboardShortcutRecorder.tsx does not exist yet
```

- [ ] **Step 3: Implement the recorder component with the smallest surface**

创建 `src/renderer/components/voice/KeyboardShortcutRecorder.tsx`：

```tsx
type KeyboardShortcutRecorderProps = {
  value?: string[]
  onChange: (recordedKeys: string[]) => void
}
```

实现约束：

1. 点击“录制”后监听 `window` 的 capture 阶段 `keydown` / `keyup`
2. 内部使用 `event.code`，而不是 `event.key`
3. `Escape` 取消录制并恢复旧值
4. `Backspace` 清空并提交 `[]`
5. 当某个已录制键被 `keyup` 时，提交当前集合并结束录制
6. 集合去重并通过 `orderRecordedKeys()` 排序
7. 超过 6 键时保留前 6 个，并显示错误文案，不提交第 7 个键
8. 只负责录制与展示，不负责 `keyCodes` 生成

建议展示逻辑：

```ts
const displayValue = recordedKeys.map(getRecordedKeyDisplayLabel).join(' + ')
```

- [ ] **Step 4: Run the recorder test to verify GREEN**

Run:

```bash
pnpm exec vitest run src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx
```

Expected:

```text
PASS all recorder interaction tests
```

- [ ] **Step 5: Commit the recorder slice**

```bash
git add src/renderer/components/voice/KeyboardShortcutRecorder.tsx src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx
git commit -m "feat(voice): 增加键盘快捷键录制组件"
```

## Task 3: Replace Manual Key Picking In `KeyboardControlSettings`

**Files:**
- Modify: `src/renderer/components/voice/KeyboardControlSettings.tsx`
- Create: `src/renderer/components/voice/KeyboardControlSettings.test.tsx`
- Reference: `src/shared/defaults/keyboard-shortcuts.ts`
- Reference: `src/shared/voice-key-reference.ts`
- Reference: `src/renderer/components/voice/KeyboardShortcutRecorder.tsx`

- [ ] **Step 1: Write the failing settings integration tests**

创建 `src/renderer/components/voice/KeyboardControlSettings.test.tsx`，至少覆盖：

```tsx
it('creates a custom shortcut using recordedKeys instead of rebuilding keyCodes locally', async () => {
  render(
    <KeyboardControlSettings
      keyboardShortcuts={[]}
      onKeyboardDriverPathChange={vi.fn()}
      onKeyboardShortcutsChange={onKeyboardShortcutsChange}
    />
  )

  await user.click(screen.getByRole('button', { name: '添加快捷键' }))
  await user.type(screen.getByLabelText('名称'), '粘贴')
  await user.type(screen.getByLabelText('触发词（逗号分隔）'), '粘贴')

  await user.click(screen.getByRole('button', { name: '录制' }))
  fireEvent.keyDown(window, { code: 'ControlLeft', key: 'Control' })
  fireEvent.keyDown(window, { code: 'KeyV', key: 'v' })
  fireEvent.keyUp(window, { code: 'KeyV', key: 'v' })

  await user.click(screen.getByRole('button', { name: '确认添加' }))

  expect(onKeyboardShortcutsChange).toHaveBeenCalledWith([
    expect.objectContaining({
      triggerWords: ['粘贴'],
      recordedKeys: ['ControlLeft', 'KeyV'],
      keyCodes: [],
    }),
  ])
})

it('shows a warning when recorded keys do not have stable HID coverage', async () => {
  render(
    <KeyboardControlSettings
      keyboardShortcuts={[
        {
          id: 'ks_unknown',
          name: '日文键',
          triggerWords: ['日文键'],
          recordedKeys: ['IntlRo'],
          keyCodes: [],
          enabled: true,
        },
      ]}
      onKeyboardDriverPathChange={vi.fn()}
      onKeyboardShortcutsChange={vi.fn()}
    />
  )

  expect(screen.getByText('该键当前没有稳定 HID 映射，执行可能失败')).toBeInTheDocument()
})

it('keeps legacy shortcuts with keyCodes readable until the user re-records them', async () => {
  render(
    <KeyboardControlSettings
      keyboardShortcuts={[
        {
          id: 'ks_legacy',
          name: '粘贴',
          triggerWords: ['粘贴'],
          keyCodes: ['110700E0', '11070019', '10070019', '100700E0'],
          enabled: true,
        },
      ]}
      onKeyboardDriverPathChange={vi.fn()}
      onKeyboardShortcutsChange={vi.fn()}
    />
  )

  expect(screen.getByText('旧版配置：当前仅保存 keyCodes，重新录制后可升级为真实键名配置')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the targeted settings test to verify RED**

Run:

```bash
pnpm exec vitest run src/renderer/components/voice/KeyboardControlSettings.test.tsx
```

Expected:

```text
FAIL because KeyboardControlSettings still uses KeyComboBuilder and does not save recordedKeys
```

- [ ] **Step 3: Implement the minimal settings refactor**

在 `src/renderer/components/voice/KeyboardControlSettings.tsx` 中：

1. 删除内部 `KeyComboBuilder` 相关状态和候选分类 UI
2. 新建/编辑快捷键时改用：

```ts
recordedKeys: newRecordedKeys,
keyCodes: [],
```

3. 列表展示优先级：

```ts
const displayKeys = shortcut.recordedKeys ?? []
const isLegacyShortcut = !shortcut.recordedKeys?.length && shortcut.keyCodes.length > 0
const showUnstableWarning = shortcut.recordedKeys?.length
  ? !hasStableHidMapping(shortcut.recordedKeys)
  : false
```

4. 为 legacy 数据保留只读 `keyCodes` 展示
5. 当用户重新录制 legacy 数据时，用新的 `recordedKeys` 覆盖，保留 `keyCodes: []`
6. 保持“恢复默认”逻辑继续使用 `getDefaultKeyboardShortcuts(platformType)`，因为 `keyboard-shortcuts.ts` 不能改
7. 默认快捷键和旧数据会走 legacy 展示文案，这是本轮接受的兼容策略

需要的 UI 文案：

```text
旧版配置：当前仅保存 keyCodes，重新录制后可升级为真实键名配置
该键当前没有稳定 HID 映射，执行可能失败
```

- [ ] **Step 4: Run the targeted settings test to verify GREEN**

Run:

```bash
pnpm exec vitest run src/renderer/components/voice/KeyboardControlSettings.test.tsx src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx src/shared/voice-key-reference.test.ts
```

Expected:

```text
PASS the settings integration tests and the dependent recorder/shared tests
```

- [ ] **Step 5: Commit the settings slice**

```bash
git add src/renderer/components/voice/KeyboardControlSettings.tsx src/renderer/components/voice/KeyboardControlSettings.test.tsx
git commit -m "feat(voice): 改造键盘快捷键录制设置"
```

## Task 4: Inject `recordedKeys` And HID Reference Into Angrymiao Skill Prompt

**Files:**
- Modify: `src/renderer/packages/agent-skills/angrymiao-voice-control.ts`
- Modify: `src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts`
- Create: `voice-app/skill-bundles/angrymiao-voice-control/docs/keyboard-hid-reference.md`
- Reference: `voice-app/skill-bundles/angrymiao-voice-control/SKILL.md`

- [ ] **Step 1: Write the failing prompt injection tests**

扩展 `src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts`：

```ts
it('injects recordedKeys alongside legacy keyCodes for user shortcuts', () => {
  const prompt = buildAngrymiaoAgentSkillPrompt(
    'win32',
    undefined,
    [
      {
        id: 'ks_custom_paste',
        name: '粘贴',
        triggerWords: ['粘贴'],
        recordedKeys: ['ControlLeft', 'KeyV'],
        keyCodes: [],
        enabled: true,
      },
    ],
    '## Keyboard HID Reference\n\n| Key | HID |\n| --- | --- |\n| KeyV | 070019 |'
  )

  expect(prompt).toContain('User Configured Shortcut Mapping')
  expect(prompt).toContain('| Trigger words | recordedKeys | keyCodes |')
  expect(prompt).toContain('["ControlLeft","KeyV"]')
})

it('appends HID reference guidance to the final prompt', () => {
  const prompt = buildAngrymiaoAgentSkillPrompt(
    'win32',
    undefined,
    [],
    '## Keyboard HID Reference\n\n| Key | HID |\n| --- | --- |\n| KeyA | 070004 |'
  )

  expect(prompt).toContain('Keyboard HID Reference')
  expect(prompt).toContain('KeyA | 070004')
  expect(prompt).toContain('若 reference 中没有稳定映射，不要伪造高风险键码')
})
```

- [ ] **Step 2: Run the targeted skill test to verify RED**

Run:

```bash
pnpm exec vitest run src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts
```

Expected:

```text
FAIL because the prompt only includes keyCodes and has no HID reference section
```

- [ ] **Step 3: Add the bundle reference doc and prompt assembly**

创建 `voice-app/skill-bundles/angrymiao-voice-control/docs/keyboard-hid-reference.md`，最少包含：

```md
# Keyboard HID Reference

## Encoding Rules

- `11 + HID` means key down
- `10 + HID` means key up
- For combinations, press modifier keys first, then the normal key, then release the normal key, then release modifiers in reverse order

## Common Keys

| KeyboardEvent.code | HID |
| --- | --- |
| KeyA | 070004 |
| KeyC | 070006 |
| KeyV | 070019 |
| KeyX | 07001B |
| KeyY | 07001C |
| KeyZ | 07001D |
| Digit1 | 07001E |
| Enter | 070028 |
| Escape | 070029 |
| Tab | 07002B |
| ControlLeft | 0700E0 |
| ShiftLeft | 0700E1 |
| AltLeft | 0700E2 |
| MetaLeft | 0700E3 |
```

然后改 `src/renderer/packages/agent-skills/angrymiao-voice-control.ts`：

1. 扩展 `buildAngrymiaoAgentSkillPrompt()` 签名：

```ts
export function buildAngrymiaoAgentSkillPrompt(
  platformType: string,
  template: string = DEFAULT_PROMPT_TEMPLATE,
  keyboardShortcuts: KeyboardShortcut[] = [],
  hidReference = ''
): string
```

2. 用户快捷键表改成三列：

```md
| Trigger words | recordedKeys | keyCodes |
| --- | --- | --- |
| 粘贴 | ["ControlLeft","KeyV"] | [] |
```

3. 在 user shortcut block 下增加规则：

```md
- 命中用户自定义 trigger words 时，优先参考 recordedKeys。
- 若 recordedKeys 对应的键在 HID reference 中可找到稳定映射，则生成 keyCodes 后调用 `mcp__system-control__keyboard_control`。
- 若 reference 中不存在稳定映射，可谨慎处理，但不要伪造高风险键码。
```

4. 在 `resolveAgentSkillPrompt()` 中额外读取：

```ts
const hidReference = await readSkillBundleTextFile(manifest.id, 'docs/keyboard-hid-reference.md')
```

5. 再把 `hidReference` 传给 `buildAngrymiaoAgentSkillPrompt()`

不要修改 MCP runtime 和 `keyboard_control` 参数。

- [ ] **Step 4: Run the targeted skill test to verify GREEN**

Run:

```bash
pnpm exec vitest run src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts
```

Expected:

```text
PASS with recordedKeys column and HID reference section present
```

- [ ] **Step 5: Commit the skill prompt slice**

```bash
git add src/renderer/packages/agent-skills/angrymiao-voice-control.ts src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts voice-app/skill-bundles/angrymiao-voice-control/docs/keyboard-hid-reference.md
git commit -m "feat(voice): 注入录制键名与HID参考"
```

## Task 5: Final Verification

**Files:**
- Modify: none
- Test: changed files only

- [ ] **Step 1: Run the focused automated verification**

```bash
pnpm exec vitest run src/shared/voice-key-reference.test.ts src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx src/renderer/components/voice/KeyboardControlSettings.test.tsx src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 2: Run focused static checks on changed files**

```bash
pnpm exec biome check src/shared/types/voice.ts src/shared/voice-key-reference.ts src/shared/voice-key-reference.test.ts src/renderer/components/voice/KeyboardShortcutRecorder.tsx src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx src/renderer/components/voice/KeyboardControlSettings.tsx src/renderer/components/voice/KeyboardControlSettings.test.tsx src/renderer/packages/agent-skills/angrymiao-voice-control.ts src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts
```

Expected:

```text
Checked N files. No errors.
```

- [ ] **Step 3: Run repository typecheck signal**

```bash
pnpm check
```

Expected:

- PASS，或
- FAIL 但必须明确区分是否命中新改文件

- [ ] **Step 4: Manual smoke test in the app**

至少验证：

1. 在语音设置页新增一个键盘快捷键，点击“录制”后按下 `A`，可保存为 `recordedKeys: ["KeyA"]`
2. 录制 `CtrlLeft + V` 后列表展示 `CtrlLeft + V`，保存结果包含 `recordedKeys` 且不再依赖本地重算 `keyCodes`
3. 录制超过 6 个键时，UI 显示“最多录制 6 个键”
4. 录制 `IntlRo` 等未知稳定映射键时，允许保存，但能看到“该键当前没有稳定 HID 映射，执行可能失败”
5. 默认快捷键和旧配置项仍可显示与启用，并带有 legacy 提示
6. 重新录制一个 legacy 项后，该项转成 `recordedKeys` 形式
7. 构建 skill prompt 时能看到 `recordedKeys` 列和 `Keyboard HID Reference` 文本

- [ ] **Step 5: Final commit**

```bash
git add src/shared/types/voice.ts src/shared/voice-key-reference.ts src/shared/voice-key-reference.test.ts src/renderer/components/voice/KeyboardShortcutRecorder.tsx src/renderer/components/voice/KeyboardShortcutRecorder.test.tsx src/renderer/components/voice/KeyboardControlSettings.tsx src/renderer/components/voice/KeyboardControlSettings.test.tsx src/renderer/packages/agent-skills/angrymiao-voice-control.ts src/renderer/packages/agent-skills/angrymiao-voice-control.test.ts voice-app/skill-bundles/angrymiao-voice-control/docs/keyboard-hid-reference.md
git commit -m "feat(voice): 改造键盘快捷键录制链路"
```

## Notes For Execution

- 这是一个低入侵实现计划，故意不覆盖“按住 / 松开 / release_all”状态机。
- 如果执行中发现 `keyboard_control` 工具或 skill runtime 需要跨轮次按键状态支持，应停止当前计划，先回到 spec 再谈协议变更。
- `writing-plans` skill 默认要求 plan reviewer 子代理；当前会话未获显式子代理授权，因此执行本计划时改为人工复核 plan 与实现结果，不额外派发 reviewer agent。
