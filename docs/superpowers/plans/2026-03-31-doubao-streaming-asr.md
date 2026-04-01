# Doubao Streaming ASR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为语音链路接入豆包 Realtime ASR，让 Typeless 模式在录音期间获得真实流式转写，并在松开后基于 `completed` 文本进入现有 LLM 链路。

**Architecture:** 保留现有 `ASRProvider.transcribe(audioBlob)` 供非豆包 provider 使用，同时给 ASR 层增加可选 streaming session 接口。豆包 WebSocket 连接落在 Electron `main` 进程，通过 `preload` 暴露最小 IPC 会话桥接；`VoiceRecorder` 增加 16k PCM 帧输出；`useVoiceController` 仅在 `doubao + typeless` 分支切到真流式路径，其它模式保持兼容。

**Tech Stack:** TypeScript, Electron IPC, WebSocket, React, Zod, Vitest

---

## File Structure

- Modify: `src/shared/types/voice.ts`
  - 新增 `doubao` provider 和配置结构
- Modify: `src/shared/types/settings.ts`
  - 更新 settings schema 的 `voice.asrProvider`
- Modify: `src/shared/electron-types.ts`
  - 补齐豆包流式 ASR IPC 类型
- Modify: `src/renderer/packages/voice/asr/index.ts`
  - 增加 streaming session 抽象
- Create: `src/renderer/packages/voice/asr/doubao.ts`
  - renderer 侧 Doubao provider，桥接 preload API
- Modify: `src/renderer/packages/voice/recorder.ts`
  - 新增 PCM chunk 输出
- Modify: `src/renderer/packages/voice/__tests__/recorder.test.ts`
  - 覆盖 PCM 输出路径
- Modify: `src/preload/index.ts`
  - 暴露豆包 ASR IPC 桥接
- Modify: `src/main/main.ts`
  - 注册豆包 ASR IPC handle / event relay
- Create: `src/main/doubao-asr.ts`
  - main 侧 session 管理和 WebSocket 协议实现
- Modify: `src/renderer/hooks/useVoiceController.ts`
  - `doubao + typeless` 走 streaming session
- Modify: `src/renderer/hooks/useVoiceController.test.tsx`
  - 覆盖 streaming partial/completed/commit 链路
- Modify: `src/renderer/routes/settings/voice.tsx`
  - 新增豆包配置 UI 和 provider 选项

## Constraints

- 非 `doubao` provider 不要求升级到流式。
- 不改 `startTypelessRequest()` / `submitNewUserMessage()` 现有调用协议。
- renderer 不直接持有豆包 WebSocket。
- 若 Node/Electron 原生 `WebSocket` 无法满足 header 鉴权，再单独评估依赖增量；默认先不用新增依赖。

## Task 1: Add The Failing Streaming Tests First

**Files:**
- Modify: `src/renderer/packages/voice/__tests__/recorder.test.ts`
- Modify: `src/renderer/hooks/useVoiceController.test.tsx`

- [ ] **Step 1: Write the failing recorder PCM test**

在 `src/renderer/packages/voice/__tests__/recorder.test.ts` 新增测试，验证：

```ts
it('emits pcm chunks when onAudioChunk is provided', async () => {
  const onAudioChunk = vi.fn()

  await recorder.start({ onAudioChunk })

  // 驱动 mock audio processing
  expect(onAudioChunk).toHaveBeenCalled()
  expect(onAudioChunk.mock.calls[0][0]).toBeInstanceOf(Uint8Array)
})
```

- [ ] **Step 2: Write the failing voice controller streaming test**

在 `src/renderer/hooks/useVoiceController.test.tsx` 新增测试，验证：

```tsx
it('streams doubao asr partials and submits completed transcript on stop', async () => {
  // startRecording -> append chunk -> partial text visible
  // stopRecording -> commit -> completed text -> submitNewUserMessage called
})
```

关键断言：

- `appendAudio` 被调用
- partial 期间 `streamingText` 更新
- stop 时 `commit` 被调用
- `completed` 文本被用于 `startTypelessRequest()`

- [ ] **Step 3: Run the two targeted tests to verify RED**

Run:

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts src/renderer/hooks/useVoiceController.test.tsx
```

Expected:

```text
FAIL because recorder has no PCM callback and useVoiceController has no doubao streaming path
```

## Task 2: Add Shared Doubao Types And ASR Streaming Abstractions

**Files:**
- Modify: `src/shared/types/voice.ts`
- Modify: `src/shared/types/settings.ts`
- Modify: `src/shared/electron-types.ts`
- Modify: `src/renderer/packages/voice/asr/index.ts`

- [ ] **Step 1: Extend voice schemas**

在 `src/shared/types/voice.ts`：

- `ASRProviderSchema` 加入 `doubao`
- `ASRConfigSchema` 新增：

```ts
doubao: z.object({
  apiKey: z.string().optional(),
  appId: z.string().default(''),
  accessKey: z.string().default(''),
  resourceId: z.string().default('volc.bigasr.sauc.duration'),
  model: z.string().default('bigmodel'),
  baseURL: z.string().default('wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'),
}).optional()
```

- [ ] **Step 2: Extend settings schema**

在 `src/shared/types/settings.ts` 的 `voice.asrProvider` 枚举里加入 `doubao`。

- [ ] **Step 3: Add streaming ASR interfaces**

在 `src/renderer/packages/voice/asr/index.ts` 新增：

- `StreamingASRSessionEvent`
- `StreamingASRSession`
- `StreamingASRProvider`
- `isStreamingASRProvider()` type guard

- [ ] **Step 4: Add electron IPC types**

在 `src/shared/electron-types.ts` 加入：

- Doubao session create/append/commit/close 方法
- `onDoubaoASREvent()` 事件订阅

- [ ] **Step 5: Run the two targeted tests again**

Run:

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts src/renderer/hooks/useVoiceController.test.tsx
```

Expected:

```text
仍然 FAIL，但类型层已就绪，失败点收敛到实现缺失
```

## Task 3: Implement Main/Preload Doubao Streaming Session Bridge

**Files:**
- Create: `src/main/doubao-asr.ts`
- Modify: `src/main/main.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Implement main-side session manager**

创建 `src/main/doubao-asr.ts`：

- 管理 `Map<sessionId, WebSocket>`
- `createSession()` 时建立连接并发送 `transcription_session.update`
- `appendAudio()` 发送 `input_audio_buffer.append`
- `commitSession()` 发送 `input_audio_buffer.commit`
- `closeSession()` 关闭连接并清理
- 接收服务端事件并标准化成：

```ts
{ sessionId, type: 'partial' | 'final' | 'completed' | 'error', text?: string, message?: string }
```

- [ ] **Step 2: Register IPC in main**

在 `src/main/main.ts` 中注册：

- `doubaoASR:createSession`
- `doubaoASR:appendAudio`
- `doubaoASR:commitSession`
- `doubaoASR:closeSession`

并把 main 侧事件转发到 renderer。

- [ ] **Step 3: Expose preload bridge**

在 `src/preload/index.ts` 暴露对应 API 和事件订阅。

- [ ] **Step 4: Keep secrets out of renderer runtime state**

renderer 只把配置传给 `createSession`，不直接构造 WebSocket。

## Task 4: Implement Renderer Doubao Provider And Recorder PCM Output

**Files:**
- Create: `src/renderer/packages/voice/asr/doubao.ts`
- Modify: `src/renderer/packages/voice/asr/index.ts`
- Modify: `src/renderer/packages/voice/recorder.ts`
- Modify: `src/renderer/packages/voice/__tests__/recorder.test.ts`

- [ ] **Step 1: Implement renderer-side Doubao provider**

`src/renderer/packages/voice/asr/doubao.ts` 提供：

- `isAvailable()`
- `getName()`
- `transcribe()` 可直接抛出“Doubao 仅支持流式录音”或退回普通实现；推荐显式报错，避免误用
- `createStreamingSession()` 内部桥接 `window.electronAPI`

- [ ] **Step 2: Add PCM chunk output to recorder**

在 `VoiceRecorder.start()` options 中新增：

```ts
onAudioChunk?: (chunk: Uint8Array) => void
```

实现要点：

- 保留原 `MediaRecorder` blob 录音
- 额外用 Web Audio 提取单声道数据
- 重采样到 16kHz
- 转 `Int16` PCM
- 分片回调

- [ ] **Step 3: Make recorder test pass**

Run:

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts
```

Expected:

```text
PASS including the new PCM chunk test
```

## Task 5: Switch `useVoiceController` To True Streaming For `doubao + typeless`

**Files:**
- Modify: `src/renderer/hooks/useVoiceController.ts`
- Modify: `src/renderer/hooks/useVoiceController.test.tsx`

- [ ] **Step 1: Add doubao provider construction**

`getASRProvider()` 支持 `doubao`，使用 `DoubaoASRProvider`。

- [ ] **Step 2: Add streaming session lifecycle refs**

新增 refs/state：

- 当前 streaming session
- latest partial text
- completed transcript promise / resolver

- [ ] **Step 3: Update startRecording path**

在 `doubao + typeless` 下：

- 先创建 streaming session
- `recorder.start({ onAudioChunk })`
- PCM chunk 到来即 `appendAudio`
- partial/final 更新 `streamingText`

- [ ] **Step 4: Update stopRecording path**

在 `doubao + typeless` 下：

- 停录后 `commit`
- 等待 `completed`
- `setTranscript(completedText)`
- 清空 `streamingText`
- 继续进入现有 Typeless/LLM 提交流程

- [ ] **Step 5: Ensure cancel/cleanup closes session**

`cancelCurrentOperation()`、组件卸载、错误分支都必须 `closeSession()`。

- [ ] **Step 6: Run voice controller test to verify GREEN**

Run:

```bash
pnpm exec vitest run src/renderer/hooks/useVoiceController.test.tsx
```

Expected:

```text
PASS with doubao partial/commit/completed coverage
```

## Task 6: Add Settings UI And Focused Verification

**Files:**
- Modify: `src/renderer/routes/settings/voice.tsx`

- [ ] **Step 1: Add Doubao provider option and config form**

设置页增加：

- provider 选项 `doubao`
- `API Key`
- `Model`
- `Base URL`
- `Language`（可选）

- [ ] **Step 2: Update ASR test behavior**

`testASR()` 在 `doubao` 下只测试配置完整性和会话可创建性。

- [ ] **Step 3: Run focused automated verification**

Run:

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts src/renderer/hooks/useVoiceController.test.tsx
pnpm exec biome check src/shared/types/voice.ts src/shared/types/settings.ts src/shared/electron-types.ts src/renderer/packages/voice/asr/index.ts src/renderer/packages/voice/asr/doubao.ts src/renderer/packages/voice/recorder.ts src/renderer/packages/voice/__tests__/recorder.test.ts src/preload/index.ts src/main/doubao-asr.ts src/main/main.ts src/renderer/hooks/useVoiceController.ts src/renderer/hooks/useVoiceController.test.tsx src/renderer/routes/settings/voice.tsx
```

Expected:

```text
PASS
```

- [ ] **Step 4: Run repository typecheck signal**

Run:

```bash
pnpm check
```

Expected:

- PASS，或
- 若失败，明确区分是否为仓库已有问题

## Notes For Execution

- 当前会话未获显式子代理授权，因此不派发 reviewer agent，改为当前会话内人工复核。
- 若实现阶段发现豆包事件字段与官方文档存在差异，应以官方实时返回结构为准，限制修改范围在 `src/main/doubao-asr.ts` 及其桥接层。
