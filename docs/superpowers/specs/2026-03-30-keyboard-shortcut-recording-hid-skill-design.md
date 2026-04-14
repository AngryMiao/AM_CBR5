# 键盘快捷键录制与 HID Skill 注入设计

## 背景

当前语音设置页已经支持：

- 语音快捷键录制
- 键盘控制驱动配置
- 键盘快捷键映射
- Angrymiao voice skill runtime 注入

但“键盘快捷键映射”仍然使用手动点选按键分类的方式配置，和“语音快捷键”的录制式交互不一致。同时，当前快捷键能力主要依赖预设 trigger words 与预存 `keyCodes`，LLM 对“真实键名 -> HID code”的认知能力不足。

对应问题是：

1. 手动点选按键组合成本高，和真实键盘操作心智不一致
2. 配置项当前只强调 `keyCodes`，缺少“用户真实录到了什么键”的稳定表达
3. LLM 无法直接根据真实键名在 skill 中检索 HID code 并生成 `keyboard_control` 调用
4. 现有 `keyboard_control` 协议稳定，但还不适合做高入侵的运行时状态机改造

## 用户确认的目标

本轮仅做低入侵改造，用户已确认目标如下：

1. 将“键盘快捷键”的按键组合输入改成录制式，交互接近现有语音快捷键录制
2. 录制结果保存为真实键名，供 LLM 在 skill 中查找对应 HID code
3. `keyboard-shortcuts.ts` 保留，不修改、不删除其现有职责
4. 录制支持多键组合，最多 6 个键
5. 对当前没有稳定 HID 映射的录制键允许保存，但 UI 必须明确提示“执行可能失败”
6. 不修改现有 `keyboard_control` 的入参协议，最终仍由 LLM 生成 `keyCodes`

## 非目标

本轮不包含以下内容：

1. 不引入“按住 / 松开 / release_all”的键盘状态机
2. 不修改 `keyboard_control` runtime 协议
3. 不要求前端本地将所有真实键 deterministic 转成 HID `keyCodes`
4. 不对 `keyboard-shortcuts.ts` 做职责重构
5. 不承诺第一版稳定支持跨轮次“持续按住某键再释放”

## 当前代码观察

### 1. 键盘快捷键配置当前是手动点选键位

`src/renderer/components/voice/KeyboardControlSettings.tsx`

- 通过 `KeyComboBuilder` 手动选择分类键位
- 候选项来自 `KEY_CATEGORIES`
- 新建快捷键时直接调用 `buildKeyCodes(newSlots)` 生成 `keyCodes`
- 当前配置没有保存“真实录制键名”

### 2. 语音快捷键已经有成熟的录制式实现

`src/renderer/components/voice/VoiceHotkeyRecorder.tsx`

- 通过 `keydown / keyup` 监听采集真实键位
- 使用 `KeyboardEvent.code`
- 支持取消、清空和组合键录制

这说明项目内已经存在可复用的录制思路，无需额外引入更重的输入基础设施。

### 3. 默认键码与组合键构造已经存在稳定实现

`src/shared/defaults/keyboard-shortcuts.ts`

- 定义了 `HID` 常量表
- 提供 `keyDown()` / `keyUp()`
- 提供 `makeCombo()` / `makeSingleKey()`
- 提供默认快捷键生成逻辑

该文件当前同时服务：

- 默认快捷键映射
- 旧有 `keyCodes` 生成逻辑

本轮应保留该文件，不打散现有职责。

### 4. 当前 skill 注入只强调 trigger words 和 `keyCodes`

`src/renderer/packages/agent-skills/angrymiao-voice-control.ts`

- 已注入默认快捷键映射
- 已注入用户配置的 trigger words 与 `keyCodes`
- 但没有注入“真实键名 -> HID code”的参考知识

### 5. 当前 runtime 只接受 `keyCodes`

`voice-app/skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/index.ts`

- `keyboard_control` 入参只有 `keyCodes: string[]`
- tool 描述强调“按下和抬起成对出现”

因此第一版最稳妥的方案是：

- 配置保存真实键名
- skill 帮助 LLM 查码
- 最终调用仍然输出 `keyCodes`

## 已评估方案

### 方案 1：推荐方案

在设置页把手动选键改成录制式，保存真实录制键名；新增 bundle 内 HID reference 文档，并在 angrymiao skill prompt 中同时注入用户录制键名和 HID 参考规则；最终仍由 LLM 生成 `keyCodes` 调用现有 `keyboard_control`。

优点：

- 改动面最小，不动 runtime 协议
- 保留现有 `keyboard-shortcuts.ts`
- 和“语音快捷键”交互一致
- 用户配置表达更接近真实键盘输入
- 允许逐步扩充 LLM 的键码认知，而不破坏现有链路

缺点：

- `recordedKeys -> keyCodes` 的翻译正确性依赖模型
- 对未知键位映射不能做到完全 deterministic

### 方案 2：前端本地统一做真实键名到 HID 转换

优点：

- 运行时更稳定
- 对模型依赖更少

缺点：

- 需要维护更完整的浏览器键名到 HID 映射
- 与“找不到让 LLM 自己处理”的目标不一致
- 会显著提高本轮前端逻辑复杂度

### 方案 3：修改 runtime 协议，直接接受真实键名

优点：

- 配置与执行协议更一致

缺点：

- 改动 MCP tool 协议与 runtime，明显超出本轮“低入侵”边界

## 结论

采用方案 1。

即：

1. 设置页把键盘快捷键组合改成录制式输入
2. 新数据保存真实键名 `recordedKeys`
3. 保留并兼容现有 `keyCodes`
4. 新增 bundle 内 HID reference 文档给 LLM 查码
5. skill prompt 注入用户录制键名与 HID reference 规则
6. 最终仍通过现有 `keyboard_control({ keyCodes })` 执行

## 设计总览

### 设计原则

1. 不破坏当前 `keyboard_control` 协议
2. 不修改 `keyboard-shortcuts.ts` 的职责与现有默认行为
3. 新配置以“真实录制键名”为主，`keyCodes` 为兼容字段
4. 对未知映射不拦截保存，但必须把风险显式暴露给用户
5. 保持设置页即时保存风格，不增加额外保存按钮

## 数据模型

### `KeyboardShortcut` 字段扩展

在 `src/shared/types/voice.ts` 的 `KeyboardShortcutSchema` 中新增可选字段：

```ts
recordedKeys: z.array(z.string()).optional()
```

语义约定：

- `recordedKeys`
  - 新版录制得到的真实键名
  - 来源于 `KeyboardEvent.code`
  - 例如：`["ControlLeft", "KeyV"]`
- `keyCodes`
  - 兼容字段
  - 继续保留给旧数据和现有默认映射使用
  - 新版配置不再把它视为唯一真值

### 兼容策略

1. 旧数据仅有 `keyCodes` 时继续可读可用
2. 新数据优先使用 `recordedKeys`
3. 不强制做 `keyCodes -> recordedKeys` 反解

## 设置页设计

### 总体改动

`src/renderer/components/voice/KeyboardControlSettings.tsx`

- 移除手动点选式 `KeyComboBuilder`
- 替换为录制式 `KeyboardShortcutRecorder`
- 新增未知 HID 映射提示

### 录制组件行为

录制规则：

1. 点击“录制”后开始监听 `keydown / keyup`
2. 内部采集 `KeyboardEvent.code`
3. 抬起任意当前已录制键时结束本轮录制并提交
4. `Escape`：取消录制，恢复原值
5. `Backspace`：清空当前值
6. 最多允许录制 6 个键

录制结果示例：

- `["KeyA"]`
- `["ControlLeft", "KeyV"]`
- `["ShiftLeft", "AltLeft", "KeyA"]`

### 显示规则

UI 展示使用轻量 label 映射，例如：

- `ControlLeft -> CtrlLeft`
- `ControlRight -> CtrlRight`
- `MetaLeft -> Cmd/WinLeft`
- `KeyA -> A`
- `Digit1 -> 1`

底层保存仍使用原始 `KeyboardEvent.code`。

### 风险提示

录制完成后，对 `recordedKeys` 做一次“是否存在稳定 HID 参考映射”的检查：

- 若全部命中：正常展示
- 若存在未命中项：显示提示

建议提示文案：

`该键当前没有稳定 HID 映射，执行可能失败`

该提示不阻止保存。

### 编辑与老数据展示

1. 新数据优先显示 `recordedKeys`
2. 老数据如果只有 `keyCodes`：
   - 仍允许展示与启用
   - “按键组合”区块显示为旧版配置提示
   - 用户重新录制后即可升级为真实键名配置

## 录制键名参考层

### 新增轻量参考模块

新增一个独立的录制键参考模块，例如：

- `src/shared/voice-key-reference.ts`

职责：

1. 定义常见 `KeyboardEvent.code` 到展示名的映射
2. 定义常见 `KeyboardEvent.code` 是否存在稳定 HID 参考映射
3. 为 UI 风险提示提供判断依据

该模块不替代 `keyboard-shortcuts.ts`，只服务：

- 录制式 UI
- skill 注入所需的真实键名表达

## Skill / Reference 设计

### 新增 bundle 内 reference 文档

新增：

- `voice-app/skill-bundles/angrymiao-voice-control/docs/keyboard-hid-reference.md`

文档内容包含三部分：

1. 编码规则
   - `11 + HID = key down`
   - `10 + HID = key up`
2. 常见真实键名到 HID 的映射
   - `KeyA -> 070004`
   - `Digit1 -> 07001E`
   - `ControlLeft -> 0700E0`
   - `MetaLeft -> 0700E3`
3. 组合键构造规则
   - 修饰键先按下
   - 普通键按下/抬起
   - 修饰键逆序抬起

### prompt 注入方式

在 `src/renderer/packages/agent-skills/angrymiao-voice-control.ts` 中扩展当前 skill prompt：

#### 1. 用户录制映射注入

优先输出：

- `triggerWords`
- `recordedKeys`
- 可选的旧版 `keyCodes`

示例：

```md
## User Configured Shortcut Mapping

| Trigger words | recordedKeys | keyCodes |
| --- | --- | --- |
| 截图 / 截屏 | ["ControlLeft","ShiftLeft","KeyS"] | |
| 粘贴 | ["ControlLeft","KeyV"] | ["110700E0","11070019","10070019","100700E0"] |
```

#### 2. HID reference 注入

在 prompt 中增加规则：

1. 命中用户自定义 trigger words 时，优先使用用户录制映射
2. 命中默认快捷键时，优先使用默认映射
3. 对明确的键盘动作，可根据 `recordedKeys` 和 HID reference 生成 `keyCodes`
4. 若 reference 中没有稳定映射，不要伪造高风险键码；应谨慎处理并接受执行可能失败

### 为什么不直接注入 TS 源码

不直接把 `keyboard-shortcuts.ts` 原文件作为 prompt 内容，因为：

1. 该文件是程序实现文件，不是给模型看的 reference 文档
2. 代码噪音较大，不利于模型检索
3. 本轮已明确要求保留该文件，不改变其职责

## 对现有默认快捷键的处理

### 保留现状

`src/shared/defaults/keyboard-shortcuts.ts`

保留其现有职责：

1. 默认快捷键生成
2. 旧有 `keyCodes` 组合逻辑
3. 现有 `HID` 常量定义

### 与新方案的关系

新方案不会删除或重写该文件，只会：

1. 继续让默认快捷键初始化逻辑使用它
2. 允许新的 reference 文档复用其已知 HID 常量信息

## 验证方案

本轮设计对应的实现验证至少包括：

1. 录制 UI
   - 能录制单键 `KeyA`
   - 能录制组合键 `ControlLeft + KeyV`
   - 超过 6 键时显示限制提示
2. 数据兼容
   - 旧数据仅有 `keyCodes` 时仍可读取
   - 新数据可保存 `recordedKeys`
3. 风险提示
   - 对未知映射键显示“执行可能失败”提示
4. skill 注入
   - prompt 中能看到用户录制映射
   - prompt 中能看到 HID reference 规则

## 风险与权衡

### 1. `recordedKeys -> keyCodes` 仍依赖 LLM

这是本方案主动接受的 tradeoff：

- 好处：低入侵、灵活、能处理部分本地未覆盖键位
- 风险：模型翻译存在不稳定性

### 2. 未知键位不能保证稳定执行

因此 UI 必须显式提示风险，而不是静默保存。

### 3. 第一版不承诺“持续按住再释放”

因为本轮不引入 runtime 状态机，不修改协议，故不能把“按住 / 松开”作为稳定能力对外承诺。

## 后续实现边界

进入实现后，建议严格限制在以下文件范围：

- `src/shared/types/voice.ts`
- `src/renderer/components/voice/KeyboardControlSettings.tsx`
- 新增录制组件文件
- 新增录制键参考模块
- `src/renderer/packages/agent-skills/angrymiao-voice-control.ts`
- `voice-app/skill-bundles/angrymiao-voice-control/docs/keyboard-hid-reference.md`

不应在本轮改动：

- `keyboard_control` MCP tool 协议
- `runtime/system-control-mcp` 执行逻辑
- `src/shared/defaults/keyboard-shortcuts.ts` 的现有职责
