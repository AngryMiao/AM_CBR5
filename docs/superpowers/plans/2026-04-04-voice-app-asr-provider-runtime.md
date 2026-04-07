# Voice App ASR Provider Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `voice-app` 从“真实录音 + 占位 transcript”推进到“真实录音 + 真实 ASR + done/error 闭环”。

**Architecture:** 本计划只接入一个最短可验证的 batch ASR provider，并把识别执行放进 Rust 后台线程，保持 `WebView` 继续只做观察层。配置入口先走环境变量和安全设置快照，不在这一轮扩展完整设置持久化或多 provider UI。

**Tech Stack:** Rust, Tauri 2, reqwest blocking client, multipart audio upload, Vitest, Cargo tests

---

## Scope Check

当前大设计里的“ASR + LLM + MCP loop”包含多个独立子系统：

1. 录音产物管理
2. ASR provider 配置与调用
3. processing 阶段后台任务编排
4. LLM 请求
5. MCP 执行
6. 文本注入

本计划**只处理第 1 到第 3 项**，不进入 LLM、MCP、文本注入。

## File Structure

- Modify: `voice-app/crates/asr-core/Cargo.toml`
- Modify: `voice-app/crates/asr-core/src/lib.rs`
- Create: `voice-app/crates/asr-core/tests/openai_provider.rs`
- Modify: `voice-app/crates/settings-core/src/model.rs`
- Modify: `voice-app/crates/settings-core/tests/settings_defaults.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_machine.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_machine.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

## Constraints

- 真实 ASR 不能假装成功；未配置 provider 时必须走明确错误态。
- API key 不能通过前端设置快照暴露。
- `processing` 阶段必须由 Rust 后台线程推进到 `done` 或 `error`，不能再依赖前端按钮补全。
- 这一轮只允许一个真实 provider，避免把范围扩成 registry/UI 大改。
- 录音产物仍然保留真实 WAV 文件落盘。

### Task 1: Define The ASR Runtime Boundary

**Files:**
- Modify: `voice-app/crates/asr-core/src/lib.rs`
- Modify: `voice-app/crates/settings-core/src/model.rs`

- [ ] **Step 1: Add the failing settings test expectation**

`settings-core/tests/settings_defaults.rs` 增加断言，要求默认设置里包含安全可展示的 ASR 信息：

```rust
assert_eq!(settings.asr_provider, "disabled");
assert_eq!(settings.asr_model, "gpt-4o-mini-transcribe");
```

- [ ] **Step 2: Add runtime config types in `asr-core`**

新增：

```rust
pub struct AsrRuntimeConfig {
    pub provider: String,
    pub model: String,
    pub base_url: String,
}

pub struct TranscriptionOutcome {
    pub transcript: String,
    pub result: String,
    pub detail: String,
}
```

- [ ] **Step 3: Add environment-driven configuration rules**

先支持以下环境变量：

```text
VOICE_APP_ASR_PROVIDER=openai
OPENAI_API_KEY=<secret>
VOICE_APP_ASR_MODEL=gpt-4o-mini-transcribe
VOICE_APP_ASR_BASE_URL=https://api.openai.com/v1
VOICE_APP_ASR_LANGUAGE=zh
```

默认行为：

```text
provider=disabled
model=gpt-4o-mini-transcribe
base_url=https://api.openai.com/v1
```

### Task 2: Write Failing ASR Provider Tests

**Files:**
- Create: `voice-app/crates/asr-core/tests/openai_provider.rs`
- Modify: `voice-app/crates/asr-core/Cargo.toml`

- [ ] **Step 1: Write the failing disabled-provider test**

```rust
#[test]
fn disabled_runtime_returns_configuration_error() {
    let service = AudioTranscriptionService::disabled();
    let artifact = sample_artifact();

    let error = service.transcribe(&artifact).expect_err("disabled service should fail");

    assert!(error.to_string().contains("VOICE_APP_ASR_PROVIDER"));
}
```

- [ ] **Step 2: Write the failing OpenAI multipart test**

使用本地 mock HTTP server 验证：

1. 请求路径是 `/audio/transcriptions`
2. 带 `Authorization: Bearer ...`
3. multipart body 里包含 `model`
4. 返回 JSON `{ "text": "hello from openai" }`

- [ ] **Step 3: Run the targeted test and verify RED**

Run:

```powershell
cargo test -p asr-core openai_provider -- --nocapture
```

Expected:

```text
FAIL
```

### Task 3: Implement The Minimal ASR Service

**Files:**
- Modify: `voice-app/crates/asr-core/src/lib.rs`
- Modify: `voice-app/crates/asr-core/Cargo.toml`

- [ ] **Step 1: Add blocking HTTP dependencies**

`asr-core/Cargo.toml` 增加：

```toml
reqwest = { version = "0.12", default-features = false, features = ["blocking", "json", "multipart", "rustls-tls"] }
serde_json = "1"
```

测试依赖增加本地 mock server 库。

- [ ] **Step 2: Implement `AudioTranscriptionService`**

最小 API：

```rust
pub struct AudioTranscriptionService { /* immutable config */ }

impl AudioTranscriptionService {
    pub fn disabled() -> Self { /* ... */ }
    pub fn from_env() -> Self { /* ... */ }
    pub fn runtime_config(&self) -> AsrRuntimeConfig { /* ... */ }
    pub fn transcribe(&self, artifact: &AudioCaptureArtifact) -> Result<TranscriptionOutcome, TranscriptionError> { /* ... */ }
}
```

- [ ] **Step 3: Implement the OpenAI transcription request**

请求必须：

1. POST `.../audio/transcriptions`
2. 使用 Bearer token
3. multipart 上传真实 WAV
4. 解析 JSON `text`
5. 在 transcript 为空时返回错误

- [ ] **Step 4: Run targeted ASR tests and verify GREEN**

Run:

```powershell
cargo test -p asr-core
```

Expected:

```text
PASS
```

### Task 4: Write Failing Runtime State Tests

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_machine.rs`
- Modify: `voice-app/crates/voice-core/tests/runtime_machine.rs`

- [ ] **Step 1: Add the failing runtime-machine error-path test**

新增测试要求支持真实错误文案，而不是 demo error：

```rust
machine.complete_error_with("partial transcript", "ASR failed", "OpenAI request failed");
```

- [ ] **Step 2: Add the failing app-state success-path test**

测试目标：

1. mock/service 驱动下，录音结束后进入 `processing`
2. 后台识别完成后进入 `done`
3. 最终 transcript 使用识别文本，而不是 `Recorded audio clip (...)`

- [ ] **Step 3: Add the failing app-state error-path test**

测试目标：

1. disabled/service error 时进入 `error`
2. 日志里出现 provider 错误
3. history 记录状态为 `error`

### Task 5: Implement Background Transcription In Tauri Runtime

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`
- Modify: `voice-app/crates/voice-core/src/runtime_machine.rs`

- [ ] **Step 1: Inject transcription service into `AppState`**

`AppState` 持有不可变 `AudioTranscriptionService`，默认：

1. `cfg(test)` 使用 mock 成功服务
2. 非测试环境使用 `from_env()`

- [ ] **Step 2: Replace auto-complete placeholder logic**

`stop_microphone_capture` / hotkey release 之后：

1. 先把 WAV artifact 放入 pending
2. runtime 进入 `processing`
3. 删除 `auto_complete_processing().or_else(|| Some(self.complete_demo()))` 这种 demo 成功回退
4. 后台线程消费 artifact 并执行 `transcribe`
5. 成功则 `complete_success_with`
6. 失败则 `complete_error_with`

- [ ] **Step 3: Emit runtime/history/log updates after background completion**

后台线程完成时仍然要：

1. `runtime-snapshot`
2. `history-updated`
3. `logs-updated`
4. 不再依赖固定 `700ms` 定时器决定成功，只由真实转写结果完成驱动

- [ ] **Step 4: Run targeted desktop Rust tests**

Run:

```powershell
cargo test -p voice-app-desktop
```

Expected:

```text
PASS
```

### Task 6: Update Frontend Tests And Safe ASR Visibility

**Files:**
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Extend the failing frontend mock**

mock 设置里增加：

```ts
asr_provider: 'openai'
asr_model: 'gpt-4o-mini-transcribe'
```

并让手动录音按钮走“processing -> done”或“processing -> error”的真实后台节奏。

- [ ] **Step 2: Extend the failing frontend assertions**

至少覆盖：

1. Settings 面板显示 ASR provider/model
2. 录音完成后展示真实 transcript 文本
3. provider 未配置时能展示错误态

- [ ] **Step 3: Implement the minimal UI copy changes**

只增加必要展示：

1. Settings 显示 provider/model
2. Runtime 面板错误提示不吞掉后台错误

- [ ] **Step 4: Run frontend tests**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test
```

Expected:

```text
PASS
```

### Task 7: Run Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run Rust workspace tests**

```powershell
cargo test
```

- [ ] **Step 2: Run frontend build**

```powershell
pnpm --dir voice-app/apps/desktop build
```

- [ ] **Step 3: Run desktop app smoke**

```powershell
pnpm --dir voice-app/apps/desktop exec tauri dev
```

验证要点：

1. app 可拉起
2. 按钮录音后能进入 processing
3. provider 未配置时落到明确 error
4. provider 已配置时能得到真实 transcript

## Notes For Execution

- 本计划完成后，`voice-app` 会拥有“真实录音 -> 真实 ASR -> done/error”的最小闭环，但**仍不等于完整 Typeless 产品**。
- 下一份计划才进入 `LLM -> MCP -> 文本注入`。
- 如果 OpenAI provider 因环境变量缺失无法运行，必须保留可见错误，不得回退成假 transcript。
