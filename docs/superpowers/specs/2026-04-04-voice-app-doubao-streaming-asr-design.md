# Voice App 豆包流式 ASR 设计

## 背景

`voice-app/` 当前已经具备以下基础能力：

1. Rust + Tauri 多窗口壳
2. 全局热键触发语音任务
3. 麦克风录音与本地 WAV 落盘
4. `Runtime / History / Logs / Settings` 前端观察层

但当前语音链路仍然停留在“录音结束后用占位 transcript 完成任务”的阶段，不符合目标产品形态。  
用户已经明确本阶段约束：

1. 只保留豆包 ASR
2. 配置使用 `.env` 管理
3. 采用豆包流式语音输入输出链路
4. 本阶段不做 TTS
5. 状态流使用中文标识
6. 不考虑其他平台或其他厂商的 ASR

本设计文档的目标，是把 `voice-app` 从“batch 占位识别”重定向为“豆包 WebSocket 流式 ASR”。

## 当前残留与收口范围

当前 `voice-app` 已存在明显的旧方向残留：

1. `settings-core` 仍默认暴露 OpenAI provider / model
2. `asr-core` 仍保留 OpenAI batch transcription 逻辑
3. `app_state` 仍依赖 `pending_audio_artifact -> run_pending_transcription`
4. `windowing` 仍按英文 phase 控制窗口显隐
5. 前端测试基建仍 hardcode 英文 phase 和 OpenAI 文案

因此，这一轮设计的收口范围不能只写成：

1. `asr-core`
2. `app_state`
3. `hotkeys`
4. 前端展示

还必须同时覆盖：

1. `settings-core`
2. `voice-core`
3. `ipc-contract`
4. `windowing`
5. `apps/desktop/src/test/setup.ts`
6. `apps/desktop/src/__tests__/*`

否则实现后仍会残留 `OpenAI + batch + 英文 phase` 的旧语义。

本阶段不仅要“停止使用”这些残留，还要把 **`voice-app` 内已有的 OpenAI ASR 相关实现和配置彻底移除**，避免形成死代码、假兼容或双路线并存。

## 目标

本阶段只实现以下闭环：

1. 长按语音快捷键后启动麦克风
2. 立即创建豆包流式 ASR 会话
3. 持续向豆包发送音频 chunk
4. 持续接收 partial / final transcript
5. 前端实时展示流式文本输出
6. 抬起快捷键后提交最后一包并等待服务端完成
7. 任务最终进入 `已完成` 或 `识别失败`

## 非目标

本阶段不做：

1. TTS / 语音播报
2. OpenAI / FunASR / Whisper / Azure / Google / Aliyun 等任何其他 ASR
3. 任何面向“未来多 provider / 多平台 ASR”的抽象层
4. 录音结束后再一次性 batch 转写
5. LLM / MCP / 文本注入
6. 完整 provider UI 管理界面

### 明确移除项

本阶段 implementation 必须删除以下现有残留，而不是保留为备用路径：

1. `asr-core` 中的 OpenAI transcription service / config / HTTP 调用
2. `settings-core` 中默认 `openai` / `gpt-4o-mini-transcribe`
3. 前端 `VoiceSettings`、mock、tests 中的 OpenAI provider 文案
4. 任何“以后也许切回 OpenAI”的保留分支

## 结论

采用以下路线：

**`Rust 直连豆包 WebSocket 流式 ASR + .env 配置 + 中文状态流`**

关键决定：

1. 删除当前 OpenAI / batch 方向，不继续沿用 `/audio/transcriptions` 方案
2. 继续保留 Rust 侧热路径，不让前端进入实时识别主链
3. 识别文本以流式事件驱动更新，而不是等待固定延时后完成
4. `.env` 由 Rust runtime 统一加载，前端只读取安全快照
5. 豆包 ASR 是唯一目标能力，不为其他 ASR provider 或其他平台 ASR 预留实现抽象
6. `voice-app` 中现有 OpenAI ASR 代码、默认值、测试文案和 mock 必须删除，而不是保留为兼容实现

## 状态流

本阶段对外状态流统一使用中文标识：

1. `待命中`
2. `正在聆听`
3. `正在识别`
4. `已完成`
5. `识别失败`

推荐时序如下：

```text
待命中
  -> 长按按下语音快捷键
  -> 启动麦克风
  -> 创建豆包 ASR 流式会话
  -> 状态：正在聆听

正在聆听
  -> 用户语音输入
  -> 持续采集音频 chunk
  -> 持续发送到豆包 ASR
  -> 持续接收 partial / final transcript
  -> 流式输出文本
  -> 状态保持：正在聆听

抬起语音快捷键
  -> 停止采集麦克风
  -> commit 豆包会话
  -> 状态：正在识别

正在识别
  -> 等待服务端 completed
  -> 成功：已完成
  -> 失败：识别失败
```

### 状态语义

### 合同边界

中文状态不只是 UI 文案，而是本阶段的**对外合同**：

1. `RuntimeSnapshot.phase` 使用中文
2. 前端所有基于 `phase` 的展示使用中文
3. `windowing` 依据中文 `phase` 控制 overlay / result 显隐
4. 前端 tests / mock / fixture 同步使用中文状态

内部 `voice-core::RuntimePhase` 可以继续保留英文枚举，  
但必须在 Rust 到前端的 contract 边界完成统一映射。  
也就是说：

```text
internal enum -> RuntimeSnapshot.phase(中文) -> UI / windowing / tests
```

这样能同时满足：

1. 用户要求状态流中文化
2. 内部状态机不必为了文案修改而失稳

#### `待命中`

表示没有活跃语音任务，等待用户触发热键。

#### `正在聆听`

表示录音和流式发送已经开始。  
此时前端会持续收到新的 transcript 增量，但任务尚未收尾。

#### `正在识别`

表示用户已经抬起热键，录音结束，客户端已经 commit。  
系统正在等待豆包返回最后一轮完成结果。

#### `已完成`

表示服务端返回 completed，当前任务收尾成功。

#### `识别失败`

表示连接、鉴权、协议、音频发送或服务端返回出现错误。

## 配置模型

本阶段配置全部由 `.env` 管理，根目录为 `voice-app/`。

推荐最小配置如下：

```env
VOICE_APP_DOUBAO_ASR_URL=wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async
VOICE_APP_DOUBAO_ASR_APP_ID=
VOICE_APP_DOUBAO_ASR_ACCESS_TOKEN=
VOICE_APP_DOUBAO_ASR_RESOURCE_ID=volc.bigasr.sauc.duration
VOICE_APP_DOUBAO_ASR_MODEL=bigmodel

VOICE_APP_DOUBAO_ASR_AUDIO_FORMAT=pcm
VOICE_APP_DOUBAO_ASR_AUDIO_RATE=16000
VOICE_APP_DOUBAO_ASR_AUDIO_BITS=16
VOICE_APP_DOUBAO_ASR_AUDIO_CHANNEL=1
VOICE_APP_DOUBAO_ASR_AUDIO_LANGUAGE=zh-CN

VOICE_APP_DOUBAO_ASR_ENABLE_ITN=false
VOICE_APP_DOUBAO_ASR_ENABLE_DDC=false
VOICE_APP_DOUBAO_ASR_ENABLE_PUNC=false
VOICE_APP_DOUBAO_ASR_SHOW_UTTERANCES=true
VOICE_APP_DOUBAO_ASR_FORCE_TO_SPEECH_TIME=0
VOICE_APP_DOUBAO_ASR_END_WINDOW_SIZE=800

VOICE_APP_DOUBAO_ASR_BOOSTING_TABLE_ID=
VOICE_APP_DOUBAO_ASR_CONTEXT_JSON=
```

### 配置原则

1. `.env` 中只保留豆包流式 ASR 所需配置
2. 敏感字段如 `ACCESS_TOKEN` 不能进入前端快照
3. 前端设置页只展示安全字段，例如：
   - provider = `doubao`
   - model
   - 音频采样率
   - 当前资源 ID
4. 缺少必要配置时，任务必须进入 `识别失败`
5. 不新增 `provider registry`、`provider switch`、`fallback provider` 等配置

## 架构设计

### 1. `asr-core`

`asr-core` 负责：

1. 豆包流式会话创建
2. WebSocket 协议帧编解码
3. 音频 chunk 发送
4. partial / final / completed / error 事件解析
5. `.env` 配置读取与校验

本阶段 `asr-core` 不承担多 provider 选择，也不承担平台兼容抽象。  
它只负责豆包流式 ASR，而且这不是“默认 provider”，而是**唯一 provider**。

因此当前 `asr-core` 里已有的 OpenAI batch service 必须删除，不能以 dead code 形式保留。

### 2. `app_state`

`AppState` 负责：

1. 热键触发后创建流式识别任务
2. 持有当前活跃识别会话
3. 处理来自 `asr-core` 的流式事件
4. 更新 runtime snapshot
5. 在完成或失败时写入 history 和 logs

当前 batch 模型中的：

1. `pending_audio_artifact`
2. “录音结束后再统一转写”
3. `700ms` 延时自动完成

都必须移除或退化为仅调试用途。

### 2.5 `voice-core`

`voice-core` 负责：

1. 保留内部状态机与生命周期约束
2. 在 snapshot 输出边界支持中文 `phase`
3. 支持 partial / final / completed / error 驱动的状态演进

`voice-core` 不再默认围绕 demo transcript 和 batch 完成模型组织状态。

### 2.6 `ipc-contract`

`ipc-contract` 负责：

1. 将 `RuntimeSnapshot.phase` 明确为中文合同字段
2. 保持 transcript / result / detail 为前端可直接展示的字符串
3. 为流式 transcript 更新保留稳定事件载荷格式

`ipc-contract` 是这轮“中文状态流”落地的关键边界，不能遗漏。

### 2.7 `windowing`

`windowing` 负责：

1. 基于中文 `phase` 控制 overlay / result 显隐
2. 不再依赖英文 `idle/listening/processing/done/error`

推荐窗口策略：

1. `待命中`：overlay 隐藏，result 隐藏
2. `正在聆听`：overlay 显示，result 隐藏
3. `正在识别`：overlay 显示，result 隐藏
4. `已完成`：overlay 隐藏，result 显示
5. `识别失败`：overlay 隐藏，result 显示

### 3. `hotkeys`

`hotkeys` 负责：

1. `Pressed -> start streaming task`
2. `Released -> stop capture + commit session`

`hotkeys` 不再负责“延时等一下自动 complete”。

### 4. 前端

前端继续只做观察层：

1. `RuntimeStatus` 展示中文状态
2. `OverlayWindow` 展示实时 transcript
3. `ResultWindow` 展示最终 transcript
4. `HistoryPanel` 展示最终结果
5. `SettingsPanel` 展示安全配置快照

前端不直接管理 WebSocket 会话，不直接上传音频。

## 数据流

### 1. 热路径

```text
Global Hotkey Pressed
  -> AppState start streaming session
  -> microphone capture begins
  -> ASR websocket connects
  -> phase = 正在聆听

Microphone chunk
  -> append audio to doubao session
  -> receive partial/final events
  -> update runtime transcript
  -> emit runtime-snapshot

Global Hotkey Released
  -> stop microphone capture
  -> commit doubao session
  -> phase = 正在识别

Doubao completed
  -> finalize transcript
  -> phase = 已完成
  -> persist history
  -> emit logs/history/runtime

Doubao error
  -> phase = 识别失败
  -> persist failure history
  -> emit logs/history/runtime
```

### 2. 流式输出

“流式输出”在本阶段仅指：

1. runtime snapshot 中的 transcript 持续更新
2. overlay/result/history UI 持续看到新的文本

不包含语音播放输出。

## 协议与实现来源

协议实现应以旧 Electron 的豆包实现作为迁移参考：

1. `src/main/doubao-asr.ts`
2. `src/renderer/packages/voice/asr/doubao.ts`

可迁移能力包括：

1. WebSocket 建连头
2. 帧封包与解包
3. partial / final / completed / error 事件语义
4. completed 触发条件

但新实现必须迁移到 Rust，不能继续依赖 `window.electronAPI`。

## 启动与 `.env` 加载顺序

`.env` 必须在 Rust runtime 构造 `AppState` 之前加载完成。  
原因是当前配置读取路径最终会在 `AppState` 初始化阶段进入 `asr-core`。

因此启动顺序必须调整为：

```text
src-tauri::run()
  -> load .env from voice-app root
  -> build Doubao runtime config
  -> construct AppState
  -> tauri::Builder.manage(AppState)
  -> setup windows / hotkeys
```

### 约束

1. `.env` 加载不能放在 `setup()` 之后
2. `AppState::default()` 不应继续偷偷读取未初始化环境
3. 推荐新增显式构造路径，例如：
   - `AppState::from_runtime_config(...)`
   - 或 `build_app_state_from_env()`
4. 若 `.env` 缺少必要字段，应用仍可启动，但语音任务启动时必须进入 `识别失败`

## 测试与模拟层收口

本阶段不只是“补几个新测试”，还必须清理旧测试基建中的旧语义。

### 需要同步改造的测试层

1. `apps/desktop/src/test/setup.ts`
2. `apps/desktop/src/__tests__/app-shell.test.tsx`
3. `windowing` 相关 Rust tests
4. `settings-core` 默认值 tests
5. `voice-core` runtime machine tests

### 需要同步清理的代码层

1. `settings-core` 的 OpenAI 默认值
2. `asr-core` 的 OpenAI 服务实现
3. `app_state` 的 batch transcription 路径
4. 前端 `setup.ts` / `app-shell.test.tsx` 的 OpenAI mock 文案

### 必须移除的旧测试语义

1. `openai`
2. `gpt-4o-mini-transcribe`
3. `idle / listening / processing / done / error`
4. batch `Saved WAV to ...` 作为识别主结果
5. “OpenAI 仍保留但暂时不用”的兼容分支

### 必须新增的测试语义

1. `doubao`
2. 中文 `phase`
3. partial transcript 流式更新
4. `Released -> commit -> completed/error`
5. `.env` 缺失时错误路径

## 错误处理

必须显式处理以下失败场景：

1. `.env` 缺少必要字段
2. WebSocket 建连失败
3. 鉴权失败
4. 协议帧解析失败
5. 音频采集失败
6. 音频发送失败
7. 服务端 completed 之前连接断开

所有错误都必须：

1. 写入 Rust logs
2. 更新 runtime 状态为 `识别失败`
3. 进入 history 失败记录
4. 在 UI 可见

## 测试策略

### Rust

至少覆盖：

1. `.env` 配置缺失时返回明确错误
2. partial 事件会更新 transcript
3. completed 事件会推进到 `已完成`
4. error 事件会推进到 `识别失败`
5. `Released` 之后不会继续发送音频

### 前端

至少覆盖：

1. 中文状态展示正确
2. partial transcript 能实时显示
3. completed 后进入 `已完成`
4. error 时展示失败消息

### 原生 smoke

必须验证：

1. `pnpm --dir apps/desktop exec tauri dev` 能拉起原生 exe
2. 热键/调试按钮能看到中文状态变化
3. `.env` 缺失时失败路径可见

## 验收标准

本设计被认为满足需求，需要同时满足：

1. 只保留豆包流式 ASR
2. 不考虑其他平台或其他厂商的 ASR
3. 配置改为 `.env`
4. 不做 TTS
5. 状态流改为中文
6. 热路径改为流式识别，而不是 batch 占位转写
7. 前端继续只做观察层
8. `OpenAI + batch + 英文 phase` 残留已经从运行时合同、窗口控制和测试层同步清除
9. `voice-app` 内不再保留 OpenAI ASR 相关实现、默认值和 mock

## 下一步

本设计确认后，下一步应执行：

1. 生成新的 implementation plan
2. 删除当前 OpenAI / batch 设计残留
3. 以 TDD 重写 `asr-core / app_state / hotkeys / 前端 mock`
4. 跑 Rust / 前端 / 原生 smoke 验证
