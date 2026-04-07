# Voice App OpenAI-Compatible LLM Runtime 设计

> 更新（2026-04-06）：
> 当前实现已经取消 `.env` 运行时配置路线。
> OpenAI-compatible LLM 配置现在统一来自应用数据目录下的 `settings.json`，
> 并通过设置页编辑、保存和重置。
> 本文中凡提到 `.env` 或 `from_env()` 的表述，均以 `settings.json` 为准。

## 背景

`voice-app` 当前已经具备以下能力：

1. 原生 Tauri 桌面壳可启动
2. 全局热键可驱动语音任务
3. 豆包流式 ASR 已可正确识别
4. `overlay / result / history / logs / settings` 都已接到 Rust runtime

当前缺口已经从 `ASR` 前半段转移到 `ASR` 后半段：

```text
长按录音 -> 豆包 ASR -> 识别文本
                     x
                 LLM 输出
                     x
                 历史与结果沉淀
```

用户已明确本阶段约束：

1. 先不接 MCP
2. 先不接文本插入
3. LLM 只要求兼容 OpenAI 协议
4. 配置继续使用 `.env`
5. 先做最短可验证闭环

## 目标

本阶段只实现：

1. 豆包 ASR 拿到最终 transcript 后进入 LLM 阶段
2. Rust runtime 调用一个 OpenAI-compatible `/chat/completions` 接口
3. 把 assistant 最终输出写回：
   - `RuntimeSnapshot.result`
   - `HistoryRecord.result`
   - `logs`
4. `result` 窗口展示：
   - 用户识别文本
   - LLM 最终回答
5. `settings` 面板展示安全的 LLM 配置快照

## 非目标

本阶段不做：

1. MCP tool calling
2. 外部文本插入
3. 多 provider registry
4. 完整模型设置 UI
5. 流式 LLM 输出
6. 多轮会话记忆

## 结论

采用以下路线：

**`ASR completed -> Rust 后台线程调用 OpenAI-compatible chat completions -> result/history/logs`**

关键决定：

1. 新增 `crates/llm-core/`，不把 HTTP 请求直接塞进 `app_state`
2. 本阶段只支持一个 provider 常量：`openai-compatible`
3. 接口固定使用 `/chat/completions`
4. 输入只用本轮最终 transcript，不引入历史上下文
5. 若 transcript 为空，直接失败，不进入 LLM
6. 若 LLM 返回空文本，直接失败，不写“成功但空结果”

## 状态流

本阶段对外状态流扩展为：

1. `待命中`
2. `正在聆听`
3. `正在识别`
4. `正在生成`
5. `已完成`
6. `识别失败`

推荐时序：

```text
待命中
  -> 长按热键
  -> 正在聆听

正在聆听
  -> 抬起热键
  -> commit 豆包会话
  -> 正在识别

正在识别
  -> 收到豆包 completed transcript
  -> 启动 OpenAI-compatible LLM
  -> 正在生成

正在生成
  -> 收到最终 assistant 文本
  -> 已完成

正在识别 / 正在生成
  -> 任一错误
  -> 识别失败
```

说明：

1. `正在识别` 只表示等待 ASR 最终文本
2. `正在生成` 专门表示等待 LLM 输出
3. 本阶段仍不引入 `MCP` 或 `插入中`

## 配置模型

根目录继续使用 `voice-app/.env`。

新增最小配置：

```env
VOICE_APP_LLM_BASE_URL=https://api.openai.com/v1
VOICE_APP_LLM_API_KEY=
VOICE_APP_LLM_MODEL=gpt-4o-mini
VOICE_APP_LLM_SYSTEM_PROMPT=你是一个桌面语音助手。请根据用户的语音转写文本，直接给出简洁、可执行的最终回答。
```

### 配置原则

1. 只保留单一路线：`openai-compatible`
2. `API_KEY` 不进入前端安全快照
3. 前端只展示：
   - `llm_provider = openai-compatible`
   - `llm_model`
   - `llm_base_url`
4. 未配置 `API_KEY` 时，任务进入 `识别失败`
5. 返回非 2xx、JSON 无法解析、`assistant` 文本为空，都进入 `识别失败`

## 架构设计

### 1. `crates/llm-core`

职责：

1. 读取 `.env` 中的 LLM 配置
2. 构造 OpenAI-compatible chat completion 请求
3. 解析最终 assistant 文本
4. 向上暴露安全配置快照

最小接口：

1. `OpenAiCompatibleLlmConfig::from_env()`
2. `OpenAiCompatibleLlmClient::generate(transcript: &str)`
3. `OpenAiCompatibleLlmConfig::runtime_config()`

### 2. `apps/desktop/src-tauri/src/app_state.rs`

职责变化：

1. `AppState` 同时持有：
   - 豆包 ASR 配置
   - OpenAI-compatible LLM 配置
2. `DoubaoSessionEvent::Completed` 不再直接 `complete_success_with`
3. 而是：
   - 更新 transcript
   - 切到 `正在生成`
   - 启动后台 LLM 线程
4. LLM 成功后才真正 `已完成`

### 3. `voice-core`

职责变化：

1. 扩展 `RuntimePhase`
2. 新增 `Generating`
3. 新增最小状态机入口：
   - `start_generating_with_transcript(...)`

### 4. `settings-core`

职责变化：

在安全快照中新增：

1. `llm_provider`
2. `llm_model`
3. `llm_base_url`

### 5. 前端

职责变化：

1. `RuntimeStatus` 能显示 `正在生成`
2. `SettingsPanel` 展示 LLM 安全配置
3. `HistoryPanel` 的 `result` 不再只是“识别完成”，而是 assistant 最终文本
4. `ResultWindow` 保持展示：
   - 识别文本
   - 任务结果

## 数据流

```text
全局热键
  -> AppState.start_voice_task
  -> 豆包流式 ASR
  -> transcript completed
  -> AppState.spawn_llm_generation
  -> llm-core 调 OpenAI-compatible chat completions
  -> AppState.complete_success_with(transcript, assistant_result)
  -> history/logs/runtime snapshot/result window
```

## 错误处理

必须显式处理：

1. transcript 为空
2. `VOICE_APP_LLM_API_KEY` 缺失
3. HTTP 非 2xx
4. 响应 JSON 不合法
5. `choices[0].message.content` 为空
6. 后台线程 panic / channel 关闭

统一要求：

1. 错误写入 logs
2. phase 进入 `识别失败`
3. 若已有 transcript，则保留 transcript

## 测试策略

本阶段至少需要：

1. `llm-core` 单测
   - 缺 key 报错
   - 本地 mock server 返回成功文本
   - 返回空文本时报错
2. `voice-core` 单测
   - `正在生成` 状态映射
3. `app_state` 单测
   - ASR completed 后进入 `正在生成`
   - LLM 成功后 `已完成`
   - LLM 失败后 `识别失败`
4. 前端测试
   - `SettingsPanel` 渲染 LLM 安全字段
   - `RuntimeStatus` 渲染 `正在生成`
   - `ResultWindow` / `HistoryPanel` 展示 assistant 输出
