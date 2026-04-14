---
name: voice-app-markdown-control-skill
description: 用 Markdown 风格通用 skill 文本取代逐条快捷键设置，并将按键翻码下沉到执行侧
type: project
---

# Voice App Markdown Control Skill 设计方案

## 概述

对 voice-app 桌面端设置页中的 MCP 配置区进行重构：

1. 移除当前逐条编辑的“快捷键映射”设置区域
2. 新增一块 Markdown 风格的通用 control skill 文本编辑区
3. 将这块文本作为用户自定义控制意图的唯一真源
4. 运行时由 LLM 理解用户文本和对话语义
5. 最终由程序将规范化按键表达转换成 `keyCodes`
6. 继续通过现有 USB 键盘驱动 MCP 执行键盘输出

**Why:** 当前的 `KeyboardShortcutSettings` 更适合结构化快捷键维护，不适合承载“快捷键语义 + 通用行为偏好 + 危险操作确认规则”这类混合控制逻辑。用户已经明确倾向于自由文本方式，希望保留 LLM 的理解能力，但不希望依赖 LLM 直接生成底层 hex `keyCodes`。

**How to apply:** 在设置层引入 `control_skill_markdown`，替换现有快捷键表单入口；在运行时 prompt 中注入该文本；扩展 `keyboard_control` 协议，使程序可根据模型返回的规范化按键表达自行完成 `keyCodes` 生成，再调用现有驱动。

## 用户确认的目标

本轮设计范围内，用户已确认以下目标：

1. 设置页取消逐条快捷键映射配置区域
2. 新增一块 Markdown 风格的文本编辑区，承载通用 control skill 指令
3. 文本内容既可描述快捷键语义，也可描述通用行为偏好与确认规则
4. 不强制解析或编译用户写入的设置文本
5. 运行时由 LLM 理解“刷新”“保存”等控制语义
6. 程序负责把 `F5`、`Ctrl+S`、`Alt+Tab` 等规范化按键表达转换为 `keyCodes`
7. 底层 USB 键盘驱动链路继续保留

## 非目标

本轮不包含以下内容：

1. 不引入完整的用户 DSL / 编译器体系
2. 不在设置保存阶段对 Markdown 文本做强格式校验
3. 不承诺在第一版中支持任意自然语言都能稳定映射到快捷键
4. 不移除或重写现有 MCP runtime 中的驱动执行逻辑
5. 不把用户自定义文本作为系统安全规则的覆盖源

## 当前代码观察

### 1. MCP 设置页当前直接挂载结构化快捷键编辑器

`voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`

- `mcp` 页签中当前挂载了 `SkillBundleInventory`
- 同页签下继续挂载 `KeyboardShortcutSettings`
- `KeyboardShortcutSettings` 的入口位于 `SettingsPanel.tsx:591`

这说明现有设置页将“skill 启用状态”和“逐条快捷键映射编辑”耦合在同一配置区中。

### 2. 现有快捷键编辑器是结构化配置，不适合承载混合 skill 文本

`voice-app/apps/desktop/src/features/settings/KeyboardShortcutSettings.tsx`

- 当前编辑器围绕 `trigger_words / recorded_keys / key_codes / enabled` 结构工作
- 更适合配置“某个 trigger 对应某个快捷键”
- 不适合承载“危险操作前先确认”“打开网页优先 Edge”这类通用控制偏好

### 3. 现有 `keyboard_control` 工具只接受 `keyCodes`

`voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/index.ts`

- `keyboard_control` 的入参目前只有 `keyCodes: string[]`
- tool 描述要求传入 8 位 hex 编码，按下和抬起成对出现

这意味着如果继续维持当前协议，LLM 必须直接输出 hex `keyCodes`，稳定性会受模型影响。

### 4. 驱动执行逻辑已经稳定，不应在本轮推翻

`voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/keyboard.ts`

- `keyboardControl()` 最终执行 `driver.exe -k ...keyCodes`
- 当前 runtime 已经稳定承担 USB 键盘输出职责

因此本轮更适合在“工具参数层”和“运行时翻码层”扩展，而不是改驱动调用协议。

### 5. 前端已有 `recordedKeys -> keyCodes` 的映射能力，但位置不对

`voice-app/apps/desktop/src/features/settings/keyboardShortcuts.ts`

- 目前已经有 `buildKeyCodes(keys)` 逻辑
- 能把 `F5`、`Ctrl+S`、`Alt+Tab` 这类结构化按键转成 hex `keyCodes`

问题不是“能不能翻码”，而是这段逻辑现在停留在设置编辑层，不在真正的执行侧。

### 6. 现有 prompt 已经承担了控制意图注入职责

`voice-app/crates/llm-core/src/system_prompt.rs`

- 当前系统提示会注入快捷键控制相关说明
- 现有版本偏向展示结构化快捷键映射表
- 当前 turn 也已经存在“优先执行 keyboard_control”的强化逻辑

这说明本轮不需要新增一套新的 prompt 入口，只需要替换注入内容与工具使用约束。

## 已评估方案

### 方案 1：设置页自由文本，运行时由 LLM 直接生成 `keyCodes`

优点：

- 改动最小
- 不需要改 MCP tool 协议

缺点：

- 关键稳定性仍依赖模型直接生成 hex 编码
- 对 `F5`、`Ctrl+S`、`Alt+Tab` 这类规范键序列来说，不必要地把底层细节暴露给模型

### 方案 2：推荐方案

设置页自由文本，运行时由 LLM 理解语义并返回规范化按键表达，程序将其翻译成 `keyCodes` 后再调用现有驱动。

优点：

- 符合用户“让大模型理解”的要求
- 不需要程序去解析设置文本
- 将“按键翻码”从模型转回程序，稳定性更高
- 现有驱动链路可以保留

缺点：

- 需要扩展 `keyboard_control` 参数协议或增加同等适配层
- 需要把现有前端翻码逻辑下沉到执行侧

### 方案 3：对自由文本做编译，生成结构化快捷键表

优点：

- 长期可控性更高
- 运行时对模型依赖更少

缺点：

- 与用户当前偏好相反
- 会重新回到“拆解用户设置文本”的路线
- 第一版成本明显更高

## 结论

采用方案 2。

即：

1. 设置页只保留 Markdown 风格 control skill 文本区作为用户主配置源
2. 运行时将该文本直接注入系统提示
3. LLM 负责根据设置文本与当前对话理解控制意图
4. LLM 调用 `keyboard_control` 时优先传递规范化按键表达，而不是直接传 hex `keyCodes`
5. 程序在执行侧将规范化按键表达转换为 `keyCodes`
6. 驱动执行链继续使用现有 `driver.exe -k ...keyCodes`

## 设计总览

### 设计原则

1. 用户自定义控制逻辑以自由文本为主，不以结构化快捷键表为主
2. LLM 负责理解“要做什么”和“应该用哪个快捷键”
3. 程序负责把规范化按键表达翻译成 `keyCodes`
4. 系统级安全边界不允许被用户文本覆盖
5. 尽量复用现有 runtime、prompt 和驱动链路，避免高入侵改造

## 设置页设计

### 页面结构调整

`voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`

在 `mcp` 页签中做以下调整：

1. 保留 `SkillBundleInventory`
2. 保留键盘驱动路径配置
3. 移除 `KeyboardShortcutSettings`
4. 新增 `ControlSkillMarkdownSettings`

### 新组件职责

新增组件建议命名：

- `voice-app/apps/desktop/src/features/settings/ControlSkillMarkdownSettings.tsx`

职责：

1. 编辑 `control_skill_markdown`
2. 展示帮助说明与示例
3. 提供“插入示例”和“恢复默认示例”能力
4. 展示非阻塞型风险提示

### UI 形态

采用单栏编辑优先布局：

1. 标题：`控制 Skill 指令`
2. 副标题：说明该文本会进入运行时系统提示
3. 大块编辑区：使用现有 `Textarea` 风格扩展为 Markdown 风格编辑体验
4. 操作区：
   - `插入示例`
   - `恢复默认示例`
5. 辅助说明区：
   - 支持写快捷键语义映射
   - 支持写通用行为偏好
   - 支持写危险操作确认偏好

### 默认示例文案

建议默认示例：

```md
# 我的控制技能

刷新页面时用 F5
保存时用 Ctrl+S
切换窗口时用 Alt+Tab

如果涉及危险操作，先征求确认。
打开网页时优先使用 Edge。
```

### 为什么不做实时 Markdown 分栏预览

1. 当前桌面端没有现成 Markdown 编辑器依赖
2. 设置页的核心任务是配置，而不是文档排版
3. 单栏编辑更适合长文本控制指令
4. 第一版更应该把复杂度留给执行链路而不是 UI 渲染

## 数据模型设计

### 新增字段

在设置模型中新增：

```ts
control_skill_markdown: string
```

语义约定：

- 这是用户自定义 control skill 文本的唯一主配置源
- 文本允许混入快捷键映射、行为偏好、确认规则、浏览器偏好等内容
- 系统不会在保存阶段对其做结构化解析

### 旧字段角色调整

现有字段：

- `keyboard_driver_path`
- `keyboard_shortcuts`

调整策略：

1. `keyboard_driver_path` 继续保留，仍是执行驱动所需
2. `keyboard_shortcuts` 从“用户主配置源”降级为兼容字段
3. UI 不再继续暴露 `keyboard_shortcuts` 编辑入口

### 迁移策略

第一版采用保守迁移：

1. 不自动把旧 `keyboard_shortcuts` 转换成 Markdown 文本
2. 如果 `control_skill_markdown` 为空，则展示默认示例
3. 已有存储中的 `keyboard_shortcuts` 保留，但不再作为主入口使用
4. 后续若有需要，再评估是否增加“从旧配置生成 Markdown 草稿”的辅助迁移

## 运行时设计

### 运行时链路

目标链路：

```text
control_skill_markdown
  -> 注入最终 system prompt
  -> LLM 结合当前用户话术理解控制意图
  -> LLM 调用 keyboard_control，传规范化按键表达
  -> 程序将规范化按键表达转换成 keyCodes
  -> driver.exe 输出 USB 键码
```

### 系统提示注入

在现有 `resolve_system_prompt()` 链路中新增一段用户文本块，例如：

```md
## User Control Skill Markdown

以下内容来自用户在设置页中编写的自定义控制 skill：

{control_skill_markdown}
```

同时补充规则：

1. 用户文本可描述控制偏好与快捷键语义
2. 若用户文本和当前对话可以共同推出明确快捷键，应优先调用 `mcp__system-control__keyboard_control`
3. 对键盘控制，优先传规范化按键表达，而不是直接构造原始 hex `keyCodes`
4. 若意图不明确，可追问
5. 危险操作相关系统安全规则优先级高于用户自定义文本

### 与现有快捷键表的关系

第一版中：

1. 现有结构化快捷键表不再作为主配置入口
2. prompt 里的旧快捷键表注入逻辑需要降级或替换
3. 新 prompt 更偏向展示“用户控制 skill 文本”而非“结构化 trigger 表”

## `keyboard_control` 协议设计

### 当前协议

当前协议：

```ts
keyboard_control({ keyCodes: string[] })
```

### 推荐协议

建议扩展为兼容式协议：

```ts
keyboard_control({
  shortcut?: string,
  recordedKeys?: string[],
  keyCodes?: string[]
})
```

参数语义：

- `shortcut`
  - 用户级规范快捷键表达
  - 例如：`F5`、`Ctrl+S`、`Alt+Tab`
- `recordedKeys`
  - 内部标准键名数组
  - 例如：`["ControlLeft", "KeyS"]`
- `keyCodes`
  - 最终 hex 键码数组
  - 保留兼容旧行为

### 参数优先级

执行优先级建议为：

1. `keyCodes`
2. `recordedKeys`
3. `shortcut`

原因：

- 可完全兼容旧调用
- 允许未来逐步提升模型输出结构化程度
- 第一版模型可优先输出最容易稳定表达的 `shortcut`

### 为什么推荐模型优先输出 `shortcut`

1. 用户设置文本本身更接近 `F5`、`Ctrl+S` 这种表达
2. 模型不必学习浏览器级 `KeyboardEvent.code`
3. 程序更适合做规范化与翻码
4. 有利于减少模型直接输出 hex 的不稳定性

## 执行侧翻码设计

### 规范化流程

新增执行侧流程：

```text
shortcut
  -> normalizeShortcut()
  -> recordedKeys
  -> buildKeyCodes()
  -> driver.exe
```

### 建议支持的快捷键表达

第一版建议支持：

1. 功能键
   - `F1` 到 `F12`
2. 字母组合
   - `Ctrl+S`
   - `Ctrl+C`
   - `Ctrl+Shift+P`
3. 系统组合
   - `Alt+Tab`
   - `Ctrl+Tab`
4. 常用特殊键
   - `Enter`
   - `Esc`
   - `Tab`
   - `Backspace`

### 规范化策略

例如：

- `Ctrl+S` -> `["ControlLeft", "KeyS"]`
- `Alt+Tab` -> `["AltLeft", "Tab"]`
- `F5` -> `["F5"]`

### 代码复用策略

现有前端 `buildKeyCodes(keys)` 逻辑不应继续只停留在设置编辑层。

推荐做法：

1. 将规范化与翻码逻辑抽到 runtime 可复用位置
2. 前端与执行侧共享同一套翻码规则
3. 避免前端一套、runtime 一套导致不一致

第一版允许的实现方式包括：

1. 将现有逻辑提炼到共享模块
2. 在 runtime 侧新增一套与现有逻辑等价的轻量实现

原则是：

- 执行侧必须拥有独立的翻码能力
- 不能继续要求 LLM 直接输出最终 hex

## 安全边界

### 用户文本的权限边界

用户自定义 `control_skill_markdown` 可以影响：

1. 快捷键偏好
2. 浏览器或应用偏好
3. 控制行为表达风格
4. 是否倾向先确认某类操作

但不能覆盖：

1. 系统级危险操作保护
2. 现有必须确认的关机、重启等规则
3. 工具协议与运行时基本安全约束

### 冲突处理

若用户文本与系统规则冲突：

- 系统规则优先

若用户文本内部自相矛盾：

- 允许保存
- 运行时可能降低命中稳定性
- UI 仅做轻量提醒，不做强校验

## 失败处理

### 设置保存阶段

设置保存阶段对 `control_skill_markdown`：

1. 不做结构化解析
2. 不因语义模糊而阻止保存
3. 仅做空值、长度、基础输入合法性校验

### 运行时理解失败

如果模型无法从用户文本和当前对话中推出明确快捷键：

1. 允许追问
2. 不应伪造快捷键
3. 不应退回生成随机 `keyCodes`

### 翻码失败

若 `keyboard_control` 收到的 `shortcut` / `recordedKeys` 无法翻译：

1. 返回明确错误
2. 错误中指出无法解析的快捷键表达
3. 告知需要使用更规范的快捷键形式

建议错误文案示例：

`无法解析快捷键表达 "刷新一下"。请使用 F5 / Ctrl+S / Alt+Tab 这类规范形式。`

## 验证方案

本轮实现后至少需要验证：

### 设置页

1. `mcp` 页签不再显示 `KeyboardShortcutSettings`
2. 新 Markdown 文本区可编辑、可保存、可重置
3. `keyboard_driver_path` 仍可编辑并保存

### 数据层

1. `control_skill_markdown` 能正确落库与回读
2. 旧 `keyboard_shortcuts` 数据不因本轮改动而损坏

### Prompt

1. 最终 system prompt 中包含 `control_skill_markdown`
2. 旧结构化快捷键表提示不再作为主配置说明
3. 系统安全规则优先级仍然有效

### MCP runtime

1. `keyboard_control({ shortcut: "F5" })` 可执行
2. `keyboard_control({ shortcut: "Ctrl+S" })` 可执行
3. `keyboard_control({ keyCodes })` 旧协议仍兼容

### 端到端

以如下设置文本为例：

```md
刷新页面时用 F5
保存时用 Ctrl+S
```

验证：

1. 用户说“帮我刷新一下页面”
2. LLM 能选择 `keyboard_control`
3. 工具最终执行 F5 对应 `keyCodes`
4. USB 驱动可收到正确输出序列

## 涉及文件

本轮实现预期会涉及：

- `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- `voice-app/apps/desktop/src/features/settings/ControlSkillMarkdownSettings.tsx`（新增）
- `voice-app/apps/desktop/src/lib/tauri.ts`
- `voice-app/crates/settings-core/...`（设置模型与存储）
- `voice-app/crates/llm-core/src/system_prompt.rs`
- `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/index.ts`
- `voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/keyboard.ts`
- 可能新增共享快捷键规范化/翻码模块

## 明确不在本轮实现的内容

1. 不引入设置文本编译器
2. 不做复杂 Markdown 可视化预览器
3. 不承诺支持任意自然语言快捷键表达的稳定翻译
4. 不在第一版中重构整套 MCP runtime 架构
