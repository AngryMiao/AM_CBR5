# 豆包流式 ASR 接入设计

## 背景

当前语音链路里，ASR 到 LLM 之间并不是真流式：

1. 录音中只是周期性把当前累计 `Blob` 交给 `asrProvider.transcribe()` 做轮询式预识别
2. 松开后再次对完整录音做一次最终识别
3. 只有拿到完整文本后，才把文本一次性提交给 Typeless/Chat 后续链路

这带来两个问题：

1. `streamingText` 只是重复整段重识别的 UI 幻觉，不是实时 ASR
2. 对支持实时语音识别的服务商，当前抽象无法利用其 streaming 能力

用户已明确确认，当前要直接接入“豆包一步到位流式 ASR”方案，而不是再加一个普通的单次转写 provider。

## 目标

本轮目标：

1. 新增 `doubao` ASR provider
2. 为 ASR 抽象增加可选 streaming session 能力
3. 在 Typeless 录音时持续发送音频帧给豆包 Realtime ASR
4. 用服务端 partial/completed 结果驱动 `streamingText` 和最终提交
5. 保留现有其它 ASR provider 的 `transcribe(audioBlob)` 路径，不做大面积重构

## 非目标

本轮不做：

1. 不把所有 ASR provider 一起升级成流式
2. 不改 Typeless 后续 `startTypelessRequest()` / `submitNewUserMessage()` 协议
3. 不改现有 TTS 链路
4. 不改现有 Chat 模式生成流程

## 关键约束

### 1. 豆包双向流式 ASR 鉴权

按 `2026-03-31` 官方文档，豆包双向流式识别当前使用：

- WebSocket 地址：`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async`
- 握手 Header：`X-Api-App-Key`、`X-Api-Access-Key`、`X-Api-Resource-Id`、`X-Api-Connect-Id`

这意味着 renderer 侧浏览器原生 `WebSocket` 不能稳定承载该连接，因为它不能携带这组自定义握手 header。

### 2. 音频格式

官方要求输入音频使用：

- 单声道
- 16kHz
- 16-bit PCM
- base64 编码后通过 `input_audio_buffer.append` 发送

当前 `VoiceRecorder` 只有 `MediaRecorder` 累积 `Blob` 的能力，不提供 PCM 帧输出，因此必须新增轻量帧回调能力。

## 方案比较

### 方案 1：推荐方案

新增可选 streaming ASR session 抽象；豆包 Realtime WebSocket 放在 Electron `main` 进程；renderer 录音器新增 PCM 帧输出；`useVoiceController` 在 `doubao + typeless` 下走真流式链路。

优点：

1. 满足豆包官方协议要求
2. 只对 `doubao` provider 启用流式，不打散其它 provider
3. `ASR -> LLM` 链路变成真实实时前置
4. 兼容现有 `transcribe(audioBlob)` 抽象

缺点：

1. 需要扩展 `main/preload` IPC
2. 需要给录音器增加 PCM 帧输出

### 方案 2：仅新增普通 Doubao ASR provider

优点：

1. 改动更小

缺点：

1. 仍然不是用户要的真流式
2. 无法利用豆包 Realtime ASR 能力

## 结论

采用方案 1。

## 设计总览

### 1. ASR 抽象扩展

保留现有：

```ts
transcribe(audioBlob: Blob, language?: string): Promise<string>
```

新增可选 streaming 能力：

```ts
type StreamingASRSessionEvent =
  | { type: 'partial'; text: string }
  | { type: 'final'; text: string }
  | { type: 'completed'; text: string }
  | { type: 'error'; message: string }

interface StreamingASRSession {
  appendAudio(chunk: Uint8Array): Promise<void>
  commit(): Promise<void>
  close(): Promise<void>
}

interface StreamingASRProvider extends ASRProvider {
  createStreamingSession(options: {
    language?: string
    onEvent: (event: StreamingASRSessionEvent) => void
  }): Promise<StreamingASRSession>
}
```

只有 `doubao` 实现该可选接口，其它 provider 不变。

### 2. Main 进程豆包 Realtime 桥接

新增一个独立 main 模块，负责：

1. 创建 WebSocket 连接
2. 发送 `transcription_session.update`
3. 接收 renderer 送来的 PCM 帧并转成 base64 后发送 `input_audio_buffer.append`
4. 在 stop 时发送 `input_audio_buffer.commit`
5. 把服务端 `partial/completed/error` 事件回推给 renderer

renderer 不直接接触 API Key，也不直接维护 WebSocket。

### 3. Preload 暴露流式 ASR API

通过 `contextBridge` 暴露最小会话式 API：

1. `createDoubaoASRSession(config)`
2. `appendDoubaoASRAudio(sessionId, chunk)`
3. `commitDoubaoASRSession(sessionId)`
4. `closeDoubaoASRSession(sessionId)`
5. `onDoubaoASREvent(callback)`

### 4. Recorder 新增 PCM 帧输出

保留 `MediaRecorder` 录整段 `Blob` 的现有逻辑。

新增一个轻量 PCM 帧回调，职责仅限：

1. 从麦克风流提取单声道浮点采样
2. 重采样到 16kHz
3. 转成 16-bit PCM `Uint8Array`
4. 分片回调给上层

这样：

1. 其它 provider 继续用最终 `Blob`
2. Doubao 流式 provider 用实时 PCM 帧

### 5. `useVoiceController` 链路调整

在 `doubao + typeless` 下：

1. `startRecording()` 时创建豆包流式会话
2. 录音期间每个 PCM chunk 直接 `appendAudio`
3. 服务端 `partial/final` 更新 `streamingText`
4. `stopRecording()` 时先停止采样，再 `commit`
5. 等待 `completed` 文本作为最终 transcript
6. 拿到最终文本后再进入现有 `startTypelessRequest()` / `submitNewUserMessage()` 流程

在非豆包 provider 或非 typeless 下，保持现有逻辑。

## 设置页设计

语音设置页新增：

1. `doubao` 到 ASR provider 下拉项
2. `apiKey`
3. `model`
4. 可选 `baseURL`
5. 测试 ASR 时只校验配置可用性，不要求录一段完整音频

## 测试策略

本轮至少补两类定向测试：

1. `recorder`
   - 新增 PCM chunk 回调测试
2. `useVoiceController`
   - `doubao + typeless` 下录音中更新 `streamingText`
   - 松开后 `commit`
   - 收到 `completed` 后提交给后续 Typeless/LLM 链路

## 风险与权衡

### 1. Electron/Node WebSocket 兼容性

当前环境下 Node 已存在全局 `WebSocket`，可以避免引入额外依赖。若实现阶段发现 Electron main 侧对 header 选项存在兼容问题，再单独评估是否补 `ws` 依赖。

### 2. 音频重采样复杂度

为了保持低入侵，本轮不做过重的音频引擎改造，只在 `VoiceRecorder` 内补最小 PCM 输出路径。

### 3. `completed` 才进入 LLM

用户要求是 ASR 真流式识别，但当前 LLM 入口仍以“拿到最终文本后提交”最稳。也就是说，这一轮实现的是“录音时 ASR 流式、松开后立即把完成文本交给 LLM”，而不是“ASR 每个 partial 都实时喂给 LLM”。

## 实现边界

本轮改动限定在：

- `src/shared/types/voice.ts`
- `src/shared/types/settings.ts`
- `src/shared/electron-types.ts`
- `src/renderer/packages/voice/asr/*`
- `src/renderer/packages/voice/recorder.ts`
- `src/renderer/packages/voice/__tests__/recorder.test.ts`
- `src/renderer/hooks/useVoiceController.ts`
- `src/renderer/hooks/useVoiceController.test.tsx`
- `src/renderer/routes/settings/voice.tsx`
- `src/preload/index.ts`
- `src/main/main.ts`
- 新增豆包流式 ASR main 模块
