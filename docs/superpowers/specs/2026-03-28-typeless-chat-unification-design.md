# Typeless 复用 Chat 主链路设计

## 背景

当前 `typeless` 模式在 ASR 完成后，仍然走本地 `determineIntent()` 分支，再分别进入：

- `handleControlIntent()`
- `handleInputIntent()`
- `handleChatIntent()`

对应入口在 `src/renderer/hooks/useVoiceController.ts#stopRecording:461` 附近。

这会带来 4 个直接问题：

1. `typeless` 和 `chat` 有两套意图判断逻辑，长期必然漂移。
2. `typeless` 的“直接输入”仍走旧的 `text:insert` IPC，底层是 `clipboard + paste`，入口在 `src/main/text-inserter.ts#insertTextToActiveApp:38`。
3. overlay 只能理解录音状态和手工设置的 `typelessStatus`，无法表达“模型正在思考”“工具已经执行”“执行的是哪类工具”。
4. 当前 `TypelessChatResult` 用 `userText` 模糊匹配和“有没有文本回复”来判断状态，无法可靠区分工具调用与普通问答。

## 用户确认的目标

本设计只覆盖 Windows 优先场景下的 `typeless` 行为统一，用户已确认以下目标：

- `typeless` 下，长按时 UI 只显示“正在聆听 / 正在识别”。
- 松开后，不显示 ASR 文本本身。
- 如果最终意图是“语音输入”，就直接往当前焦点光标处输入内容。
- 如果最终意图是 “MCP 工具执行”，UI 显示“正在思考 / 正在执行”。
- 如果最终是普通问答，仍然弹极简结果窗口。
- 采用“方案 1”：`typeless` 全量复用 `chat` 主链路，不再保留本地 heuristic 作为主路径。

## 已评估方案

### 方案 1：Typeless 全量复用 Chat 主链路

ASR 完成后，直接把文本送入 angrymiao 会话，由同一套模型 + skill prompt + MCP tools 决定是文本输入、工具调用还是普通回答。

优点：

- 与 `chat` 使用同一套决策链路，维护成本最低。
- overlay 可以基于真实消息流式状态驱动，而不是本地猜测。
- 后续新增工具时，`typeless` 不需要重复改本地 intent 规则。

缺点：

- 需要补一层“typeless 当前执行态推导”逻辑。

### 方案 2：Typeless 只复用工具执行层，保留本地轻量预判

优点：

- 改动量较小。

缺点：

- 仍然是两套路由。
- 需要维护“本地命中”与“模型命中”的优先级。

### 方案 3：先做结构化分类，再决定是否进入 Chat 主链路

优点：

- 可控性最强。

缺点：

- 链路更长，延迟更高。
- 对当前需求属于过度设计。

## 结论

采用方案 1。

`typeless` 的职责从“本地判断意图并执行”收敛为“启动录音、提交文本、观察会话执行态、显示极简 UI”。  
真正的意图判断统一交给 angrymiao skill + MCP runtime。

## 现状中的关键事实

### 1. angrymiao 会话已经具备 skill 注入能力

`ensureAngrymiaoSession()` 创建或归一化会话时，会写入：

- `agentSkill.id = angrymiao-voice-control`
- `agentSkill.bundleId = angrymiao-voice-control`
- `agentSkill.runtimeId = system-control`

对应位置：

- `src/renderer/packages/voice/angrymiao-session.ts#normalizeAngrymiaoSession:19`
- `src/renderer/packages/voice/angrymiao-session.ts#ensureAngrymiaoSession:82`

后续 `streamText()` 会读取 session 上的 `agentSkill`，注入 skill prompt，并把 skill bundle 下的 MCP tools 注入模型：

- `src/renderer/packages/model-calls/stream-text.ts#streamText:52`

### 2. 当前旧输入链路仍走剪贴板粘贴

`typeless` 的 `handleInputIntent()` 当前会调用 `window.electronAPI.insertText(text)`：

- `src/renderer/hooks/useVoiceController.ts#handleInputIntent:312`

该调用通过 preload 映射到主进程 `text:insert` IPC：

- `src/preload/index.ts:69`
- `src/main/main.ts:1094`

最终落到 `insertTextToActiveApp()`，其行为是：

- 保存原剪贴板
- 把新文本写入剪贴板
- 模拟 `Ctrl+V` / `Cmd+V`
- 再恢复剪贴板

对应位置：

- `src/main/text-inserter.ts#insertTextToActiveApp:38`

### 3. MCP runtime 已具备 `type_text`

skill runtime 已注册 `type_text`：

- `skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/index.ts:20`

其底层实现：

- Windows：`SendKeys.SendWait(text)`，不走剪贴板
- macOS：当前仍然是 `pbcopy + Cmd+V + 恢复剪贴板`

对应位置：

- `skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/keyboard.ts#typeText:25`

因此，本次设计可以明确做到：

- Windows 下，`typeless` 输入不再经过旧 `text:insert` IPC 和主进程剪贴板粘贴路径。
- macOS 下，`typeless` 虽然统一走 MCP `type_text`，但 runtime 当前仍存在剪贴板实现，这不在本轮改造范围内。

### 4. 现有全局 overlay 干扰主窗口派发的问题已被定位

`typeless overlay` 本身是一个 `BrowserWindow`。如果热键事件派发时仅通过 `BrowserWindow.getAllWindows().find(...)` 取第一个存活窗口，就可能把事件发到 overlay，而不是主窗口。

当前工作区已有一组修正：

- 新增 `src/main/hotkey-dispatch.ts`
- 在 `src/main/main.ts` 显式注册主窗口
- 在 `src/main/global-keyboard-hook.ts` 派发事件时优先使用注册过的主窗口

这组改动与本设计兼容，且应保留。

## 设计总览

### 设计原则

1. `typeless` 不再直接执行本地输入/快捷键/问答分支。
2. `typeless` 和 `chat` 使用同一套消息提交与模型执行链路。
3. overlay 只负责显示状态，不负责推断业务语义。
4. 业务语义判断统一由 renderer 根据 session 消息状态推导。
5. 只要本轮 assistant 消息出现任何 `tool-call`，本轮就视为“工具执行分支”，不再弹普通问答结果窗口。

## 目标链路

### 1. 录音与识别阶段

保留现有录音链路：

- 按下热键后进入 `listening`
- 松开后进入 `processing`
- ASR 返回文本

这部分仍由 `useVoiceController` 驱动，不改变现有录音、麦克风权限、流式识别逻辑。

### 2. ASR 完成后的统一提交

`typeless` 在拿到最终识别文本后，不再调用本地 `determineIntent()`。  
改为直接执行以下步骤：

1. `ensureAngrymiaoSession({ keyboardShortcuts, purgeOthers: false })`
2. `createMessage('user', text)`
3. `submitNewUserMessage(sessionId, { newUserMsg, needGenerating: true })`
4. 记录本轮 typeless 请求上下文，交给“执行态推导层”观察

说明：

- `purgeOthers` 保持 `false`，延续当前 typeless 行为，不在本轮删除其他 session。
- 不再保留 `handleControlIntent()` 和 `handleInputIntent()` 作为主路径。
- `handleChatIntent()` 的职责会被吸收进统一提交流程。

## Typeless 请求上下文

为避免当前 `TypelessChatResult` 用 `userText.includes(...)` 模糊匹配，新增一份最小请求上下文。

建议结构：

```ts
type TypelessRequestContext = {
  sessionId: string
  userMessageId: string
  userText: string
  startedAt: number
}
```

设计要求：

- `userMessageId` 必须来自本轮新建的 user message。
- 结果观察时，只跟踪“该 user message 之后紧邻的 assistant message”。
- 不再通过全文模糊匹配历史消息。

## Typeless 执行态推导

新增一个 renderer 侧推导层，例如：

- `src/renderer/packages/voice/typeless-execution-state.ts`
  或
- `src/renderer/hooks/useTypelessExecutionState.ts`

职责：

- 从 `TypelessRequestContext` 和 `useSession(sessionId)` 读取本轮对应的 assistant message
- 根据 `assistant.generating`、`assistant.error`、`assistant.contentParts` 推导当前显示态

### 状态来源

真正可靠的状态信号来自 assistant message 的 `contentParts`：

- `reasoning`：模型思考中
- `tool-call` + `state: call`：工具已发起
- `tool-call` + `state: result/error`：工具完成/失败

这些 part 的生成位置：

- `src/shared/models/abstract-ai-sdk.ts#processToolCalls:204`
- `src/shared/models/abstract-ai-sdk.ts#processStreamChunk:356`

### 显示态映射

建议映射规则如下：

| 条件 | overlay 状态 | 说明 |
| --- | --- | --- |
| 热键已按下，正在录音 | `listening` | 继续沿用现有逻辑 |
| 录音结束，ASR 处理中 | `processing` | 继续沿用现有逻辑 |
| 已提交消息，assistant 还在生成，且没有 `tool-call(state=call)` | `thinking` | 模型正在思考或开始文本回答 |
| assistant 出现 `tool-call(state=call)`，且工具名为 `mcp__system-control__type_text` | `inserting` | 文本输入分支 |
| assistant 出现 `tool-call(state=call)`，且工具名不是 `mcp__system-control__type_text` | `executing` | 其他 MCP 工具执行 |
| assistant 生成结束，有工具调用且无错误 | `success` | 自动隐藏，不弹结果窗 |
| assistant 生成结束，无工具调用，有普通文本回复 | 隐藏 overlay，弹结果窗 | 普通问答分支 |
| assistant 报错，或 `tool-call` 最终为 error | `error` | 显示错误后自动隐藏 |

## 普通问答与工具执行的分界

本轮采用如下判定规则：

- 只要本轮 assistant message 出现过任意 `tool-call`，本轮就视为工具执行。
- 即使最终 assistant 同时生成了少量解释文本，也不弹 typeless 结果窗口。
- 只有“没有任何 `tool-call`，且有正常文本回复”的场景，才弹 typeless 结果窗口。

这样做的原因：

1. 避免“工具已执行，但仍弹一个解释窗口”破坏 typeless 的极简体验。
2. 避免把带工具调用的消息再次当成普通问答消息处理。

## 极简结果窗口设计

`TypelessChatResult` 改造后的职责收敛为：

- 只负责显示纯问答结果
- 不负责推断工具执行态
- 不再通过 `userText.includes(...)` 识别本轮消息

改造要求：

1. 读取 `TypelessRequestContext.userMessageId`
2. 找到对应 user message 后的 assistant message
3. 若该 assistant message 含 `tool-call`，立即不显示结果窗
4. 若该 assistant message 无 `tool-call` 且有文本，则显示结果

## 旧输入链路清理策略

当 `typeless` 不再调用 `window.electronAPI.insertText()` 后，下列代码将变成死路径：

- `src/main/text-inserter.ts`
- `src/main/main.ts` 中 `text:insert` / `text:isInsertionSupported` IPC
- `src/preload/index.ts` 中 `insertText`
- `src/shared/electron-types.ts` 中 `insertText`

本轮建议直接删除，而不是保留兼容层。原因：

- 当前调用方只有 `useVoiceController.ts`
- 保留旧链路只会让 `typeless` 再次出现双路径行为
- 项目规范明确要求“删除无用代码，修改功能不保留旧的兼容性代码”

## 文件边界建议

### 需要修改

- `src/renderer/hooks/useVoiceController.ts`
  - 移除 typeless 主路径上的本地 intent 三分流
  - 改为统一提交到 angrymiao session
  - 改为写入 `TypelessRequestContext`

- `src/renderer/stores/voiceStore.ts`
  - 以 `TypelessRequestContext` 取代现有“手工语义状态”为主的 typeless 运行态
  - 保留最小 UI 所需的运行上下文

- `src/renderer/components/voice/TypelessChatResult.tsx`
  - 只处理纯问答结果
  - 基于 `userMessageId` 精确定位 assistant message

- `src/main/main.ts`
  - 删除 `text:insert` / `text:isInsertionSupported` IPC
  - 保留 typeless overlay IPC

- `src/preload/index.ts`
  - 删除 `insertText` 暴露

- `src/shared/electron-types.ts`
  - 删除 `insertText` 类型定义

### 建议新增

- `src/renderer/packages/voice/typeless-execution-state.ts`
  - 根据 `session + userMessageId` 推导 `thinking / inserting / executing / success / error / result`

### 预期保留不改

- `src/renderer/packages/voice/angrymiao-session.ts`
- `src/renderer/packages/model-calls/stream-text.ts`
- `skill-bundles/angrymiao-voice-control/SKILL.md`

### 本轮不纳入改造

- `skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/keyboard.ts`
  - 不在本轮修改 macOS 的 `type_text` 剪贴板实现

## 错误处理

### ASR 失败

- 保持现有 `error` overlay 行为
- 不写入 `TypelessRequestContext`

### session 初始化失败

- 直接进入 `error`
- 不再尝试回退到本地 `insertText`

### tool 执行失败

- 若本轮 assistant message 的 `tool-call` 最终为 `error`
- overlay 显示 `error`
- 不弹普通问答结果窗

### 模型返回空结果

若本轮 assistant message：

- 没有 `tool-call`
- 没有有效文本
- 也没有明确错误

则视为异常完成，按 `error` 处理，提示“未生成可用结果”。

## 测试策略

### 单元测试

至少新增以下测试：

1. typeless 执行态推导
   - 纯 reasoning -> `thinking`
   - `type_text` tool call -> `inserting`
   - 其他 tool call -> `executing`
   - 工具完成 -> `success`
   - 无 tool call 纯文本 -> `chat_result`
   - tool error / assistant error -> `error`

2. `TypelessChatResult`
   - 基于 `userMessageId` 精确定位 assistant message
   - 遇到 `tool-call` 不显示结果窗
   - 纯文本回答显示结果

3. 旧 IPC 删除后的编译约束
   - 确保没有残留 `electronAPI.insertText()` 调用

### 已有测试的关系

当前工作区已有两组与本设计直接相关的测试或测试骨架：

- `src/main/hotkey-dispatch.test.ts`
- `src/main/typeless-overlay.test.ts`

它们分别覆盖：

- overlay 存在时，热键事件仍派发给真正主窗口
- typeless overlay 禁用 DevTools

这两组测试应继续保留。

### 手工验证

Windows 手工验证至少覆盖：

1. 长按语音快捷键，说“输入你好世界”
   - overlay：`listening -> processing -> thinking -> inserting -> success`
   - 当前焦点应用收到文本
   - 不弹结果窗口

2. 长按语音快捷键，说“复制”
   - overlay：`listening -> processing -> thinking -> executing -> success`
   - 不弹结果窗口

3. 长按语音快捷键，说“解释一下量子纠缠”
   - overlay：`listening -> processing -> thinking`
   - 完成后弹极简结果窗口

4. 工具失败场景
   - overlay 最终进入 `error`

## 非目标

本设计明确不包含以下内容：

- 修改 macOS `type_text` 为完全无剪贴板实现
- 改动 MCP runtime 的工具清单
- 重做 typeless overlay 视觉设计
- 改动普通 Chat 页面消息渲染样式

## 后续实施建议

实施时应优先做 3 件事：

1. 先新增 typeless 执行态推导层和测试，验证状态映射正确。
2. 再把 `useVoiceController` 从本地 intent 分支切到统一提交链路。
3. 最后删除旧 `text:insert` IPC 与 `text-inserter.ts`，保证代码库中只有一条输入链路。
