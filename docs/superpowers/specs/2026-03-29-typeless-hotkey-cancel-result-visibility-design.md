# Typeless 热键中断与结果窗可见性修复设计

## 背景

当前 typeless 模式的语音快捷键链路只完整覆盖了“按下开始录音，松手停止录音并进入后续处理”这一条主路径，但没有把“处理中再次按快捷键”的语义定义成统一状态机。

现状问题有两类：

1. `recording -> asr -> llm -> mcp` 期间缺少统一的取消与重入控制，导致无法稳定支持：
   - 长按重新开始一轮新的录音
   - 单击中断当前整轮流程
2. 中央极简聊天结果窗关闭后，主窗口有概率被错误显示，违背 typeless 模式“关闭结果窗不改变 chatbox 当前可见性”的预期。

## 用户确认的目标行为

1. 长按录音快捷键唤起录音，松手后执行 ASR，这是保留行为。
2. 如果在 `recording -> asr -> llm -> mcp` 期间再次长按快捷键，需要终止上一轮流程，并立刻进入新一轮 `录音 -> ASR`。
3. 如果在 `recording -> asr -> llm -> mcp` 期间单击快捷键，只中断当前整轮流程，不启动新流程。
4. 一旦中央极简聊天结果窗已经出现，代表整轮流程已结束；此时快捷键不再承担“中断当前轮”的职责。
5. 用户关闭中央极简聊天结果窗时，只关闭结果窗本身，不改变主窗口当前是否显示的状态。

## 非目标

1. 不改 chatbox 的普通交互。
2. 不改 typeless 结果窗本身的视觉结构。
3. 不在这次顺手重构全局热键底层实现。

## 当前代码观察

### 热键状态机现状

- `src/renderer/hooks/useVoiceController.ts`
  - `handleHotkeyDown` 只处理：
    - `inactive` 时启动录音
    - `speaking` 时停止播报
  - `handleHotkeyUp` 只处理：
    - 当前 recorder 仍处于 `recording` 时调用 `stopRecording`
- 这意味着 `asr / llm / mcp` 阶段没有统一“可取消操作”的 owner。

### 结果窗关闭现状

- `src/main/typeless-chat-result.ts`
  - 结果窗关闭时会 `preventDefault + hide()`
  - 会向 renderer 发送 `typelessChatResult:closed`
- `src/renderer/hooks/useVoiceController.ts`
  - 收到 `typelessChatResult:closed` 后只清理 renderer 侧 typeless 状态
- 当前没有显式保存“结果窗弹出前主窗口原本是否可见”的快照，因此关闭结果窗时无法保证主窗口可见性不被系统焦点回退影响。

## 设计决策

## 1. 引入 typeless 统一操作状态

在 renderer 侧引入单轮操作概念，使用 `operationId` 标识一次完整 typeless 处理链。

一轮操作包含以下阶段：

- `idle`
- `recording`
- `asr`
- `llm`
- `mcp`
- `result`

其中：

- `recording / asr / llm / mcp` 为“可取消阶段”
- `result` 为“已完成阶段”，不再响应“中断当前轮”

### 核心约束

1. 每次启动新一轮 typeless 流程时生成新的 `operationId`
2. 所有异步回调在写状态前都必须校验 `operationId` 是否仍为当前轮
3. 旧轮次即使晚返回，也只能被丢弃，不能再改 UI / 状态 / 结果窗

## 2. 定义热键语义为“先取消，后根据按住时长决定是否重启”

当当前处于可取消阶段时：

- `keydown`
  - 立即执行 `cancelCurrentOperation()`
  - 同时开始记录“这次是一次潜在长按重启”
- `keyup`
  - 如果本次按住时长小于阈值，则视为“单击取消”，流程到此结束
  - 如果本次按住时长达到阈值，则视为“长按重启”，在 `keydown` 期间或阈值达成后启动新的录音流程

推荐阈值：`180ms`

这样可以稳定满足用户定义：

- 单击：取消，不重启
- 长按：取消旧轮，并开始新一轮录音

## 3. 结果窗出现后不再参与当前轮取消

当结果窗出现时：

- 当前轮状态切换为 `result`
- 清空“可取消阶段”的操作句柄
- 后续快捷键不再试图中断这一轮

这样可以避免“已经完成的聊天结果又被误取消”。

## 4. 结果窗关闭必须保持主窗口原有可见性

在 main 进程显示 typeless 结果窗前，记录主窗口快照：

- `wasMainWindowVisibleBeforeResult`

关闭结果窗时遵循：

- 如果结果窗出现前主窗口不可见，则关闭结果窗后也不允许把主窗口显示出来
- 如果结果窗出现前主窗口可见，则关闭结果窗后保持可见，不额外做隐藏或显示切换

这条规则应在 main 进程落地，而不是依赖 renderer 推断，因为窗口焦点与可见性最终由 main 进程负责。

## 5. 取消操作的边界

`cancelCurrentOperation()` 需要覆盖：

1. 正在录音：
   - 停止 recorder
   - 清空实时转录
   - 隐藏 typeless overlay
2. 正在 ASR：
   - 标记当前轮失效
   - 丢弃之后返回的 ASR 结果
3. 正在 LLM / MCP：
   - 标记当前轮失效
   - 清理 typeless request / typeless status
   - 隐藏 overlay
4. 已经进入结果窗：
   - 不执行取消逻辑

## 实现范围

### Renderer

- `src/renderer/hooks/useVoiceController.ts`
  - 增加 typeless 单轮操作状态与 `operationId`
  - 重写 hotkey `down/up` 判定逻辑
  - 抽出 `cancelCurrentOperation()`
  - 给录音、ASR、typeless request 提交流程增加“轮次校验”

- `src/renderer/packages/voice/typeless-request.ts`
  - 增加可安全丢弃旧轮结果的上下文或标识透传

### Main

- `src/main/typeless-chat-result.ts`
  - 增加主窗口显示状态快照
  - 关闭结果窗时按快照恢复语义，而不是让系统默认焦点回退

- 必要时补最小 glue 代码到 `src/main/main.ts`

## 测试计划

### Renderer 状态机测试

新增或扩展 `useVoiceController` 测试覆盖：

1. 可取消阶段单击快捷键，只取消当前轮，不启动新录音
2. 可取消阶段长按快捷键，取消当前轮并启动新录音
3. 上一轮异步结果晚到时被丢弃，不再弹结果窗
4. 结果窗已显示时再次按快捷键，不触发取消当前轮

### Main 结果窗测试

扩展 `typeless-chat-result` 测试覆盖：

1. 主窗口原本隐藏时，关闭结果窗后主窗口保持隐藏
2. 主窗口原本显示时，关闭结果窗后主窗口保持显示
3. 手动关闭结果窗只发关闭事件，不触发 chatbox 显示切换

## 风险与控制

### 风险 1：热键重入时出现双启动

控制：

- 新一轮启动前先递增 `operationId`
- 旧轮结果统一按 `operationId` 丢弃

### 风险 2：取消录音时触发旧的 `stopRecording` 后续链路

控制：

- 取消路径与“正常松手提交”路径分开
- `stopRecording` 内部增加“本轮是否仍有效”的检查

### 风险 3：关闭结果窗时仍被系统焦点回退带出主窗口

控制：

- 在 main 进程记录并执行窗口可见性快照
- 针对该行为补回归测试，防止再次复发

## 推荐实施顺序

1. 先补 `useVoiceController` 红灯测试，锁定单击取消 / 长按重启 / 旧轮结果丢弃
2. 再补 `typeless-chat-result` 红灯测试，锁定“关闭结果窗不改变主窗口可见性”
3. 按最小范围修改 renderer 状态机
4. 按最小范围修改 main 结果窗可见性恢复逻辑
5. 运行 typeless 相关回归测试与定向类型检查
