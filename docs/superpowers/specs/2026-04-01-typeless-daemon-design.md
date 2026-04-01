# Typeless 后台常驻 Daemon 设计

## 背景

当前 `typeless` 语音链路虽然在体验上看起来像“全局后台能力”，但实现上仍然依赖主聊天窗口对应的 renderer：

1. 全局热键和极简 overlay 在 `main` 进程
2. 录音由 renderer 里的 `VoiceRecorder` 驱动
3. ASR / typeless request / LLM / MCP 编排由 renderer 里的 `useVoiceController()` 驱动
4. 会话与消息生成路径走 renderer 的 `chatStore -> submitNewUserMessage -> generate -> streamText`

这导致一个结构性问题：

1. 主聊天窗口被销毁后，全局热键仍能触发 overlay
2. 但真正的 `录音 -> ASR -> LLM -> MCP` 链路已经没有执行者
3. 用户会看到“正在聆听 / 正在识别”的 UI 假象，但流程不会闭环

用户已明确确认以下目标：

1. `chatbox` 主窗口允许被销毁
2. 即使主窗口被销毁，`typeless` 也必须继续完整运行
3. 完整链路必须覆盖：
   - 长按录音
   - 唤起极简 UI
   - ASR 识别
   - LLM 推理
   - MCP 工具执行

## 目标

本轮目标：

1. 将 `typeless` 重构为独立于主聊天窗口的后台常驻能力
2. 让 `main` 进程拥有 typeless 主状态机和全流程编排职责
3. 允许主聊天窗口被销毁后，`typeless` 继续完成 `录音 -> ASR -> LLM -> MCP -> result`
4. 重新打开主聊天窗口后，可以接回后台会话与当前运行状态
5. 尽量复用现有语音、session、tooling 能力，避免一次性重写全部系统

## 非目标

本轮不做：

1. 不把所有语音能力都改造成“纯 main 进程无 renderer 依赖”
2. 不重写现有会话存储格式
3. 不把 Chat 模式整条语音链路一起迁移到后台 daemon
4. 不改变现有 typeless 的业务语义与 MCP 结果展示方式
5. 不在本轮引入新的数据库或新的外部常驻服务

## 关键约束

### 1. 录音不能直接纯搬到主进程

当前录音器 `VoiceRecorder` 依赖：

1. `navigator.mediaDevices.getUserMedia`
2. `MediaRecorder`
3. `AudioContext`

这些能力属于浏览器环境，不属于 Electron `main` 进程。

这意味着：

1. `ASR / LLM / MCP` 可以迁到主进程
2. 但麦克风采集至少需要一个 renderer 上下文承载

### 2. `whisper-local` 仍依赖浏览器环境

当前 `whisper-local` 使用：

1. `window.fetch`
2. `AudioContext.decodeAudioData`
3. `@xenova/transformers`
4. 浏览器 cache / window 级 fetch 拦截

因此它不能在本轮直接迁到 `main` 进程执行。

### 3. 当前 LLM / MCP 路径深度依赖 renderer

现状里：

1. 消息提交走 renderer 的 `submitNewUserMessage()`
2. 生成入口依赖 renderer `generate`
3. tool set 来自 renderer `mcpController`
4. 会话读写走 renderer `chatStore`

因此如果要支持“主窗口销毁后 typeless 继续运行”，不能只迁移录音和 ASR，必须一起抽离：

1. session/message repository
2. generation runner
3. MCP controller

## 方案比较

### 方案 1：纯主进程化

把录音、ASR、LLM、MCP、状态机全部搬到 `main` 进程。

优点：

1. 结构最理想
2. 真正不依赖任何 renderer

缺点：

1. 录音无法复用当前 `VoiceRecorder`
2. 需要新增原生音频采集能力或额外 sidecar
3. 一次性改动过大，风险高

### 方案 2：推荐方案

主进程持有 typeless daemon；新增隐藏 `voice worker window` 负责录音与浏览器依赖 ASR；主聊天窗口只做可选 UI。

优点：

1. 满足“主聊天窗口可销毁，但 typeless 继续工作”
2. 保留浏览器录音能力，不需要立刻引入原生采集栈
3. 可以分阶段迁移现有 renderer 逻辑
4. `whisper-local` 仍可用

缺点：

1. 不是严格意义上的“全 main”
2. 需要维护一个隐藏 worker 窗口和 IPC 协议

### 方案 3：外部独立 daemon 进程

把 typeless 做成独立后台服务，Electron 只负责 UI 与控制。

优点：

1. 稳定性最好
2. 与主窗口生命周期彻底解耦

缺点：

1. 超出本轮改造边界
2. 发布、权限、运维和跨平台复杂度明显上升

## 结论

采用方案 2。

也就是：

1. `main` 进程成为 typeless 的实际控制器
2. 隐藏 `voice worker window` 只负责录音和必要浏览器依赖能力
3. 主聊天窗口可以销毁，也可以重建，但不再是 typeless 的运行前提

## 设计总览

### 1. 进程职责重划

#### `main` 进程

负责：

1. 全局热键接入
2. typeless 状态机
3. overlay / 极简结果窗
4. voice worker 生命周期
5. ASR 执行调度
6. 会话和消息操作
7. LLM 生成
8. MCP 执行
9. 运行时快照恢复

#### `voice worker window`

隐藏窗口，只负责：

1. 麦克风权限
2. 录音
3. PCM / Blob 音频输出
4. 浏览器依赖 ASR（当前主要是 `whisper-local`）

#### `chatbox main window`

只负责：

1. 常规聊天 UI
2. 展示后台 typeless 会话
3. 订阅 daemon 运行状态
4. 在重建后恢复界面

它不再拥有 typeless 核心流程。

### 2. Typeless Daemon 状态机

建议引入独立状态机：

```ts
type TypelessDaemonPhase =
  | 'idle'
  | 'recording'
  | 'asr'
  | 'llm'
  | 'mcp'
  | 'result'
  | 'error'
```

状态机职责：

1. 保证任一时刻只存在一个活动 typeless operation
2. 统一处理热键中断、短按取消、重启当前轮次
3. 管理 overlay 与结果窗状态
4. 记录本轮 `sessionId / userMessageId / asrText / activeTool / replyText`

### 3. Runtime Snapshot

为了支持主聊天窗口重建后恢复上下文，需要引入运行时快照：

```ts
type TypelessRuntimeSnapshot = {
  phase: TypelessDaemonPhase
  sessionId?: string
  userMessageId?: string
  asrText?: string
  streamingText?: string
  activeToolName?: string
  replyText?: string
  startedAt?: number
  errorMessage?: string
}
```

主聊天窗口创建后主动拉取快照，并与当前会话消息同步。

## 模块拆分

### 1. 新增主进程模块

建议新增：

1. `src/main/typeless-daemon/typeless-daemon.ts`
2. `src/main/typeless-daemon/typeless-state-machine.ts`
3. `src/main/typeless-daemon/voice-worker-window.ts`
4. `src/main/typeless-daemon/voice-worker-ipc.ts`
5. `src/main/typeless-daemon/asr-executor.ts`
6. `src/main/typeless-daemon/session-repository.ts`
7. `src/main/typeless-daemon/generation-runner.ts`
8. `src/main/typeless-daemon/mcp-controller.ts`
9. `src/main/typeless-daemon/runtime-snapshot.ts`

### 2. 新增 worker 侧模块

建议新增：

1. `src/preload/voice-worker.ts`
2. `src/renderer/voice-worker/index.ts`
3. `src/renderer/voice-worker/worker-recorder.ts`
4. `src/renderer/voice-worker/worker-whisper-local.ts`

### 3. 现有模块的角色变化

#### 保留复用

1. `src/main/global-keyboard-hook.ts`
2. `src/main/typeless-overlay.ts`
3. `src/main/typeless-chat-result.ts`
4. 现有 `doubao-asr.ts`

#### 需要被抽离/重构

1. `src/renderer/hooks/useVoiceController.ts`
2. `src/renderer/stores/session/messages.ts`
3. `src/renderer/packages/model-calls/stream-text.ts`
4. `src/renderer/packages/mcp/controller.ts`
5. `src/renderer/packages/voice/angrymiao-session.ts`

## 详细数据流

### 1. 长按开始

1. `main` 收到 `hotkey:down`
2. `typeless-daemon` 判断是否需要中断当前 operation
3. 状态机进入 `recording`
4. `main` 更新极简 overlay 为“正在聆听...”
5. `main` 向 `voice worker` 发送 `start-recording`

### 2. 录音中

1. worker 开始录音
2. 实时回传：
   - `audio-level`
   - 可选 PCM chunk
   - 可选临时 streaming 文本
3. `main` 根据 provider 决定是否实时送往 streaming ASR

### 3. 松开结束

1. `main` 收到 `hotkey:up`
2. daemon 发 `stop-recording`
3. worker 返回最终 `Blob` 或最终 chunk 汇总
4. 状态机进入 `asr`

### 4. ASR 阶段

#### `main` 执行的 provider

1. `doubao`
2. `openai`
3. `azure`
4. `google`
5. `aliyun`
6. `funasr-local`

#### `voice worker` 执行的 provider

1. `whisper-local`

执行结果统一回到 `main`，并生成最终 transcript。

### 5. LLM 阶段

1. `main` 通过 `session-repository` 获取或创建 angrymiao 单例 session
2. 插入用户消息
3. 创建 assistant placeholder
4. `generation-runner` 驱动模型流式生成
5. 状态机进入 `llm`

### 6. MCP 阶段

1. `generation-runner` 发现 tool call
2. 状态机切到 `mcp`
3. `main` 里的 `mcp-controller` 组装工具集并执行
4. 工具结果继续送回模型生成

### 7. 结果阶段

1. 若回复是普通聊天结果，则显示极简结果窗
2. 若是工具执行型结果，则 overlay 给出完成态
3. 状态机进入 `result`
4. 等待用户关闭结果窗或下一轮热键开始

## Provider 兼容策略

### 1. ASR provider 迁移矩阵

#### 可迁到 `main`

1. `openai`
2. `azure`
3. `google`
4. `aliyun`
5. `funasr-local`
6. `doubao`（已部分在 main）

原因：

1. 这些 provider 本质是 `fetch` / WebSocket / FormData 调用
2. 在 Node 20 / Electron main 可实现

#### 继续留在 worker

1. `whisper-local`

原因：

1. 依赖 `AudioContext`
2. 依赖 `window.fetch` 与浏览器缓存
3. 当前实现无法直接主进程化

### 2. TTS

本轮 typeless daemon 设计不要求 TTS 后台播放，保持现状，不纳入迁移范围。

## Session / Message Repository 设计

当前 `chatStore` 虽然定义在 renderer，但底层实际通过统一存储接口回到主进程 store。

因此建议：

1. 抽出纯数据层 repository
2. 从 renderer `chatStore` 中移除 React Query / UI cache 依赖
3. 让 `main` 与 renderer 共用统一的 session/message 读写规则

repository 至少要提供：

1. `listSessionsMeta`
2. `getSession`
3. `createSession`
4. `updateSession`
5. `insertMessage`
6. `updateMessage`
7. `deleteSession`
8. `getSessionSettings`

## Generation Runner 设计

目标不是让 `main` 调 renderer 的 `submitNewUserMessage()`，而是把生成链路抽成主进程可复用能力。

建议拆成两层：

1. `generation-runner`
   - 负责编排 user message / assistant placeholder / generate lifecycle
2. `stream-text-core`
   - 负责模型输入、tool set、streaming 结果回调

迁移原则：

1. 去掉对 React Query 的依赖
2. 去掉对 renderer store 单例的依赖
3. 保留对 shared model adapters 的复用

## MCP Controller 迁移设计

当前 `mcpController` 在 renderer，必须迁到 `main`，否则主窗口销毁后工具调用无法继续。

迁移要求：

1. `main` 持有 MCP server 生命周期
2. tool set 在 `main` 生成
3. 结果通过 daemon 状态回推 overlay / result UI
4. renderer 如需展示 server 状态，改成订阅 `main` 发出的 snapshot / event

## IPC 设计

### 1. `main <-> voice worker`

建议最小协议：

1. `voiceWorker:startRecording`
2. `voiceWorker:stopRecording`
3. `voiceWorker:cancelRecording`
4. `voiceWorker:audioLevel`
5. `voiceWorker:recordingStopped`
6. `voiceWorker:recordingFailed`
7. `voiceWorker:runWhisperTranscribe`
8. `voiceWorker:whisperResult`

### 2. `main <-> chatbox window`

建议最小协议：

1. `typeless:getRuntimeSnapshot`
2. `typeless:onRuntimeSnapshot`
3. `typeless:onSessionUpdated`
4. `typeless:onResultUpdated`

主聊天窗口只订阅状态，不再拥有执行权。

## 生命周期与恢复

### 1. 应用启动

1. `main` 初始化 typeless daemon
2. 初始化 voice worker
3. 初始化 MCP runtime
4. 初始化 typeless snapshot

### 2. 主聊天窗口关闭 / 销毁

1. 只销毁 chat UI 本身
2. daemon、worker、overlay、结果窗继续存活
3. 当前 operation 不受影响

### 3. 主聊天窗口重建

1. 新窗口加载完成
2. 主动拉取 `TypelessRuntimeSnapshot`
3. 重新订阅后台状态
4. 恢复当前 session / message 展示

### 4. 应用退出

1. 先停止 typeless daemon
2. 停止 voice worker
3. 停止 MCP runtime
4. 销毁 overlay 与结果窗

## 错误处理

### 1. 录音失败

1. overlay 立即切错误态
2. 当前 operation 终止
3. snapshot 保留错误信息供 UI 重建后查看

### 2. ASR 失败

1. 标记 `error`
2. 不进入 LLM
3. 允许下一次热键直接重新开始

### 3. LLM / MCP 失败

1. 保留本轮 transcript
2. overlay 或结果窗显示失败信息
3. 若主窗口重建，可看到失败消息已写入会话

### 4. Worker 崩溃

1. `main` 监听 worker `closed/crashed`
2. 若当前正在录音，立即转为错误态
3. 若空闲，自动拉起新 worker

## 迁移计划

### Phase 1：引入 voice worker

1. 新建隐藏 worker window
2. 让录音脱离主聊天窗口
3. 保持其余流程仍在 renderer

### Phase 2：引入 typeless daemon

1. 把热键驱动从 chatbox renderer 转为 `main` daemon
2. daemon 控制 overlay 与 worker

### Phase 3：迁移 ASR

1. `doubao/openai/azure/google/aliyun/funasr-local` 迁到 `main`
2. `whisper-local` 留在 worker

### Phase 4：抽 session repository

1. 让 `main` 可直接创建 angrymiao session
2. 让 `main` 可直接读写消息

### Phase 5：迁移 generation runner

1. 主进程驱动 `LLM -> MCP -> continue generate`
2. 主窗口只观察，不执行

### Phase 6：主窗口观察者化

1. chatbox renderer 改为订阅后台 snapshot
2. 销毁重建后自动恢复 typeless 状态

## 测试策略

本轮至少需要以下验证：

### 1. 单元测试

1. typeless 状态机的状态转换
2. voice worker 生命周期与异常恢复
3. `asr-executor` 对不同 provider 的路由
4. `session-repository` CRUD 一致性
5. `generation-runner` 对 tool call 生命周期的处理

### 2. 集成测试

1. 主窗口销毁后，热键仍能触发录音
2. 主窗口销毁后，仍能完成 `ASR -> LLM -> MCP -> result`
3. 主窗口重建后，能恢复当前会话与结果
4. worker 崩溃后空闲态可自动恢复

### 3. 手动验证

1. 长按开始 / 松开结束
2. 短按取消
3. 中途打断当前轮次并重新开始
4. `doubao` / `funasr-local` / `whisper-local` 至少各测一次
5. 主聊天窗口在 `recording / asr / llm / mcp / result` 不同阶段被销毁再重建

## 风险与权衡

### 1. 最大风险是 LLM/MCP 迁移，不是录音

如果只解决录音，主窗口销毁后 typeless 仍然无法真正闭环。  
真正决定成败的是：

1. `generation-runner` 是否能脱离 renderer
2. `mcpController` 是否能迁到 `main`

### 2. `whisper-local` 不能强行纯主进程化

当前正确做法是接受它留在 worker，而不是为了“全 main”去引入高风险的原生重写。

### 3. Worker 不是妥协，而是稳定边界

把“浏览器能力”集中在隐藏 worker，把“业务编排”集中在 `main`，比继续把一切压在主聊天窗口 renderer 上更稳。

## 实现边界

本轮实现至少会触及：

1. `src/main/main.ts`
2. `src/main/global-keyboard-hook.ts`
3. `src/main/typeless-overlay.ts`
4. `src/main/typeless-chat-result.ts`
5. 新增 `src/main/typeless-daemon/*`
6. `src/preload/index.ts`
7. 新增 `src/preload/voice-worker.ts`
8. 新增 `src/renderer/voice-worker/*`
9. `src/renderer/hooks/useVoiceController.ts`
10. `src/renderer/packages/voice/asr/*`
11. `src/renderer/stores/session/messages.ts`
12. `src/renderer/packages/model-calls/stream-text.ts`
13. `src/renderer/packages/mcp/controller.ts`
14. `src/renderer/packages/voice/angrymiao-session.ts`

## 验收标准

本设计完成后的验收以以下四条为准：

1. 主聊天窗口被销毁后，长按热键仍能开始录音
2. 主聊天窗口不存在时，仍能完成 `ASR -> LLM -> MCP -> result`
3. 主聊天窗口重新打开后，能看到当前 typeless 会话与结果
4. 后台 typeless 运行期间，主窗口崩溃或被销毁不影响当前任务完成
