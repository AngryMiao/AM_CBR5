# Typeless Chat 主链路与全局聊天结果层设计

## 背景

当前桌面端 `typeless` 已经统一复用了 angrymiao chat 主链路，但“纯聊天回复”的展示形态仍与真实目标不一致：

- 全局底部状态条由主进程窗口承载，入口在 `src/main/typeless-overlay.ts`
- 纯聊天结果仍通过 renderer 内的 `TypelessChatResult` 组件展示，挂载位置在 `src/renderer/routes/__root.tsx`
- 该结果组件是应用内右上角卡片，而不是全局、居中、可手动关闭的聊天结果层

这会直接导致桌面端 `typeless` 的关键交互偏离用户目标：

1. 纯聊天回复不是全局悬浮结果层，而是应用内卡片
2. 结果层不显示 ASR 识别内容
3. 结果层位置不在屏幕中央
4. 新一轮 typeless 开始前，不存在“立即抢占关闭旧卡片”的独立生命周期

## 用户确认的目标

本轮设计只覆盖桌面端 `typeless` 的纯聊天结果展示与生命周期，不改变“统一复用 chat 主链路”的总方向。用户已确认以下目标：

- `typeless` 下，录音和 ASR 识别阶段继续使用现有全局底部状态条
- 只有最终判定为“纯聊天回复”时，才弹出全局屏幕居中的结果卡片
- 结果卡片同时显示：
  - `ASR 识别内容`
  - `AI 聊天回复`
- 结果卡片不自动消失，必须由用户手动关闭
- 如果旧结果卡片尚未关闭，用户再次触发 typeless：
  - 立即关闭旧卡片
  - 然后开始新一轮录音/识别
- 工具执行分支仍然只走底部状态条，不弹中央结果卡片

## 已评估方案

### 方案 1：扩展现有底部 overlay，使其同时承担中央结果卡片职责

优点：

- 只有一个主进程窗口和一套 IPC

缺点：

- 当前 overlay 固定为 `300 x 58`，并定位在底部，位置和尺寸模型都不适合正文结果
- 当前 overlay 显式 `setIgnoreMouseEvents(true)`，天然不可点击，不适合手动关闭
- 当前 overlay 带有自动隐藏语义，与“结果卡片必须手动关闭”冲突
- 状态条与结果卡片会共享同一套窗口行为，职责混乱

### 方案 2：保留现有底部 overlay，新增独立的全局中央聊天结果窗口

优点：

- 最符合目标交互：底部状态条继续做短状态，中央结果层专门做正文展示
- 手动关闭、新一轮抢占关闭、去重显示等逻辑边界清晰
- 不需要破坏现有底部状态条的尺寸、位置、点击穿透和自动隐藏行为

缺点：

- 主进程需要同时维护两个 typeless 相关窗口

### 方案 3：中央结果继续使用 renderer 内 React 卡片

优点：

- 开发速度快

缺点：

- 不是全局层，窗口失焦、被其他应用覆盖时体验不成立
- 与 typeless 的全局交互目标冲突

## 结论

采用方案 2。

桌面端 `typeless` 保留现有底部全局状态条；纯聊天回复新增独立的全局中央结果窗口。  
renderer 负责“语义判断与状态同步”，main 负责“窗口展示与关闭事件回流”。

## 现状中的关键事实

### 1. 底部状态条已经具备稳定的全局窗口行为

`src/main/typeless-overlay.ts` 当前已经完成：

- 单独 `BrowserWindow`
- 屏幕底部定位
- `setIgnoreMouseEvents(true, { forward: true })`
- `success / error / processing` 自动隐藏

因此，这层非常适合继续承载：

- `listening`
- `processing`
- `thinking`
- `executing`
- `inserting`
- `success`
- `error`

但不适合直接承载：

- 可点击关闭
- 多行正文内容
- ASR 文本与回复正文的双区块布局

### 2. 当前纯聊天结果仍是应用内组件

`src/renderer/components/voice/TypelessChatResult.tsx` 当前通过：

- `typelessRequestAtom`
- `useSession(sessionId)`
- `findAssistantMessageForUser(...)`
- `deriveTypelessExecutionState(...)`

在 renderer 内判定 `chat_result` 并渲染一个应用内右上角卡片。  
这条逻辑仍然有价值，但它应保留“判断是否进入纯聊天结果”的职责，不应继续承担桌面端全局展示职责。

### 3. 统一 chat 主链路仍然成立

`typeless` 的 ASR 完成后仍然统一走：

1. `ensureAngrymiaoSession(...)`
2. 构造 user message
3. 建立 `TypelessRequestContext`
4. 触发 `submitNewUserMessage(...)`
5. renderer 基于 session assistant message 推导执行态

本轮不改变这条主链路，只改变 `chat_result` 的最终展示层。

## 设计总览

### 设计原则

1. 底部状态条与中央聊天结果卡片使用两套窗口，各自单一职责
2. renderer 负责语义判断，main 不直接理解 `chat_result` 业务含义
3. 只有纯聊天回复才允许弹中央结果卡片
4. 工具执行分支永远不弹中央结果卡片
5. 中央结果卡片必须手动关闭
6. 新一轮 typeless 开始前，必须先抢占关闭旧卡片

## 状态流与生命周期

### 两层 UI 模型

#### 1. 底部状态层

继续显示：

- `listening`
- `processing`
- `thinking`
- `inserting`
- `executing`
- `success`
- `error`

#### 2. 中央聊天结果层

只在本轮 assistant 最终被判定为 `chat_result` 时显示：

- `ASR 识别内容`
- `AI 聊天回复`
- 手动关闭按钮

### 典型流转

#### 录音与识别阶段

- 用户按下 typeless 热键
- 若旧中央结果卡片仍在显示，先关闭旧卡片
- 底部状态条进入 `listening`
- 松开后进入 `processing`

#### chat 主链路阶段

- renderer 根据 `TypelessRequestContext + assistant message`
  推导 `thinking / inserting / executing / success / error / chat_result`

#### 工具执行阶段

- 若最终为工具调用分支：
  - 只走底部状态条
  - `success / error` 自动隐藏
  - 不创建中央结果卡片

#### 纯聊天阶段

- 若最终为 `chat_result`：
  - 先隐藏底部状态条
  - 再显示中央结果卡片
  - 卡片保留直到用户手动关闭，或下一轮开始前被抢占关闭
  - 多屏场景下，中央结果卡片定位到“当前光标所在屏幕”的工作区中心，保持与现有底部状态条一致的屏幕选择语义

### 生命周期规则

- 新一轮 `typeless` 开始时：
  - 先关闭旧中央结果卡片
  - 清空旧结果态
  - 清空旧请求态
  - 然后进入新的录音/识别
- 用户手动关闭中央结果卡片时：
  - 清空结果态
  - 若当前请求仍对应同一轮，也同步清空请求态
- 离开 `typeless` 模式或应用主动清理时：
  - 关闭中央结果卡片
  - 清空结果态与请求态

## 数据模型

### TypelessRequestContext

保留“跟踪本轮 assistant 执行态”的职责，但字段改为直接适配结果卡片：

```ts
type TypelessRequestContext = {
  sessionId: string
  userMessageId: string
  asrText: string
  startedAt: number
}
```

说明：

- `asrText` 取代当前语义含混的 `userText`
- 该字段将直接作为中央结果卡片中的“ASR 识别内容”

### TypelessChatResultContext

新增独立结果态，专门表示“当前是否有中央结果卡片正在展示”：

```ts
type TypelessChatResultContext = {
  sessionId: string
  userMessageId: string
  asrText: string
  replyText: string
  shownAt: number
}
```

### 状态边界

- `typelessStatusAtom`
  - 只服务底部状态条
- `typelessRequestAtom`
  - 只服务 assistant 执行态推导
- `typelessChatResultAtom`
  - 只服务中央聊天结果卡片

## 中央结果卡片的触发条件

renderer 只有在满足以下全部条件时，才允许显示中央结果卡片：

1. 当前为桌面端 `typeless`
2. `typelessRequestAtom` 存在
3. 能根据 `userMessageId` 找到对应 assistant message
4. `deriveTypelessExecutionState(...)` 的结果是 `chat_result`
5. `replyText = getMessageText(assistantMessage).trim()` 非空
6. 当前 `typelessChatResultAtom?.userMessageId !== typelessRequest.userMessageId`

这组条件用于确保：

- 只有纯聊天结果才会开卡片
- 同一轮结果不会重复 `show`
- 工具调用不会误走中央结果层

### 触发顺序

当 renderer 判定本轮进入 `chat_result` 时，必须按以下顺序执行：

1. `invoke('typelessOverlay:hide')`
2. 写入 `typelessChatResultAtom`
3. `invoke('typelessChatResult:show', payload)`
4. 清空 `typelessStatusAtom`
5. 保留 `typelessRequestAtom`，等待手动关闭或下一轮开始前再清理

## 主进程与 renderer 分工

### renderer 职责

- 根据 session assistant message 判断本轮是否进入 `chat_result`
- 构造中央结果卡片的数据 payload
- 决定何时 `show / hide` 中央结果窗口
- 接收主进程“用户已手动关闭窗口”的回流事件并清理对应上下文

### main 职责

- 创建中央聊天结果 `BrowserWindow`
- 负责窗口居中定位
- 负责展示 ASR 与回复内容
- 负责关闭按钮交互
- 在用户手动关闭窗口时，通过事件回传关闭结果

中央结果卡片在首次展示时不应主动抢占当前应用焦点，应尽量以非激活方式显示；只有用户主动点击卡片关闭按钮时，才允许接收点击交互。

main 不负责理解：

- `thinking`
- `executing`
- `chat_result`
- assistant message 配对逻辑

这些语义判断全部留在 renderer。

## IPC 设计

新增独立 IPC，而不是复用当前底部状态条 IPC：

### renderer -> main

- `typelessChatResult:show`
- `typelessChatResult:hide`

### main -> renderer

- `onTypelessChatResultClosed`

关闭回流建议携带最小 payload：

```ts
type TypelessChatResultClosedPayload = {
  userMessageId: string
}
```

这样 renderer 在收到关闭事件后，可以按 `userMessageId` 做条件清理，避免旧卡片的关闭事件误清新一轮请求。

## 文件边界建议

### 需要新增

- `src/main/typeless-chat-result.ts`
  - 全局中央聊天结果窗口
- `src/main/typeless-chat-result.test.ts`
  - 覆盖窗口配置、定位、关闭回流

### 需要修改

- `src/main/main.ts`
  - 注册 `typelessChatResult:show / hide`
  - 连接关闭回流事件
- `src/preload/index.ts`
  - 暴露 `typelessChatResult:show / hide`
  - 暴露 `onTypelessChatResultClosed`
- `src/shared/electron-types.ts`
  - 新增对应 IPC 类型
- `src/renderer/stores/voiceStore.ts`
  - 新增 `typelessChatResultAtom`
  - 调整 `closeTypelessChatResult`
- `src/renderer/packages/voice/typeless-request.ts`
  - `userText` 改为 `asrText`
- `src/renderer/hooks/useVoiceController.ts`
  - 在 `chat_result` 时驱动中央结果卡片
  - 在新一轮开始前抢占关闭旧卡片
  - 响应 `onTypelessChatResultClosed`
- `src/renderer/packages/voice/typeless-execution-state.ts`
  - 保持“纯聊天 vs 工具执行”的语义判断

### 需要删除或限制桌面端使用

- `src/renderer/components/voice/TypelessChatResult.tsx`

建议：

- 桌面端停止挂载
- 非桌面端保持现状，不纳入本轮改造范围
- 若后续确认非桌面端无需求，再单独删除

## 错误处理

### 录音/权限/ASR 失败

- 只走底部状态条 `error`
- 不创建中央结果卡片

### chat 主链路提交失败

- 只走底部状态条 `error`
- 清空 `typelessRequestAtom`
- 不创建中央结果卡片

### assistant 为工具执行且失败

- `deriveTypelessExecutionState()` 返回 `error`
- 底部状态条显示错误并自动隐藏
- 不创建中央结果卡片

### assistant 为纯聊天但正文为空

- 按异常处理
- 不显示中央结果卡片
- 底部状态条显示 `error`
- 文案沿用：`未生成可用结果`

## 测试策略

### Main 层测试

新增 `src/main/typeless-chat-result.test.ts`，至少覆盖：

1. 窗口为屏幕居中，而不是底部定位
2. 窗口允许点击关闭，不启用 `ignore mouse events`
3. `show` 时能正确写入 `asrText / replyText / userMessageId`
4. 用户关闭窗口时，会回传带 `userMessageId` 的关闭事件

### Renderer 层测试

重点覆盖：

1. `chat_result` 只触发一次 `typelessChatResult:show`
2. 新一轮 `startRecording()` 会先隐藏旧卡片并清空结果态
3. 收到 `onTypelessChatResultClosed(userMessageId)` 时，只清对应那一轮
4. `success / error` 工具路径不会误开中央结果卡片

### 既有执行态测试继续保留

继续保留并扩展：

- `src/renderer/packages/voice/typeless-execution-state.test.ts`

确保：

- 只有 `chat_result` 才允许进入中央结果层
- 工具调用路径不会被误判为聊天结果

## 手工验证

桌面端至少验证以下场景：

1. 说“解释一下量子纠缠”
   - 底部状态条：`listening -> processing -> thinking`
   - 然后弹出中央结果卡片
   - 卡片同时显示 ASR 与 AI 回复
   - 卡片不会自动消失

2. 卡片打开时再次触发 typeless
   - 旧卡片立即关闭
   - 新一轮开始录音/识别

3. 说“复制”或“输入你好世界”
   - 只走底部状态条
   - 不弹中央结果卡片

4. 手动点击中央结果卡片关闭按钮
   - 卡片关闭
   - 对应 request/result context 被清理
   - 旧结果不会在后续 render 中重新冒出

## 非目标

本轮设计不包含：

- 重做底部状态条视觉设计
- 修改 angrymiao chat 主链路
- 修改 MCP runtime 工具清单
- 在中央结果卡片中增加会话历史、复制按钮或多轮交互能力
- 移动端 typeless 结果层改造

## 实施顺序建议

建议按以下顺序实现：

1. 新增主进程中央聊天结果窗口与 IPC
2. 在 renderer 新增 `typelessChatResultAtom`
3. 将 `chat_result` 从应用内卡片切到主进程中央结果窗口
4. 接入关闭回流与新一轮抢占关闭逻辑
5. 移除桌面端 `TypelessChatResult` 挂载，避免双展示源
