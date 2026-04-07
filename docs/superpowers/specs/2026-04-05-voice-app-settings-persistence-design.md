# Voice App 设置持久化设计

> 更新（2026-04-06）：
> 当前实现已经取消 `.env` 作为过渡真源的方案。
> 配置系统现在只有一条正式路线：
> `settings.json` 是唯一真源，首次缺失时创建默认值，设置页负责编辑、保存与重置。
> `work_mode`、`.env` 导入、`.env` 重新导入均已从当前实现中移除。

## 背景

`voice-app` 当前已经具备：

1. 豆包流式 ASR
2. OpenAI-compatible LLM
3. 历史记录本地持久化
4. Tauri 原生桌面壳、tray、后台常驻
5. `SettingsPanel` 只读展示安全设置快照

当前配置链路仍然停留在“开发期方案”：

1. Rust runtime 启动时从 `voice-app/.env` 读取运行参数
2. `settings-core` 只持有一个展示型 `VoiceSettings`
3. 前端设置页不能编辑、不能保存、不能触发重新加载

这和目标产品形态不一致。

用户已经明确：

1. `.env` 只是过渡方案
2. 最终要支持配置编辑与保存
3. 设置页需要把当前 `.env` 内容纳入设置能力考虑，而不是继续只读展示

本设计文档的目标，是把 `voice-app` 的配置链路从“启动时读 `.env`”重定向为“正式设置存储 + `.env` 首次导入 / 显式重新导入”。

## 目标

本阶段只实现以下能力：

1. `settings-core` 成为正式配置真源
2. 配置持久化到应用数据目录中的 `settings.json`
3. 首次启动时，如果本地设置不存在，则从 `.env` 导入初始值
4. 前端设置页支持编辑、保存、重置、重新导入 `.env`
5. 保存后新的语音任务读取最新设置
6. 敏感字段支持编辑，但默认遮罩显示

## 非目标

本阶段不做：

1. 系统级安全存储（Windows Credential Manager / macOS Keychain）
2. 多 profile / 多环境切换
3. 设置实时热更新所有运行中任务
4. 发布版安装器里的首次引导
5. 远程同步配置
6. 把 `.env` 继续当作长期唯一真源

## 方案比较

### 方案 1：继续以 `.env` 作为主配置源

做法：

1. 设置页读取 `voice-app/.env`
2. 设置页保存时直接写回 `.env`
3. Rust runtime 下次任务再从 `.env` 读值

优点：

1. 改动最小
2. 短期验证快

缺点：

1. 原生桌面 App 与仓库目录强耦合
2. 发布版不可用
3. `.env` 不适合承担长期用户配置
4. 密钥与普通设置混在一起，类型和校验都弱

### 方案 2：推荐方案，正式设置存储 + `.env` 首次导入

做法：

1. `settings.json` 作为长期真源
2. `.env` 只用于：
   - 首次导入
   - 显式重新导入
3. 设置页始终编辑和保存 `settings.json`

优点：

1. 符合原生桌面产品形态
2. 与历史记录持久化路径一致
3. 后续可平滑迁移到更安全的密钥存储
4. `.env` 可以逐步退场，而不是成为长期包袱

缺点：

1. 比直接写 `.env` 多一层存储与迁移逻辑

### 方案 3：双写 `.env` 和 `settings.json`

做法：

1. 设置页保存时同时写 `.env`
2. 也同时写 `settings.json`

优点：

1. 过渡期看起来“兼容”

缺点：

1. 形成两个真源
2. 漂移难排查
3. 以后难以解释优先级

## 结论

采用方案 2：

**`settings.json` 成为长期真源，`.env` 只作为首次导入和显式重新导入来源。**

关键决定：

1. 不把 `.env` 继续做成最终真源
2. 本阶段不做系统级安全存储，先把“可编辑可保存”跑通
3. 保存后至少保证“下一次语音任务生效”
4. 设置页允许重新导入 `.env`，但这是一种显式操作，不是隐式覆盖

## 配置分层

推荐优先级如下：

```text
代码默认值
  -> .env 导入值（首次导入 / 显式重新导入）
  -> settings.json 已保存值（长期真源）
  -> AppState 当前运行时快照
```

### 约束

1. 正常运行时，`settings.json` 的优先级高于 `.env`
2. `.env` 不是每次启动都无条件覆盖
3. 只有在以下情况才从 `.env` 导入：
   - 首次启动，`settings.json` 不存在
   - 用户在设置页点击“从 `.env` 重新导入”

## 数据模型

### 1. `settings-core`

`settings-core` 应拆成两层：

1. `EditableVoiceSettings`
   - 面向前端可编辑合同
   - 可包含敏感字段
2. `RuntimeVoiceSettings`
   - 面向 runtime 的安全快照或运行时配置
   - 不要求直接暴露给前端
3. `SettingsStore`
   - 负责 JSON 持久化与加载

### 1.5 版本化

`settings.json` 应包含：

1. `schema_version`

原因：

1. 后续新增字段时可做显式迁移
2. 避免旧文件依赖默认值漂移
3. 有利于未来从本地明文密钥迁移到更安全存储

### 2. 字段覆盖范围

用户已经明确希望“把当前 `.env` 文件内容也放进设置里”。
因此本阶段设计要求不是只覆盖一部分字段，而是：

1. 当前 `voice-app/.env.example` 中的运行时字段都要有对应设置项
2. 可以按“基础 / 高级 / 敏感”分组展示
3. 允许前端折叠高级项，但不允许在模型层缺失

### 3. 推荐字段分组

#### 普通可编辑字段

1. `work_mode`
2. `history_enabled`
3. `default_hotkey`
4. `doubao_asr_url`
5. `doubao_asr_app_id`
6. `doubao_asr_resource_id`
7. `doubao_asr_model`
8. `doubao_asr_audio_rate`
9. `doubao_asr_audio_language`
10. `llm_base_url`
11. `llm_model`
12. `llm_system_prompt`

#### 高级可编辑字段

1. `doubao_asr_audio_format`
2. `doubao_asr_audio_bits`
3. `doubao_asr_audio_channel`
4. `doubao_asr_enable_itn`
5. `doubao_asr_enable_ddc`
6. `doubao_asr_enable_punc`
7. `doubao_asr_show_utterances`
8. `doubao_asr_force_to_speech_time`
9. `doubao_asr_end_window_size`
10. `doubao_asr_boosting_table_id`
11. `doubao_asr_context_json`

#### 敏感字段

1. `doubao_asr_access_token`
2. `llm_api_key`

### 4. 前端显示策略

1. 普通字段显示真实值
2. 敏感字段默认显示为遮罩或空占位
3. 敏感字段允许用户重新输入并保存
4. 前端编辑时拿 `EditableVoiceSettings`
5. 运行时观察层如果仍需要展示安全设置，则单独走 `RuntimeVoiceSettings`

## 启动加载设计

### 1. 路径

设置文件应落到应用数据目录，例如：

```text
<app_data_dir>/settings.json
```

与当前历史文件保持同一路径策略：

```text
<app_data_dir>/history.json
<app_data_dir>/settings.json
```

### 2. 启动顺序

推荐启动顺序：

```text
run()
  -> load .env from workspace root
  -> build env-derived settings candidate
  -> load settings.json if present
  -> choose final settings
  -> construct AppState
  -> setup windows / tray / hotkeys
```

### 3. 决策规则

1. 若 `settings.json` 存在且可解析：
   - 使用 `settings.json`
2. 若 `settings.json` 不存在：
   - 从 `.env` 导入并立即保存一份 `settings.json`
3. 若 `settings.json` 损坏：
   - 写日志
   - 回退到 `.env` 导入值
   - 保存新的 `settings.json`

## 前后端 API

### Rust commands

至少新增以下命令：

1. `get_editable_settings() -> VoiceSettings`
2. `save_editable_settings(input: VoiceSettingsInput) -> VoiceSettings`
3. `import_env_settings() -> VoiceSettings`
4. `reset_editable_settings() -> VoiceSettings`
5. `get_runtime_settings_snapshot() -> RuntimeVoiceSettings`

### 前端 bridge

`apps/desktop/src/lib/tauri.ts` 应新增：

1. `getEditableSettings`
2. `saveEditableSettings`
3. `importEnvSettings`
4. `resetEditableSettings`

## `AppState` 责任变化

`AppState` 当前只持有展示型 `VoiceSettings`，后续应改为：

1. 启动时持有完整设置对象
2. 保存成功后更新内存中的当前设置
3. 新语音任务从当前设置构造：
   - 豆包 ASR 配置
   - OpenAI-compatible LLM 配置

### 敏感字段语义

敏感字段保存时必须显式区分三种语义：

1. `unchanged`
   - 用户未修改，沿用当前已保存值
2. `replace`
   - 用户输入了新值，覆盖旧值
3. `clear`
   - 用户明确要清空

不允许把“表单里没显示真实密钥”误解释为“保存空字符串”。

### 生效语义

本阶段要求：

1. 保存成功后，下一次新语音任务必须使用最新设置
2. 对已经在运行中的任务，不强制热更新
3. 不在本阶段实现“保存时立即打断并重建会话”

## 设置页 UI 设计

设置页从“只读卡片”改为“可编辑表单”。

推荐最小操作：

1. `保存`
2. `重置为当前已保存`
3. `从 .env 重新导入`

### 表单分组

#### 通用

1. 工作模式
2. 默认热键
3. 是否保存历史

#### 豆包 ASR

1. WebSocket URL
2. App ID
3. Access Token
4. Resource ID
5. Model
6. Audio Rate
7. Audio Language
8. 高级参数折叠区：
   - Audio Format
   - Audio Bits
   - Audio Channel
   - Enable ITN
   - Enable DDC
   - Enable Punc
   - Show Utterances
   - Force To Speech Time
   - End Window Size
   - Boosting Table ID
   - Context JSON

#### OpenAI-compatible LLM

1. Base URL
2. API Key
3. Model
4. System Prompt

### 交互约束

1. 敏感字段用密码输入框
2. 保存时做基础校验
3. 保存失败时在设置页展示错误
4. 保存成功时给出明确提示
5. 敏感字段若未修改，应明确显示“保持当前已保存值”

## 错误处理

必须显式处理：

1. `settings.json` 不存在
2. `settings.json` 解析失败
3. `.env` 缺字段
4. 保存时目录创建失败
5. 保存时 JSON 写入失败
6. 表单字段类型非法

统一要求：

1. 错误进入 Rust logs
2. 设置页能看到错误提示
3. 不因为配置文件损坏导致整个 App 无法启动

## 测试策略

### Rust

至少覆盖：

1. `settings.json` 不存在时回退 `.env`
2. 首次导入会生成 `settings.json`
3. 保存后重新加载能拿到同样数据
4. 损坏的 `settings.json` 会回退并重建
5. 保存后 `AppState` 内存设置会更新
6. 敏感字段 `unchanged / replace / clear` 语义正确

### 前端

至少覆盖：

1. 设置页渲染完整表单
2. 编辑后点击保存会调用新 command
3. 敏感字段默认走密码输入
4. 点击“从 `.env` 重新导入”后 UI 刷新
5. 未修改敏感字段时保存不会清空已有值

### 原生 smoke

至少验证：

1. 原生 `tauri dev` 可启动
2. 设置页可以编辑并保存
3. 重启后保存值仍存在
4. 新语音任务使用新的配置

## 迁移路径

推荐按以下顺序实施：

1. `settings-core` 增加 JSON 持久化和 `.env` 导入
2. `src-tauri` 接入设置文件加载、保存与重载
3. `AppState` 改为基于当前内存设置构造任务配置
4. 前端 `SettingsPanel` 改成表单
5. 跑 Rust / 前端 / 原生 smoke

## 验收标准

本设计被认为满足需求，需同时满足：

1. `.env` 不再是长期唯一真源
2. `settings.json` 成为正式设置持久化载体
3. 首次启动可从 `.env` 导入
4. 设置页可编辑并保存
5. 保存后的新语音任务使用新配置
6. 敏感字段可编辑但默认遮罩
7. 配置损坏不会导致 App 无法启动

## 下一步

本设计确认后，下一步应执行：

1. 生成 implementation plan
2. 用 TDD 先补 `settings-core` 和 `src-tauri` 的失败测试
3. 再落设置页表单和保存链路
