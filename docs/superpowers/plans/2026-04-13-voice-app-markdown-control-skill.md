# Voice App Markdown Control Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Markdown 风格的通用 control skill 文本取代 MCP 页里的逐条快捷键配置，并让程序在执行侧把 `shortcut / recordedKeys` 翻译成 `keyCodes` 后继续走现有 USB 键盘驱动链路。

**Architecture:** 以 `control_skill_markdown` 作为新的用户主配置源，存储和快照层仍由 `settings-core` 负责，设置页只暴露文本编辑入口。`llm-core` 负责把该文本注入最终 system prompt 并提示模型优先输出规范化按键表达；`system-control-mcp` 负责把 `shortcut / recordedKeys` 解析成 `keyCodes`，再复用现有 `driver.exe -k ...keyCodes` 执行。

**Tech Stack:** Tauri desktop app, React 18, Vitest, Rust workspace (`settings-core`, `llm-core`), Node runtime + zod + esbuild for `system-control-mcp`

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `voice-app/crates/settings-core/src/model.rs` | 为 `StoredVoiceSettings` / `EditableVoiceSettings` / `SaveEditableVoiceSettingsInput` 增加 `control_skill_markdown`，维护默认值与 snapshot 转换 |
| `voice-app/crates/settings-core/src/store.rs` | 让 `apply_input()` 和 `snapshot()` 正确保存/回放 `control_skill_markdown`，并保留旧 `keyboard_shortcuts` 的兼容行为 |
| `voice-app/crates/settings-core/tests/settings_defaults.rs` | 锁定默认值、序列化结果与 editable snapshot 中的新字段 |
| `voice-app/crates/settings-core/tests/settings_store.rs` | 锁定新字段的保存、更新与旧数据兼容 |
| `voice-app/apps/desktop/src/lib/tauri.ts` | 同步前端 settings 类型定义 |
| `voice-app/apps/desktop/src/test/setup.ts` | 更新前端测试桩：默认 settings、保存输入、MCP runtime mock |
| `voice-app/apps/desktop/src/features/settings/ControlSkillMarkdownSettings.tsx` | 新的 Markdown 风格 control skill 编辑组件 |
| `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx` | 在 `mcp` 页签里移除 `KeyboardShortcutSettings`，换成新的文本编辑组件 |
| `voice-app/apps/desktop/src/features/settings/validation.ts` | 停止对隐藏的 `keyboard_shortcuts` 做前端阻塞校验 |
| `voice-app/apps/desktop/src/styles.css` | 给新编辑区补充说明区、示例按钮、提示样式 |
| `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx` | 将“添加自定义快捷键”测试改成“保存 control skill markdown”，并校验 payload |
| `voice-app/crates/llm-core/src/system_prompt.rs` | 注入 `control_skill_markdown`，提示模型优先传 `shortcut` 而不是直接构造 hex `keyCodes` |
| `voice-app/crates/llm-core/tests/openai_compatible.rs` | 锁定最终 prompt 中的新 control skill 文本块 |
| `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/shortcut-mapping.cjs` | 解析 `F5` / `Ctrl+S` / `Alt+Tab` 等规范化按键表达，并生成 `recordedKeys` / `keyCodes` |
| `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/shortcut-mapping.test.cjs` | 用 Node 内置测试框架覆盖翻码 helper |
| `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/index.ts` | 扩展 `keyboard_control` 入参协议，接受 `shortcut` / `recordedKeys` / `keyCodes` |
| `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/keyboard.ts` | 在真正调用 driver 前统一解析出最终 `keyCodes` |
| `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/dist/index.js` | 通过构建脚本同步产出的运行时 bundle，避免改了 `src/` 不生效 |

> 说明：本计划不删除 `KeyboardShortcutSettings.tsx` 与 `keyboardShortcuts.ts`，先把它们降级为未挂载的兼容代码，避免把本轮范围扩成“UI 替换 + 历史快捷键迁移 + 代码清理”三件事。

---

### Task 1: 扩展 settings-core 与前端桥接类型，建立 `control_skill_markdown`

**Files:**
- Modify: `voice-app/crates/settings-core/src/model.rs`
- Modify: `voice-app/crates/settings-core/src/store.rs`
- Test: `voice-app/crates/settings-core/tests/settings_defaults.rs`
- Test: `voice-app/crates/settings-core/tests/settings_store.rs`
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`

- [ ] **Step 1: 在 `settings_defaults.rs` 里写失败测试，锁定默认值和 editable snapshot**

```rust
#[test]
fn defaults_include_empty_control_skill_markdown() {
    let settings = StoredVoiceSettings::default();
    let serialized = serde_json::to_value(&settings).expect("settings should serialize");

    assert_eq!(settings.control_skill_markdown, "");
    assert_eq!(serialized["control_skill_markdown"], "");
}

#[test]
fn editable_settings_expose_control_skill_markdown() {
    let settings = StoredVoiceSettings::default();
    let editable = EditableVoiceSettings::from_settings(&settings);
    let serialized = serde_json::to_value(&editable).expect("editable settings should serialize");

    assert_eq!(editable.control_skill_markdown, "");
    assert_eq!(serialized["control_skill_markdown"], "");
}
```

- [ ] **Step 2: 运行 defaults 测试，确认因字段缺失而失败**

Run:

```bash
cargo test --manifest-path voice-app/Cargo.toml -p settings-core defaults_include_empty_control_skill_markdown -- --exact
```

Expected: 编译失败或测试失败，提示 `control_skill_markdown` 字段不存在。

- [ ] **Step 3: 在 `settings_store.rs` 里写失败测试，锁定保存路径**

```rust
#[test]
fn save_updates_control_skill_markdown() {
    let current = StoredVoiceSettings::default();
    let markdown = "# 我的控制技能\n\n刷新页面时用 F5".to_string();

    let updated = SettingsStore::apply_input(
        &current,
        SaveEditableVoiceSettingsInput {
            control_skill_markdown: markdown.clone(),
            ..SaveEditableVoiceSettingsInput::from_settings(&current)
        },
    )
    .expect("control skill markdown should save");

    assert_eq!(updated.control_skill_markdown, markdown);
    assert_eq!(updated.keyboard_shortcuts, current.keyboard_shortcuts);
}
```

- [ ] **Step 4: 运行 store 测试，确认失败**

Run:

```bash
cargo test --manifest-path voice-app/Cargo.toml -p settings-core save_updates_control_skill_markdown -- --exact
```

Expected: 编译失败或测试失败，提示 `SaveEditableVoiceSettingsInput` / `StoredVoiceSettings` 中缺少 `control_skill_markdown`。

- [ ] **Step 5: 在 `model.rs` 中为 3 个 settings 结构体增加字段与默认值**

```rust
pub struct StoredVoiceSettings {
    // ...
    pub angrymiao_skill_enabled: bool,
    pub keyboard_driver_path: String,
    pub keyboard_shortcuts: Vec<KeyboardShortcut>,
    pub control_skill_markdown: String,
    pub mcp_servers: Vec<McpServerConfig>,
}

pub struct EditableVoiceSettings {
    // ...
    pub keyboard_driver_path: String,
    pub keyboard_shortcuts: Vec<KeyboardShortcut>,
    pub control_skill_markdown: String,
    pub mcp_servers_json: String,
}

pub struct SaveEditableVoiceSettingsInput {
    // ...
    pub keyboard_driver_path: String,
    pub keyboard_shortcuts: Vec<KeyboardShortcut>,
    pub control_skill_markdown: String,
    pub mcp_servers_json: String,
}
```

并同步更新：

- `StoredVoiceSettings::default()`
- `EditableVoiceSettings::from_settings()`
- `SaveEditableVoiceSettingsInput::from_settings()`
- `SaveEditableVoiceSettingsInput::from_snapshot()`

- [ ] **Step 6: 在 `store.rs` 中把新字段串过保存与 snapshot 流程**

```rust
let updated = StoredVoiceSettings {
    // ...
    keyboard_driver_path: input.keyboard_driver_path,
    keyboard_shortcuts: sanitize_keyboard_shortcuts(input.keyboard_shortcuts),
    control_skill_markdown: input.control_skill_markdown,
    mcp_servers,
};
```

不要在 `apply_input()` 里解析 Markdown；只做字符串透传，保持旧 `keyboard_shortcuts` 校验逻辑仍在 Rust 侧生效。

- [ ] **Step 7: 同步 `tauri.ts` 与 `test/setup.ts` 类型与默认测试数据**

```ts
export type EditableVoiceSettings = {
  // ...
  keyboard_driver_path: string
  keyboard_shortcuts: KeyboardShortcut[]
  control_skill_markdown: string
  mcp_servers_json: string
}

export type SaveEditableVoiceSettingsInput = {
  // ...
  keyboard_driver_path: string
  keyboard_shortcuts: KeyboardShortcut[]
  control_skill_markdown: string
  mcp_servers_json: string
}
```

`createDefaultEditableSettings()` 中先把 `control_skill_markdown` 设为 `''`，不要默认注入示例文本，否则会让未配置用户意外拥有默认快捷键偏好。

- [ ] **Step 8: 跑完整的 settings-core 测试，确认新字段与旧快捷键兼容同时成立**

Run:

```bash
cargo test --manifest-path voice-app/Cargo.toml -p settings-core
```

Expected: PASS，包含新加的 defaults/store 测试。

- [ ] **Step 9: 提交数据模型与桥接层改动**

```bash
git add \
  voice-app/crates/settings-core/src/model.rs \
  voice-app/crates/settings-core/src/store.rs \
  voice-app/crates/settings-core/tests/settings_defaults.rs \
  voice-app/crates/settings-core/tests/settings_store.rs \
  voice-app/apps/desktop/src/lib/tauri.ts \
  voice-app/apps/desktop/src/test/setup.ts
git commit -m "feat(settings): 新增控制技能 Markdown 字段"
```

---

### Task 2: 替换 MCP 页签 UI，用 Markdown 编辑器取代结构化快捷键表单

**Files:**
- Create: `voice-app/apps/desktop/src/features/settings/ControlSkillMarkdownSettings.tsx`
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/settings/validation.ts`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`

- [ ] **Step 1: 把现有“添加自定义快捷键”测试改成失败的 Markdown 保存测试**

将 `app-shell.test.tsx` 中的
`it('adds a custom keyboard shortcut and includes it in the saved settings', ...)`
改成：

```tsx
it('edits control skill markdown and includes it in the saved settings', async () => {
  render(<App />)
  const section = await openMainPanel('设置')
  await openSettingsSection('MCP')

  fireEvent.change(await section.findByLabelText('控制 Skill 指令'), {
    target: { value: '# 我的控制技能\n\n刷新页面时用 F5' },
  })

  fireEvent.click(section.getByRole('button', { name: '保存设置' }))

  await waitFor(() => {
    expect(invoke).toHaveBeenCalledWith(
      'save_editable_settings',
      expect.objectContaining({
        input: expect.objectContaining({
          control_skill_markdown: '# 我的控制技能\n\n刷新页面时用 F5',
        }),
      }),
    )
  })
})
```

同时把通用保存测试里的 payload 断言补成：

```tsx
control_skill_markdown: expect.any(String),
```

- [ ] **Step 2: 运行前端测试，确认因新字段和新控件缺失而失败**

Run:

```bash
pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx -t "edits control skill markdown and includes it in the saved settings"
```

Expected: FAIL，找不到 `控制 Skill 指令` 输入框，或 `save_editable_settings` payload 缺少 `control_skill_markdown`。

- [ ] **Step 3: 新建 `ControlSkillMarkdownSettings.tsx`，只负责文本编辑与示例插入**

```tsx
type ControlSkillMarkdownSettingsProps = {
  value: string
  onChange: (value: string) => void
}

const DEFAULT_CONTROL_SKILL_EXAMPLE = `# 我的控制技能

刷新页面时用 F5
保存时用 Ctrl+S
切换窗口时用 Alt+Tab

如果涉及危险操作，先征求确认。
打开网页时优先使用 Edge。`

export function ControlSkillMarkdownSettings({
  value,
  onChange,
}: ControlSkillMarkdownSettingsProps) {
  return (
    <div className="settings-input-card settings-input-card-wide control-skill-card">
      <div className="control-skill-header">
        <div>
          <span className="settings-input-title">控制 Skill 指令</span>
          <p className="control-skill-hint">
            这里的文本会进入运行时系统提示。可以写快捷键语义、浏览器偏好、确认规则等。
          </p>
        </div>
        <div className="control-skill-actions">
          <Button type="button" variant="outline" onClick={() => onChange(DEFAULT_CONTROL_SKILL_EXAMPLE)}>
            插入示例
          </Button>
          <Button type="button" variant="outline" onClick={() => onChange('')}>
            清空
          </Button>
        </div>
      </div>

      <Textarea
        aria-label="控制 Skill 指令"
        className="settings-textarea-field control-skill-editor"
        placeholder={DEFAULT_CONTROL_SKILL_EXAMPLE}
        rows={12}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
```

关键约束：

- `placeholder` 展示示例，但默认保存值保持空字符串
- 不做 Markdown 解析，不做实时预览
- 不在组件里碰 `keyboard_shortcuts`

- [ ] **Step 4: 在 `SettingsPanel.tsx` 里替换掉 `KeyboardShortcutSettings`**

最小 JSX 目标：

```tsx
<SkillBundleInventory
  skillEnabled={draft.angrymiao_skill_enabled}
  onSkillEnabledChange={(checked) => updateDraft('angrymiao_skill_enabled', checked)}
  disabled={isBusy}
/>

<div className="settings-input-card">
  <span className="settings-input-title">键盘驱动路径</span>
  <Input
    aria-label="键盘驱动路径"
    className="settings-input-field"
    value={draft.keyboard_driver_path}
    onChange={(event) => updateDraft('keyboard_driver_path', event.target.value)}
  />
</div>

<ControlSkillMarkdownSettings
  value={draft.control_skill_markdown}
  onChange={(value) => updateDraft('control_skill_markdown', value)}
/>
```

同时：

- 删除 `KeyboardShortcutSettings` 的 import 和挂载
- 保留 `keyboard_driver_path`
- 保留 `SkillBundleInventory`

- [ ] **Step 5: 在 `validation.ts` 里停止对隐藏字段 `keyboard_shortcuts` 做阻塞校验**

把这一段删掉：

```ts
if (!isValidKeyboardShortcuts(draft.keyboard_shortcuts)) {
  errors.keyboard_shortcuts = '键盘快捷键映射格式无效。'
}
```

不要给 `control_skill_markdown` 加结构化校验；最多保留一个非阻塞长度限制 warning，但不要让它影响保存按钮。

- [ ] **Step 6: 在 `styles.css` 中补上新编辑区样式**

```css
.control-skill-card {
  display: grid;
  gap: 14px;
}

.control-skill-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.control-skill-actions {
  display: flex;
  gap: 8px;
}

.control-skill-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(71, 85, 105, 0.86);
}

.control-skill-editor {
  min-height: 260px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}
```

- [ ] **Step 7: 跑前端设置页测试，确认新的保存链路通过**

Run:

```bash
pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx
```

Expected: PASS，尤其是新的 Markdown 保存测试与现有 `save_editable_settings` payload 断言。

- [ ] **Step 8: 提交设置页替换改动**

```bash
git add \
  voice-app/apps/desktop/src/features/settings/ControlSkillMarkdownSettings.tsx \
  voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx \
  voice-app/apps/desktop/src/features/settings/validation.ts \
  voice-app/apps/desktop/src/styles.css \
  voice-app/apps/desktop/src/__tests__/app-shell.test.tsx \
  voice-app/apps/desktop/src/test/setup.ts
git commit -m "feat(settings): 替换为控制技能文本配置"
```

---

### Task 3: 调整 llm prompt，让模型优先输出 `shortcut`

**Files:**
- Modify: `voice-app/crates/llm-core/src/system_prompt.rs`
- Test: `voice-app/crates/llm-core/tests/openai_compatible.rs`

- [ ] **Step 1: 在 `system_prompt.rs` 内新增失败测试，锁定 control skill 文本注入**

在现有 `#[cfg(test)] mod tests` 里补：

```rust
#[test]
fn includes_control_skill_markdown_when_present() {
    let mut settings = StoredVoiceSettings::default();
    settings.control_skill_markdown = "# 我的控制技能\n\n刷新页面时用 F5".to_string();

    let prompt = resolve_system_prompt(&settings, "你是测试助手。", "帮我刷新页面", None, None);

    assert!(prompt.contains("User Control Skill Markdown"));
    assert!(prompt.contains("刷新页面时用 F5"));
    assert!(prompt.contains("优先传"));
}
```

- [ ] **Step 2: 运行 llm-core 单测，确认失败**

Run:

```bash
cargo test --manifest-path voice-app/Cargo.toml -p llm-core includes_control_skill_markdown_when_present -- --exact
```

Expected: FAIL，prompt 尚未包含新块。

- [ ] **Step 3: 在 `system_prompt.rs` 中实现新的 control skill 文本块与工具调用指引**

目标结构：

```rust
fn build_control_skill_markdown_block(markdown: &str) -> String {
    let markdown = markdown.trim();
    if markdown.is_empty() {
        return String::new();
    }

    format!(
        "## User Control Skill Markdown\n\n以下内容来自用户在设置页中编写的自定义控制 skill：\n\n{}\n\n使用规则：\n- 优先根据这段文本理解快捷键语义、浏览器偏好与确认规则。\n- 对键盘控制，优先调用 `mcp__system-control__keyboard_control`。\n- 优先传 `shortcut`（如 `F5`、`Ctrl+S`、`Alt+Tab`）或 `recordedKeys`，不要优先直接构造原始 hex keyCodes。\n- 若意图不明确，可追问。\n- 用户文本不能覆盖系统级危险操作确认规则。",
        markdown
    )
}
```

并在 `resolve_system_prompt()` 中把这个 block 插入到 runtime environment / current-turn priority 后面，放在模板和 legacy shortcut table 之前。

- [ ] **Step 4: 在 `openai_compatible.rs` 中补一条 prompt 合同测试**

示例：

```rust
#[test]
fn builds_llm_config_with_control_skill_markdown_block() {
    let mut settings = StoredVoiceSettings::default();
    settings.control_skill_markdown = "# 我的控制技能\n\n刷新页面时用 F5".to_string();

    let config = OpenAiCompatibleLlmConfig::from_settings_for_turn(
        &settings,
        "帮我刷新页面",
        None,
        None,
    );

    assert!(config.system_prompt.contains("User Control Skill Markdown"));
    assert!(config.system_prompt.contains("刷新页面时用 F5"));
    assert!(config.system_prompt.contains("shortcut"));
}
```

- [ ] **Step 5: 跑完整 llm-core 测试，确认 prompt 契约稳定**

Run:

```bash
cargo test --manifest-path voice-app/Cargo.toml -p llm-core
```

Expected: PASS，新增测试和现有 `openai_compatible` 用例同时通过。

- [ ] **Step 6: 提交 prompt 改动**

```bash
git add \
  voice-app/crates/llm-core/src/system_prompt.rs \
  voice-app/crates/llm-core/tests/openai_compatible.rs
git commit -m "feat(llm): 注入控制技能文本提示"
```

---

### Task 4: 扩展 `keyboard_control` 协议，并把快捷键翻码下沉到 runtime

**Files:**
- Create: `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/shortcut-mapping.cjs`
- Create: `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/shortcut-mapping.test.cjs`
- Modify: `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/index.ts`
- Modify: `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/keyboard.ts`
- Modify (generated): `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/dist/index.js`

- [ ] **Step 1: 先写失败的 Node 单测，锁定 `F5` / `Ctrl+S` / 非法输入`**

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const {
  resolveKeyboardRequest,
} = require('./shortcut-mapping.cjs')

test('resolves F5 into recordedKeys and keyCodes', () => {
  assert.deepEqual(resolveKeyboardRequest({ shortcut: 'F5' }), {
    recordedKeys: ['F5'],
    keyCodes: ['1107003E', '1007003E'],
  })
})

test('resolves Ctrl+S into recordedKeys and keyCodes', () => {
  assert.deepEqual(resolveKeyboardRequest({ shortcut: 'Ctrl+S' }), {
    recordedKeys: ['ControlLeft', 'KeyS'],
    keyCodes: ['110700E0', '11070016', '10070016', '100700E0'],
  })
})

test('rejects unknown shortcut tokens', () => {
  assert.throws(
    () => resolveKeyboardRequest({ shortcut: '刷新一下' }),
    /无法解析快捷键表达/
  )
})
```

- [ ] **Step 2: 运行 node 测试，确认因为 helper 缺失而失败**

Run:

```bash
node --test voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/shortcut-mapping.test.cjs
```

Expected: FAIL，`shortcut-mapping.cjs` 不存在。

- [ ] **Step 3: 新建 `shortcut-mapping.cjs`，集中实现规范化与翻码**

至少提供：

```js
function normalizeShortcut(shortcut) {
  // "Ctrl+S" -> ["ControlLeft", "KeyS"]
}

function buildKeyCodesFromRecordedKeys(recordedKeys) {
  // ["ControlLeft", "KeyS"] -> ["110700E0", "11070016", "10070016", "100700E0"]
}

function resolveKeyboardRequest({ shortcut, recordedKeys, keyCodes }) {
  if (Array.isArray(keyCodes) && keyCodes.length > 0) {
    return { recordedKeys: recordedKeys || [], keyCodes }
  }
  if (Array.isArray(recordedKeys) && recordedKeys.length > 0) {
    return {
      recordedKeys,
      keyCodes: buildKeyCodesFromRecordedKeys(recordedKeys),
    }
  }
  if (typeof shortcut === 'string' && shortcut.trim()) {
    const normalized = normalizeShortcut(shortcut)
    return {
      recordedKeys: normalized,
      keyCodes: buildKeyCodesFromRecordedKeys(normalized),
    }
  }
  throw new Error('keyboard_control 至少需要 shortcut、recordedKeys 或 keyCodes 之一。')
}

module.exports = {
  normalizeShortcut,
  buildKeyCodesFromRecordedKeys,
  resolveKeyboardRequest,
}
```

第一版只支持：

- `F1-F12`
- `Ctrl / Alt / Shift / Cmd + 字母`
- `Alt+Tab`
- `Enter / Esc / Tab / Backspace`

- [ ] **Step 4: 改 `index.ts` 和 `keyboard.ts`，让 runtime 吃新协议但保留旧协议兼容**

`index.ts` 目标 schema：

```ts
inputSchema: z.object({
  shortcut: z.string().optional(),
  recordedKeys: z.array(z.string()).optional(),
  keyCodes: z.array(z.string()).optional(),
}).refine(
  (value) => Boolean(value.shortcut || value.recordedKeys?.length || value.keyCodes?.length),
  'keyboard_control 至少需要 shortcut、recordedKeys 或 keyCodes 之一。',
)
```

执行阶段：

```ts
const resolved = resolveKeyboardRequest({ shortcut, recordedKeys, keyCodes })
const result = await keyboardControl(DRIVER_PATH, resolved.keyCodes)
```

`keyboard.ts` 保持 `keyboardControl(driverPath, keyCodes)` 签名不变，不要让 driver 层知道 `shortcut`。

- [ ] **Step 5: 跑 helper 单测并重建运行时 bundle**

Run:

```bash
node --test voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/shortcut-mapping.test.cjs
node voice-app/skill-bundles/angrymiao-voice-control/scripts/build-runtime.cjs
```

Expected:

- Node 单测 PASS
- `dist/index.js` 被重新生成

- [ ] **Step 6: 目视确认 `dist/index.js` 已包含新协议关键词**

Run:

```bash
Select-String -Path voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/dist/index.js -Pattern "shortcut|recordedKeys"
```

Expected: 命中 `shortcut` / `recordedKeys` 相关字符串。

- [ ] **Step 7: 提交 runtime 翻码改动**

```bash
git add \
  voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/shortcut-mapping.cjs \
  voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/shortcut-mapping.test.cjs \
  voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/index.ts \
  voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/keyboard.ts \
  voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/dist/index.js
git commit -m "feat(runtime): 支持快捷键文本翻码执行"
```

---

## Final Verification

- [ ] **Step 1: 跑 Rust 回归**

```bash
cargo test --manifest-path voice-app/Cargo.toml -p settings-core
cargo test --manifest-path voice-app/Cargo.toml -p llm-core
```

Expected: PASS

- [ ] **Step 2: 跑前端回归**

```bash
pnpm --dir voice-app/apps/desktop test
pnpm --dir voice-app/apps/desktop build
```

Expected: PASS

- [ ] **Step 3: 跑 runtime helper 测试并重建 dist**

```bash
node --test voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/shortcut-mapping.test.cjs
node voice-app/skill-bundles/angrymiao-voice-control/scripts/build-runtime.cjs
```

Expected: PASS

- [ ] **Step 4: 原生 smoke**

```bash
pnpm --dir voice-app/apps/desktop exec tauri dev
```

手动验证：

1. 打开 `设置 -> MCP`
2. 在“控制 Skill 指令”中输入：

```md
刷新页面时用 F5
保存时用 Ctrl+S
```

3. 保存设置
4. 发起一次语音请求，例如“帮我刷新一下页面”
5. 在 runtime log / 工具执行日志中确认：
   - 选择了 `mcp__system-control__keyboard_control`
   - 最终使用的不是裸文本“刷新一下”，而是翻译后的快捷键
   - driver 收到 F5 对应键码序列

---

## Self-Review Checklist

| Spec 要求 | Plan 覆盖 |
|-----------|----------|
| 移除结构化快捷键 UI | Task 2 |
| 新增 Markdown 风格 control skill 文本区 | Task 2 |
| 新增 `control_skill_markdown` 作为主配置源 | Task 1 |
| 不在保存阶段解析用户文本 | Task 1 / Task 2 / Task 3 |
| LLM 理解语义，程序负责翻码 | Task 3 / Task 4 |
| `keyboard_control` 扩为兼容式协议 | Task 4 |
| 继续保留旧 `keyCodes` 执行链路 | Task 4 |
| 前端隐藏 legacy `keyboard_shortcuts` 不再阻塞保存 | Task 2 |

**Placeholder 检查:** ✓ 无 TBD/TODO  
**生成产物检查:** ✓ `dist/index.js` 已在 Task 4 中明确同步  
**风险点检查:** ✓ 旧 `keyboard_shortcuts` 保留但不再作为 UI 主入口
