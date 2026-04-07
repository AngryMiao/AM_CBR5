# Voice App 双平台低层键盘钩子设计

## 背景

`voice-app/` 当前已经具备以下能力：

1. Rust + Tauri 多窗口壳
2. `Runtime / History / Settings / Logs` 主界面
3. 豆包流式 ASR 主链
4. OpenAI-compatible LLM 与 MCP 工具调用链
5. 全局热键触发录音任务

但当前热键链路仍主要依赖：

1. `tauri-plugin-global-shortcut`
2. `automation-core::HoldToTalkController`

这条链路可以支撑“按下开始、抬起结束”的基础行为，但还没有达到旧 Electron `Typeless` 路线对系统级输入工具的要求。

当前主要差距是：

1. 没有真正的 `low-level keyboard hook`
2. 没有统一的双平台 native 按键事件采集层
3. 单键热键的原始输入回显问题没有可靠收口
4. macOS 辅助功能权限失败时，没有把“native hook 不可用”作为一等状态处理

用户已经明确本阶段要求：

1. `Windows` 和 `macOS` 都要实现
2. native low-level hook 必须成为主链
3. `global shortcut` 只能作为失败降级兜底
4. 最终目标是让 `voice-app` 更接近旧 TS `Typeless` 的系统级输入体验

本设计文档的目标，是为 `voice-app` 新增一套 **双平台 native low-level keyboard hook** 方案，并将其接入现有 Rust 热路径。

## 当前问题与收口范围

当前代码中的热键相关能力主要分布在：

1. `voice-app/crates/automation-core/src/global_hotkey.rs`
2. `voice-app/crates/automation-core/src/hold_to_talk.rs`
3. `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`

其中：

1. `GlobalHotkey` 负责解析形如 `Hold Alt+Space` 的字符串
2. `HoldToTalkController` 负责长按、短按、中断重启的状态判定
3. `hotkeys.rs` 负责把 Tauri global shortcut 事件推进到 `AppState`

因此，这一轮设计不能只改某一个平台文件，而必须同时覆盖：

1. `automation-core`
2. `src-tauri/hotkeys.rs`
3. `platform-core`
4. `platform_runtime`
5. 对应的 Rust tests 与 native smoke 验证路径

否则会继续维持“只有 global shortcut，没有 low-level hook”的半成品状态。

## 目标

本阶段只实现以下目标：

1. 在 `Windows` 上接入 `WH_KEYBOARD_LL`
2. 在 `macOS` 上接入 `CGEventTap`
3. 将平台原生键盘事件归一化为统一 Rust 事件模型
4. 用统一事件模型驱动现有 `HoldToTalkController`
5. 保持 `AppState` 的开始录音、结束录音与中断重启语义不变
6. 把 native hook 初始化失败、权限失败、线程退出等情况明确写入日志和平台诊断
7. 只在 native hook 不可用时，才降级到 `tauri-plugin-global-shortcut`

## 非目标

本阶段不做：

1. 不重写语音状态机
2. 不重写 ASR / LLM / MCP 主链
3. 不在这一轮完整实现所有平台权限申请按钮
4. 不把平台原生 key code 直接暴露给前端
5. 不把 `global shortcut` 当作并列主链保留
6. 不在这一轮处理 TTS、provider registry 或旧 chatbox 设置体系

### 明确不接受的方案

本阶段 implementation 不接受以下路线：

1. 继续仅依赖 `tauri-plugin-global-shortcut`
2. 用跨平台输入 crate 取代双平台原生实现，但又无法处理回显抑制和权限差异
3. 让平台 hook 直接推进业务状态机，绕过 `HoldToTalkController`
4. hook 初始化失败后静默退化，UI 仍显示“热键已就绪”

## 结论

采用以下路线：

**`automation-core` 自持双平台 native low-level keyboard hook 后端，`src-tauri` 只消费统一按键事件流。**

关键决定：

1. `Windows` 使用 `SetWindowsHookExW(WH_KEYBOARD_LL)`
2. `macOS` 使用 `CGEventTap`
3. native hook 是主链，`global shortcut` 只是 fallback
4. hook 层只负责事件采集和归一化，不负责业务状态推进
5. 长按、短按、中断重启仍由 `HoldToTalkController` 统一处理
6. hook 失败、权限失败、线程退出必须进入 runtime log 与平台诊断

## 架构设计

### 1. 模块边界

建议新增以下模块：

1. `voice-app/crates/automation-core/src/keyboard_hook.rs`
2. `voice-app/crates/automation-core/src/windows_keyboard_hook.rs`
3. `voice-app/crates/automation-core/src/macos_keyboard_hook.rs`

并修改以下现有模块：

1. `voice-app/crates/automation-core/src/lib.rs`
2. `voice-app/crates/automation-core/src/global_hotkey.rs`
3. `voice-app/crates/automation-core/src/hold_to_talk.rs`
4. `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`
5. `voice-app/apps/desktop/src-tauri/src/platform_runtime.rs`
6. `voice-app/crates/platform-core/src/lib.rs`

### 2. 职责划分

#### `keyboard_hook.rs`

负责：

1. 定义统一事件类型
2. 定义后端 trait
3. 定义 hook 生命周期句柄
4. 统一派发错误与退出事件

不负责：

1. 热键字符串解析
2. 长按状态机
3. 录音或窗口控制

#### `windows_keyboard_hook.rs`

负责：

1. `WH_KEYBOARD_LL` 安装与卸载
2. Windows 原生按键事件采集
3. 原生按键到统一事件模型的归一化
4. 为单键热键回显抑制保留能力口

#### `macos_keyboard_hook.rs`

负责：

1. `CGEventTap` 安装与卸载
2. 辅助功能权限失败时返回明确错误
3. macOS 原生按键事件到统一事件模型的归一化
4. 为单键热键抑制能力保留平台实现位

#### `global_hotkey.rs`

从当前的“解析显示字符串”扩展为：

1. 解析配置字符串
2. 匹配统一按键事件
3. 判断单键热键是否需要输入回显清理

#### `hold_to_talk.rs`

继续负责：

1. `Pressed -> StartListening`
2. `Released -> FinishListening / CancelListening`
3. `Processing / Generating` 阶段的中断重启

本阶段不引入平台差异逻辑。

#### `src-tauri/hotkeys.rs`

调整为：

1. 优先初始化 native low-level hook
2. 将 hook 事件送入 `GlobalHotkey` 匹配与 `HoldToTalkController`
3. 仅当 hook 初始化失败时，注册 `tauri-plugin-global-shortcut`
4. 失败或降级状态写入日志和平台诊断

### 3. 统一事件模型

推荐事件模型如下：

```rust
pub enum KeyboardHookEvent {
    Pressed {
        key: String,
        modifiers: Vec<String>,
        ts_ms: u64,
    },
    Released {
        key: String,
        modifiers: Vec<String>,
        ts_ms: u64,
    },
    Cancelled {
        reason: String,
        ts_ms: u64,
    },
}
```

约束如下：

1. `key` 与 `modifiers` 使用统一的规范化命名
2. `ts_ms` 用于继续驱动现有长按时间判定
3. `Cancelled` 用于表达 hook 被系统回收、线程退出、权限失效等异常事件

### 4. 数据流

native hook 主链推荐如下：

```text
Native keyboard hook
  -> normalize event
  -> GlobalHotkey matches configured shortcut
  -> HoldToTalkController decides next action
  -> src-tauri/hotkeys.rs maps action to AppState
  -> AppState start / stop / continue task
```

明确约束：

1. 平台实现不能直接调用 `AppState`
2. 平台实现不能直接控制 overlay / result window
3. 平台实现不能绕过 `HoldToTalkController`

## 平台策略

### Windows

采用：

1. `SetWindowsHookExW(WH_KEYBOARD_LL)`

要求：

1. hook 线程拥有独立消息循环
2. hook 生命周期可显式关闭
3. 线程异常退出时发出 `Cancelled`
4. 对单键热键保留 suppress 原始输入的实现口

### macOS

采用：

1. `CGEventTap`

要求：

1. 初始化前明确检查辅助功能权限结果
2. 无权限时返回可读错误，而不是 silent failure
3. event tap 被系统禁用或失效时发出 `Cancelled`
4. 平台诊断要能体现“native hook 未启用”的事实

## Fallback 策略

只允许以下降级链路：

```text
native low-level hook 初始化成功
  -> 使用 native hook 作为主链

native low-level hook 初始化失败
  -> 记录错误
  -> 更新平台诊断
  -> 降级到 tauri global shortcut

global shortcut 初始化失败
  -> 保持应用运行
  -> 进入可见错误态
  -> UI 和日志明确提示热键链路不可用
```

明确约束：

1. 不允许 native hook 成功后仍优先走 `global shortcut`
2. 不允许降级后 UI 仍显示“native hook 已启用”
3. `platform_diagnostics` 需要补充当前热键后端状态

## 配置与诊断

当前热键配置仍由 `settings.json` 中的：

1. `default_hotkey`

驱动。

本阶段不新增新的正式配置源，但平台诊断应扩展到至少能表达：

1. 当前热键后端：`native_hook / global_shortcut / unavailable`
2. macOS 辅助功能权限状态
3. native hook 最近一次失败原因

这些信息由 Rust 侧维护，并通过现有平台诊断 IPC 返回给前端。

## 错误处理

必须显式处理以下失败场景：

1. Windows hook 安装失败
2. Windows hook 线程消息循环异常退出
3. macOS `CGEventTap` 初始化失败
4. macOS 辅助功能权限缺失
5. 配置热键无法解析
6. native hook 事件流中断
7. fallback 到 `global shortcut` 后仍初始化失败

所有错误都必须：

1. 写入 runtime logs
2. 更新 platform diagnostics
3. 在 UI 可见

## 测试策略

### Rust 单元与集成测试

至少覆盖：

1. `GlobalHotkey` 能匹配归一化后的 `Pressed / Released` 事件
2. 修饰键热键能正确命中
3. 单键热键能正确命中
4. `Pressed -> quick Released` 会走取消
5. `Pressed -> hold -> Released` 会走完成
6. `Processing / Generating` 阶段的中断重启仍保持现有语义
7. hook backend 失败时会产出明确错误

### `src-tauri` 回归测试

至少覆盖：

1. hook 事件能推进 `AppState` 进入 `正在聆听`
2. 松开事件能推进 `AppState` 进入 `正在识别`
3. native hook 初始化失败时会降级到 `global shortcut`
4. native hook 与 fallback 状态会同步到日志和平台诊断

### 原生 smoke

#### Windows

至少验证：

1. 应用在后台常驻时也能响应热键
2. 外部输入框中长按热键能进入 `正在聆听`
3. 松开后进入 `正在识别`
4. 单键热键不会把明显的原始字符打进当前输入框
5. hook 线程异常退出时，日志和 UI 能看到降级或失败

#### macOS

至少验证：

1. 已授权辅助功能时，外部应用中热键可工作
2. 未授权时，native hook 初始化失败可见
3. 授权并重启应用后，链路恢复
4. 长按/松开语义与 Windows 一致
5. overlay / result / tray 行为不被 hook 切换破坏

## 验收标准

本设计被认为满足需求，需要同时满足：

1. `Windows` 和 `macOS` 都有独立 native low-level hook 后端
2. native hook 成为热键主链
3. `global shortcut` 只作为失败降级兜底
4. hook 层只负责事件采集，不直接推进业务状态机
5. 当前 `HoldToTalkController` 仍是长按语义唯一判定入口
6. 权限失败、线程退出、fallback 状态对 UI 和日志可见
7. 原生 smoke 明确覆盖 Windows 和 macOS 两端

## 下一步

本设计确认后，下一阶段应执行：

1. 生成 implementation plan
2. 先为 `automation-core` 写失败测试
3. 再补统一事件模型与 fake backend
4. 再接 `src-tauri/hotkeys.rs`
5. 最后分别接入 Windows 与 macOS native backend，并跑原生 smoke
