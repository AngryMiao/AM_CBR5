# Voice App Settings Persistence Implementation Plan

> 更新（2026-04-06）：
> 当前实现已经收敛到 `settings.json` 单一真源。
> `.env` 首次导入、`.env` 重新导入、`work_mode` 字段都已不再属于当前实现范围。
> 实际代码路径以 `SettingsStore::load_or_create()`、设置页保存/重置、
> 以及基于已保存设置构造 ASR/LLM 配置为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `voice-app` 使用 `settings.json` 作为正式设置真源，并支持在设置页编辑、保存、重置、从 `.env` 显式重新导入。

**Architecture:** 配置生命周期下沉到 `settings-core`，由它负责默认值、`.env` 导入、JSON 持久化和敏感字段语义。`src-tauri` 在启动时加载 `settings.json`，首次缺失时从 `.env` 导入；前端设置页改为表单，保存后只要求下一次新语音任务使用新配置。

**Tech Stack:** Rust, Tauri 2, React, TypeScript, Vitest, serde, serde_json, dotenvy

---

## File Structure

- Modify: `voice-app/crates/settings-core/Cargo.toml`
  责任：补持久化和测试依赖。
- Modify: `voice-app/crates/settings-core/src/model.rs`
  责任：定义持久化设置、前端编辑快照、保存输入、敏感字段输入语义、`schema_version`。
- Create: `voice-app/crates/settings-core/src/store.rs`
  责任：实现 `settings.json` 的加载、保存、首次导入、损坏回退。
- Modify: `voice-app/crates/settings-core/src/lib.rs`
  责任：导出新的设置模型和 store API。
- Modify: `voice-app/crates/settings-core/tests/settings_defaults.rs`
  责任：校验新默认值和字段覆盖。
- Create: `voice-app/crates/settings-core/tests/settings_store.rs`
  责任：覆盖首次导入、保存重载、损坏回退、敏感字段语义。
- Modify: `voice-app/crates/asr-core/Cargo.toml`
  责任：允许 `asr-core` 通过显式依赖读取设置模型。
- Modify: `voice-app/crates/asr-core/src/config.rs`
  责任：新增从设置模型构造豆包配置的入口，脱离 `.env` 直读。
- Modify: `voice-app/crates/llm-core/Cargo.toml`
  责任：允许 `llm-core` 通过显式依赖读取设置模型。
- Modify: `voice-app/crates/llm-core/src/lib.rs`
  责任：新增从设置模型构造 LLM 配置的入口，脱离 `.env` 直读。
- Modify: `voice-app/apps/desktop/src-tauri/src/lib.rs`
  责任：增加 `settings_store_path`，在 `setup` 前后接入设置加载。
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
  责任：持有当前设置、支持保存/重置/重新导入，并让新任务基于当前设置构造 ASR/LLM 配置。
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`
  责任：新增设置相关 Tauri commands。
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
  责任：新增设置表单的 TS 合同和 command bridge。
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
  责任：把只读卡片改为可编辑表单。
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`
  责任：补设置页渲染、保存、重新导入的失败测试。
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
  责任：mock 新的设置读取/保存/导入命令，覆盖 secret `unchanged / replace / clear` 语义。
- Modify: `voice-app/apps/desktop/src/styles.css`
  责任：补设置表单、分组、按钮和状态提示样式。
- Modify: `voice-app/README.md`
  责任：说明 `settings.json` 为正式真源，`.env` 只做首次导入/显式重新导入。

## Task 1: Build `settings-core` Store And Contracts

**Files:**
- Modify: `voice-app/crates/settings-core/Cargo.toml`
- Modify: `voice-app/crates/settings-core/src/model.rs`
- Create: `voice-app/crates/settings-core/src/store.rs`
- Modify: `voice-app/crates/settings-core/src/lib.rs`
- Modify: `voice-app/crates/settings-core/tests/settings_defaults.rs`
- Create: `voice-app/crates/settings-core/tests/settings_store.rs`

- [ ] **Step 1: Write the failing settings store tests**

In `voice-app/crates/settings-core/tests/settings_store.rs`, add tests for:

```rust
use settings_core::{
  EditableSecretValueInput, SaveEditableVoiceSettingsInput, SettingsStore, StoredVoiceSettings,
};

#[test]
fn missing_store_imports_from_env_and_writes_settings_file() {
  std::env::set_var("VOICE_APP_DOUBAO_ASR_APP_ID", "app-id");
  std::env::set_var("VOICE_APP_DOUBAO_ASR_ACCESS_TOKEN", "secret-token");
  std::env::set_var("VOICE_APP_LLM_API_KEY", "llm-secret");

  let dir = tempfile::tempdir().expect("temp dir should exist");
  let path = dir.path().join("settings.json");

  let settings = SettingsStore::load_or_import(&path).expect("settings should load");

  assert_eq!(settings.doubao_asr_app_id, "app-id");
  assert_eq!(settings.doubao_asr_access_token, "secret-token");
  assert_eq!(settings.llm_api_key, "llm-secret");
  assert!(path.exists());
}

#[test]
fn broken_store_falls_back_to_env_and_rewrites_file() {
  std::env::set_var("VOICE_APP_DOUBAO_ASR_APP_ID", "env-app-id");

  let dir = tempfile::tempdir().expect("temp dir should exist");
  let path = dir.path().join("settings.json");
  std::fs::write(&path, "{ this is not valid json").expect("broken file should be seeded");

  let settings = SettingsStore::load_or_import(&path).expect("broken store should recover");
  let recovered = std::fs::read_to_string(&path).expect("rewritten file should exist");

  assert_eq!(settings.doubao_asr_app_id, "env-app-id");
  assert!(recovered.contains("\"schema_version\": 1"));
}

#[test]
fn save_preserves_secret_values_when_input_is_unchanged() {
  let dir = tempfile::tempdir().expect("temp dir should exist");
  let path = dir.path().join("settings.json");
  let current = StoredVoiceSettings::default();
  SettingsStore::save(&path, &current).expect("seed settings should save");

  let updated = SettingsStore::apply_input(
    &current,
    SaveEditableVoiceSettingsInput {
      llm_model: "gpt-4.1-mini".to_string(),
      doubao_asr_access_token: EditableSecretValueInput::Unchanged,
      llm_api_key: EditableSecretValueInput::Replace("next-llm-secret".to_string()),
      ..SaveEditableVoiceSettingsInput::from_settings(&current)
    },
  );

  assert_eq!(updated.doubao_asr_access_token, current.doubao_asr_access_token);
  assert_eq!(updated.llm_api_key, "next-llm-secret");
}

#[test]
fn save_can_clear_secret_values_explicitly() {
  let current = StoredVoiceSettings::default();

  let updated = SettingsStore::apply_input(
    &current,
    SaveEditableVoiceSettingsInput {
      doubao_asr_access_token: EditableSecretValueInput::Clear,
      llm_api_key: EditableSecretValueInput::Clear,
      ..SaveEditableVoiceSettingsInput::from_settings(&current)
    },
  );

  assert_eq!(updated.doubao_asr_access_token, "");
  assert_eq!(updated.llm_api_key, "");
}
```

- [ ] **Step 2: Extend the defaults test so it fails on missing fields**

In `voice-app/crates/settings-core/tests/settings_defaults.rs`, extend assertions so the test also requires:

```rust
assert_eq!(settings.schema_version, 1);
assert_eq!(settings.doubao_asr_audio_format, "pcm");
assert_eq!(settings.doubao_asr_audio_bits, 16);
assert_eq!(settings.doubao_asr_audio_channel, 1);
assert_eq!(settings.llm_system_prompt, "你是一个桌面语音助手。请根据用户的语音转写文本，直接给出简洁、可执行的最终回答。");
```

- [ ] **Step 3: Run the crate tests to verify RED**

Run:

```powershell
cargo test -p settings-core --test settings_defaults
cargo test -p settings-core --test settings_store
```

Expected:

```text
FAIL because StoredVoiceSettings / snapshot / save input / SettingsStore / new fields do not exist yet
```

- [ ] **Step 4: Implement the minimal settings contracts and store**

Implement in `voice-app/crates/settings-core/src/model.rs`:

```rust
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoredVoiceSettings {
  pub schema_version: u32,
  pub work_mode: String,
  pub history_enabled: bool,
  pub default_hotkey: String,
  pub doubao_asr_url: String,
  pub doubao_asr_app_id: String,
  pub doubao_asr_access_token: String,
  pub doubao_asr_resource_id: String,
  pub doubao_asr_model: String,
  pub doubao_asr_audio_format: String,
  pub doubao_asr_audio_rate: u32,
  pub doubao_asr_audio_bits: u16,
  pub doubao_asr_audio_channel: u16,
  pub doubao_asr_audio_language: String,
  pub doubao_asr_enable_itn: bool,
  pub doubao_asr_enable_ddc: bool,
  pub doubao_asr_enable_punc: bool,
  pub doubao_asr_show_utterances: bool,
  pub doubao_asr_force_to_speech_time: u64,
  pub doubao_asr_end_window_size: u16,
  pub doubao_asr_boosting_table_id: String,
  pub doubao_asr_context_json: String,
  pub llm_base_url: String,
  pub llm_api_key: String,
  pub llm_model: String,
  pub llm_system_prompt: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct EditableVoiceSettings {
  pub schema_version: u32,
  pub work_mode: String,
  pub history_enabled: bool,
  pub default_hotkey: String,
  pub doubao_asr_url: String,
  pub doubao_asr_app_id: String,
  pub doubao_asr_resource_id: String,
  pub doubao_asr_model: String,
  pub doubao_asr_audio_format: String,
  pub doubao_asr_audio_rate: u32,
  pub doubao_asr_audio_bits: u16,
  pub doubao_asr_audio_channel: u16,
  pub doubao_asr_audio_language: String,
  pub doubao_asr_enable_itn: bool,
  pub doubao_asr_enable_ddc: bool,
  pub doubao_asr_enable_punc: bool,
  pub doubao_asr_show_utterances: bool,
  pub doubao_asr_force_to_speech_time: u64,
  pub doubao_asr_end_window_size: u16,
  pub doubao_asr_boosting_table_id: String,
  pub doubao_asr_context_json: String,
  pub llm_base_url: String,
  pub llm_model: String,
  pub llm_system_prompt: String,
  pub has_doubao_asr_access_token: bool,
  pub has_llm_api_key: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct RuntimeVoiceSettings {
  pub work_mode: String,
  pub history_enabled: bool,
  pub default_hotkey: String,
  pub asr_provider: String,
  pub asr_model: String,
  pub asr_resource_id: String,
  pub asr_audio_rate: u32,
  pub llm_provider: String,
  pub llm_model: String,
  pub llm_base_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub enum EditableSecretValueInput {
  Unchanged,
  Replace(String),
  Clear,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct SaveEditableVoiceSettingsInput {
  pub schema_version: u32,
  pub work_mode: String,
  pub history_enabled: bool,
  pub default_hotkey: String,
  pub doubao_asr_url: String,
  pub doubao_asr_app_id: String,
  pub doubao_asr_resource_id: String,
  pub doubao_asr_model: String,
  pub doubao_asr_audio_format: String,
  pub doubao_asr_audio_rate: u32,
  pub doubao_asr_audio_bits: u16,
  pub doubao_asr_audio_channel: u16,
  pub doubao_asr_audio_language: String,
  pub doubao_asr_enable_itn: bool,
  pub doubao_asr_enable_ddc: bool,
  pub doubao_asr_enable_punc: bool,
  pub doubao_asr_show_utterances: bool,
  pub doubao_asr_force_to_speech_time: u64,
  pub doubao_asr_end_window_size: u16,
  pub doubao_asr_boosting_table_id: String,
  pub doubao_asr_context_json: String,
  pub llm_base_url: String,
  pub llm_model: String,
  pub llm_system_prompt: String,
  pub doubao_asr_access_token: EditableSecretValueInput,
  pub llm_api_key: EditableSecretValueInput,
}
```

Implement in `voice-app/crates/settings-core/src/store.rs`:

```rust
pub struct SettingsStore;

impl SettingsStore {
  pub fn load_or_import(path: &Path) -> Result<StoredVoiceSettings, String> { /* ... */ }
  pub fn load(path: &Path) -> Result<StoredVoiceSettings, String> { /* ... */ }
  pub fn save(path: &Path, settings: &StoredVoiceSettings) -> Result<(), String> { /* ... */ }
  pub fn import_from_env() -> StoredVoiceSettings { /* ... */ }
  pub fn snapshot(settings: &StoredVoiceSettings) -> EditableVoiceSettings { /* ... */ }
  pub fn apply_input(
    current: &StoredVoiceSettings,
    input: SaveEditableVoiceSettingsInput,
  ) -> StoredVoiceSettings { /* ... */ }
}
```

Requirements:

1. `schema_version` 默认值固定为 `1`
2. JSON 持久化格式固定为 `settings.json`
3. `load_or_import` 在文件缺失时从 `.env` 导入并立即保存
4. 文件损坏时回退 `.env` 导入值并覆盖重建

- [ ] **Step 5: Re-run the crate tests to verify GREEN**

Run:

```powershell
cargo test -p settings-core --test settings_defaults
cargo test -p settings-core --test settings_store
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

```bash
git add voice-app/crates/settings-core
git commit -m "feat(voice-app): 增加设置持久化存储"
```

## Task 2: Wire Saved Settings Into The Tauri Runtime

**Files:**
- Modify: `voice-app/crates/asr-core/Cargo.toml`
- Modify: `voice-app/crates/asr-core/src/config.rs`
- Modify: `voice-app/crates/llm-core/Cargo.toml`
- Modify: `voice-app/crates/llm-core/src/lib.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/lib.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/app_state.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/commands.rs`

- [ ] **Step 1: Write the failing Rust runtime tests**

In `voice-app/apps/desktop/src-tauri/src/app_state.rs`, add tests for:

```rust
#[test]
fn save_editable_settings_updates_runtime_snapshot() {
  let state = AppState::for_test();
  let mut input = SaveEditableVoiceSettingsInput::from_snapshot(&state.editable_settings());
  input.default_hotkey = "Hold Control+Shift+Space".to_string();
  input.llm_model = "gpt-4.1-mini".to_string();
  input.doubao_asr_access_token = EditableSecretValueInput::Unchanged;
  input.llm_api_key = EditableSecretValueInput::Unchanged;

  let saved = state
    .save_editable_settings(input)
    .expect("settings should save");

  assert_eq!(saved.default_hotkey, "Hold Control+Shift+Space");
  assert_eq!(state.voice_settings().llm_model, "gpt-4.1-mini");
}

#[test]
fn save_editable_settings_refreshes_llm_runtime_for_new_tasks() {
  let state = AppState::for_test();
  let mut input = SaveEditableVoiceSettingsInput::from_snapshot(&state.editable_settings());
  input.llm_model = "gpt-4.1-mini".to_string();
  input.doubao_asr_access_token = EditableSecretValueInput::Unchanged;
  input.llm_api_key = EditableSecretValueInput::Replace("next-secret".to_string());

  state.save_editable_settings(input).expect("settings should save");

  let runtime_settings = state.voice_settings();
  assert_eq!(runtime_settings.llm_model, "gpt-4.1-mini");
}

#[test]
fn reset_editable_settings_reloads_saved_store() {
  let state = AppState::for_test();
  let mut input = SaveEditableVoiceSettingsInput::from_snapshot(&state.editable_settings());
  input.llm_model = "gpt-4.1-mini".to_string();
  input.doubao_asr_access_token = EditableSecretValueInput::Unchanged;
  input.llm_api_key = EditableSecretValueInput::Unchanged;
  state.save_editable_settings(input).expect("settings should save");

  let reset = state.reset_editable_settings().expect("settings should reset");

  assert_eq!(reset.llm_model, "gpt-4.1-mini");
}
```

In `voice-app/apps/desktop/src-tauri/src/lib.rs`, add:

```rust
#[test]
fn settings_store_path_uses_app_data_dir() {
  let path = settings_store_path(Path::new("C:/voice-app-data"));
  assert_eq!(path, Path::new("C:/voice-app-data").join("settings.json"));
}
```

- [ ] **Step 2: Run the targeted Rust tests to verify RED**

Run:

```powershell
cargo test -p voice-app-desktop app_state::tests::save_editable_settings_updates_runtime_snapshot
cargo test -p voice-app-desktop settings_store_path_uses_app_data_dir
```

Expected:

```text
FAIL because editable settings snapshot / save input APIs and settings_store_path are missing
```

- [ ] **Step 3: Add settings-backed config constructors**

In `voice-app/crates/asr-core/src/config.rs`, add:

```rust
impl DoubaoAsrConfig {
  pub fn from_settings(settings: &settings_core::StoredVoiceSettings) -> Result<Self, DoubaoAsrError> {
    /* validate required fields and map settings fields */
  }
}
```

In `voice-app/crates/llm-core/src/lib.rs`, add:

```rust
impl OpenAiCompatibleLlmConfig {
  pub fn from_settings(settings: &settings_core::StoredVoiceSettings) -> Self {
    /* map settings fields into config */
  }
}
```

Also update:

```toml
# voice-app/crates/asr-core/Cargo.toml
settings-core = { path = "../settings-core" }

# voice-app/crates/llm-core/Cargo.toml
settings-core = { path = "../settings-core" }
```

- [ ] **Step 4: Implement runtime settings loading and commands**

In `voice-app/apps/desktop/src-tauri/src/lib.rs`:

1. Add `settings_store_path(app_data_dir: &Path) -> PathBuf`
2. In `setup`, call `state.configure_settings_store(settings_store_path(...))`

In `voice-app/apps/desktop/src-tauri/src/app_state.rs`:

1. Store both `editable_settings` and `runtime_settings`
2. Add methods:

```rust
pub fn configure_settings_store(&self, path: PathBuf) -> Result<(), String> { /* ... */ }
pub fn editable_settings(&self) -> EditableVoiceSettings { /* ... */ }
pub fn runtime_settings_snapshot(&self) -> RuntimeVoiceSettings { /* ... */ }
pub fn save_editable_settings(&self, input: SaveEditableVoiceSettingsInput) -> Result<EditableVoiceSettings, String> { /* ... */ }
pub fn import_env_settings(&self) -> Result<EditableVoiceSettings, String> { /* ... */ }
pub fn reset_editable_settings(&self) -> Result<EditableVoiceSettings, String> { /* ... */ }
```

3. When starting a live task, build fresh ASR/LLM configs from current saved settings instead of `from_env()`
4. Do **not** keep a stale `llm_service` outside the mutable settings lifecycle. Either:
   - remove the cached `llm_service` field and build a fresh service in `run_llm_generation()`, or
   - rebuild the service every time settings are saved / imported / reset

Preferred option: build a fresh `OpenAiCompatibleLlmService` from current saved settings inside `run_llm_generation()`

In `voice-app/apps/desktop/src-tauri/src/commands.rs`, add commands:

```rust
#[tauri::command]
pub fn get_editable_settings(state: State<'_, AppState>) -> EditableVoiceSettings { /* ... */ }

#[tauri::command]
pub fn save_editable_settings(
  state: State<'_, AppState>,
  input: SaveEditableVoiceSettingsInput,
) -> Result<EditableVoiceSettings, String> { /* ... */ }

#[tauri::command]
pub fn import_env_settings(state: State<'_, AppState>) -> Result<EditableVoiceSettings, String> { /* ... */ }

#[tauri::command]
pub fn reset_editable_settings(state: State<'_, AppState>) -> Result<EditableVoiceSettings, String> { /* ... */ }
```

- [ ] **Step 5: Re-run the targeted Rust tests to verify GREEN**

Run:

```powershell
cargo test -p voice-app-desktop app_state::tests::save_editable_settings_updates_runtime_snapshot
cargo test -p voice-app-desktop app_state::tests::reset_editable_settings_reloads_saved_store
cargo test -p voice-app-desktop settings_store_path_uses_app_data_dir
```

Expected:

```text
PASS
```

- [ ] **Step 6: Commit**

```bash
git add voice-app/crates/asr-core/src/config.rs voice-app/crates/llm-core/src/lib.rs voice-app/apps/desktop/src-tauri
git commit -m "feat(voice-app): 接入运行时设置存储"
```

## Task 3: Replace The Read-Only Settings Panel With An Editable Form

**Files:**
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Modify: `voice-app/apps/desktop/src/styles.css`

- [ ] **Step 1: Write the failing frontend tests**

In `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`, add:

```tsx
it('renders editable settings fields from the runtime', async () => {
  render(<App />)

  expect(await screen.findByDisplayValue('Hold Alt+Space')).toBeInTheDocument()
  expect(screen.getByLabelText('豆包 App ID')).toBeInTheDocument()
  expect(screen.getByLabelText('LLM API Key')).toHaveAttribute('type', 'password')
  expect(screen.getByLabelText('音频位深')).toBeInTheDocument()
})

it('saves edited settings without clearing unchanged secrets', async () => {
  render(<App />)

  fireEvent.change(await screen.findByLabelText('LLM 模型'), {
    target: { value: 'gpt-4.1-mini' },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

  await waitFor(() => {
    expect(invoke).toHaveBeenCalledWith(
      'save_editable_settings',
      expect.objectContaining({
        input: expect.objectContaining({
          llm_model: 'gpt-4.1-mini',
          llm_api_key: 'unchanged',
        }),
      }),
    )
  })
})

it('imports settings from env on demand', async () => {
  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: '从 .env 重新导入' }))

  await waitFor(() => {
    expect(invoke).toHaveBeenCalledWith('import_env_settings')
  })
})
```

- [ ] **Step 2: Run the frontend tests to verify RED**

Run:

```powershell
pnpm --dir apps/desktop test -- --run
```

Expected:

```text
FAIL because the settings panel is still read-only and new commands are missing
```

- [ ] **Step 3: Extend the frontend bridge and mocks**

In `voice-app/apps/desktop/src/lib/tauri.ts`, add:

```ts
export type EditableVoiceSettings = { /* editable snapshot without raw secrets */ }
export type SaveEditableVoiceSettingsInput = { /* non-secret fields + secret action enums */ }

export async function getEditableSettings() {
  return invoke<EditableVoiceSettings>('get_editable_settings')
}

export async function saveEditableSettings(input: SaveEditableVoiceSettingsInput) {
  return invoke<EditableVoiceSettings>('save_editable_settings', { input })
}

export async function importEnvSettings() {
  return invoke<EditableVoiceSettings>('import_env_settings')
}

export async function resetEditableSettings() {
  return invoke<EditableVoiceSettings>('reset_editable_settings')
}
```

In `voice-app/apps/desktop/src/test/setup.ts`, mock:

1. `get_editable_settings`
2. `save_editable_settings`
3. `import_env_settings`
4. `reset_editable_settings`

And preserve secret semantics by returning unchanged values unless the test explicitly replaces or clears them.
The mock save path should reject payloads that omit secret action fields, so the RED test proves the new contract is really being used.

- [ ] **Step 4: Implement the editable settings form**

In `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`, replace the `<dl>` view with a form that:

1. Loads `getEditableSettings()`
2. Renders grouped inputs:
   - 通用
   - 豆包 ASR
   - 高级参数
   - OpenAI-compatible LLM
3. Uses password inputs for `Access Token` and `API Key`
4. Shows buttons:
   - `保存设置`
   - `重置为已保存`
   - `从 .env 重新导入`
5. Shows success and error feedback

Use the simplest safe state model:

```tsx
const [draft, setDraft] = useState<EditableVoiceSettings | null>(null)
const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
```

- [ ] **Step 5: Re-run the frontend tests and build**

Run:

```powershell
pnpm --dir apps/desktop test -- --run
pnpm --dir apps/desktop build
```

Expected:

```text
PASS
vite build completed successfully
```

- [ ] **Step 6: Commit**

```bash
git add voice-app/apps/desktop/src voice-app/apps/desktop/src/lib/tauri.ts voice-app/apps/desktop/src/styles.css
git commit -m "feat(voice-app): 完成设置页编辑保存"
```

## Task 4: Update Docs And Run Full Verification

**Files:**
- Modify: `voice-app/README.md`

- [ ] **Step 1: Update README for the new config lifecycle**

Document:

1. `settings.json` is the long-term source of truth
2. `.env` is used only for first import or explicit re-import
3. Settings are saved under the app data directory
4. Secret fields are editable but masked in the UI

- [ ] **Step 2: Run the settings-core test suite**

Run:

```powershell
cargo test -p settings-core
```

Expected:

```text
PASS
```

- [ ] **Step 3: Run the desktop Rust test suite**

Run:

```powershell
cargo test -p voice-app-desktop
```

Expected:

```text
PASS
```

- [ ] **Step 4: Run the frontend regression tests**

Run:

```powershell
pnpm --dir apps/desktop test -- --run
pnpm --dir apps/desktop build
```

Expected:

```text
PASS
vite build completed successfully
```

- [ ] **Step 5: Run the native smoke test**

Run:

```powershell
pnpm --dir apps/desktop exec tauri dev
```

Verify manually:

1. 原生 `voice-app-desktop.exe` 启动
2. 设置页能编辑并保存
3. 点击“从 `.env` 重新导入”后表单刷新
4. 重启后保存值仍然存在
5. 新语音任务使用新配置

- [ ] **Step 6: Check workspace status**

Run:

```powershell
git status --short
```

Expected:

```text
only intended changes remain
```

- [ ] **Step 7: Commit**

```bash
git add voice-app/README.md
git commit -m "docs(voice-app): 更新设置持久化说明"
```

## Notes For Execution

- 本计划只覆盖设置持久化与设置页编辑，不扩展到 MCP、文本插入或系统动作。
- `.env` 在本计划中不是长期真源；执行时不要引入双写 `.env` + `settings.json`。
- 敏感字段必须严格区分 `unchanged / replace / clear`，不能因为前端遮罩而误清空。
- 若 `asr-core` / `llm-core` 需要从设置模型构造配置，优先新增显式构造函数，不要在运行时偷偷改写进程环境变量。
