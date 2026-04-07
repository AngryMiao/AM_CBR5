# Voice App Native Keyboard Hook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `voice-app` 建立 `Windows + macOS` 双平台 native low-level keyboard hook 主链，并让 `src-tauri` 优先使用该主链驱动现有 hold-to-talk 语义。

**Architecture:** 在 `automation-core` 中新增统一 keyboard hook 抽象和双平台后端，平台实现只负责采集和归一化按键事件；`GlobalHotkey` 负责匹配配置热键，`HoldToTalkController` 继续负责长按语义判定，`src-tauri/hotkeys.rs` 将判定结果映射到现有 `AppState`。`tauri-plugin-global-shortcut` 保留为 fallback，但不能再作为主链。

**Tech Stack:** Rust, Tauri 2, Windows Win32 API (`WH_KEYBOARD_LL`), macOS CoreGraphics (`CGEventTap`), Cargo tests

---

### Task 1: 建立统一 keyboard hook 抽象与失败测试

**Files:**
- Modify: `voice-app/crates/automation-core/src/lib.rs`
- Modify: `voice-app/crates/automation-core/src/global_hotkey.rs`
- Create: `voice-app/crates/automation-core/src/keyboard_hook.rs`
- Create: `voice-app/crates/automation-core/tests/keyboard_hook.rs`
- Test: `voice-app/crates/automation-core/tests/global_hotkey.rs`
- Test: `voice-app/crates/automation-core/tests/keyboard_hook.rs`

- [ ] **Step 1: 先写失败测试，覆盖归一化按键事件与热键匹配**

新增测试至少覆盖：

```rust
use automation_core::{GlobalHotkey, KeyboardHookEvent};

#[test]
fn matches_modifier_plus_primary_key_pressed_event() {
    let hotkey = GlobalHotkey::parse("Hold Alt+Space").unwrap();
    let event = KeyboardHookEvent::pressed("Space", ["Alt"], 1000);

    assert!(hotkey.matches_pressed_event(&event));
}

#[test]
fn matches_single_key_hotkey_event() {
    let hotkey = GlobalHotkey::parse("Hold Space").unwrap();
    let event = KeyboardHookEvent::pressed("Space", [], 1000);

    assert!(hotkey.matches_pressed_event(&event));
    assert!(hotkey.needs_input_echo_cleanup());
}
```

- [ ] **Step 2: 运行定向测试，确认先红**

Run:

```powershell
cargo test -p automation-core global_hotkey -- --nocapture
```

Expected:

```text
FAIL，提示新的 KeyboardHookEvent / matches_* API 尚不存在
```

- [ ] **Step 3: 用最小实现补齐统一抽象**

要求：

1. `keyboard_hook.rs` 定义：
   - `KeyboardHookEvent`
   - `KeyboardHookBackend`
   - `KeyboardHookHandle`
   - 统一错误类型
2. `global_hotkey.rs` 增加：
   - `matches_pressed_event`
   - `matches_released_event`
   - 必要的 key/modifier 规范化
3. `lib.rs` 导出新的 keyboard hook API

- [ ] **Step 4: 运行 automation-core 测试，确认转绿**

Run:

```powershell
cargo test -p automation-core -- --nocapture
```

Expected:

```text
PASS
```

### Task 2: 让 hold-to-talk 与 keyboard hook 事件流对接

**Files:**
- Modify: `voice-app/crates/automation-core/src/hold_to_talk.rs`
- Create: `voice-app/crates/automation-core/tests/hotkey_flow.rs`
- Test: `voice-app/crates/automation-core/tests/hold_to_talk.rs`
- Test: `voice-app/crates/automation-core/tests/hotkey_flow.rs`

- [ ] **Step 1: 先写失败测试，证明统一事件流可驱动现有长按状态机**

新增测试至少覆盖：

```rust
use automation_core::{
    HoldToTalkController, HotkeyPressDecision, HotkeyReleaseDecision,
    KeyboardHookEvent, RuntimeHotkeyPhase,
};

#[test]
fn long_hold_finishes_after_pressed_and_released_events() {
    let mut controller = HoldToTalkController::default();

    let press = controller.on_press(RuntimeHotkeyPhase::Idle, 1_000);
    assert_eq!(press, HotkeyPressDecision::StartListening);

    let release = controller.on_release(RuntimeHotkeyPhase::Listening, 1_220);
    assert_eq!(release, HotkeyReleaseDecision::FinishListening);
}
```

- [ ] **Step 2: 运行定向测试，确认先红**

Run:

```powershell
cargo test -p automation-core hotkey_flow -- --nocapture
```

Expected:

```text
FAIL，说明还缺少事件流辅助 API 或状态组合测试入口
```

- [ ] **Step 3: 仅做最小改动，让状态机保持现有语义**

要求：

1. 不把平台逻辑引入 `hold_to_talk.rs`
2. 如需辅助函数，只提供事件时间戳/阶段驱动的轻量适配
3. 保持现有：
   - 短按取消
   - 长按完成
   - processing/generating 中断后重启

- [ ] **Step 4: 运行 automation-core 全量测试**

Run:

```powershell
cargo test -p automation-core -- --nocapture
```

Expected:

```text
PASS
```

### Task 3: 将 src-tauri 热键主链切到 native hook，global shortcut 改为 fallback

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/src/hotkeys.rs`
- Modify: `voice-app/apps/desktop/src-tauri/src/platform_runtime.rs`
- Modify: `voice-app/crates/platform-core/src/lib.rs`
- Create: `voice-app/apps/desktop/src-tauri/tests/hotkey_runtime.rs`
- Test: `voice-app/apps/desktop/src-tauri/tests/hotkey_runtime.rs`

- [ ] **Step 1: 先写失败测试，覆盖 native hook 优先与 fallback 行为**

新增测试至少覆盖：

1. native hook 初始化成功时，不注册 fallback 主链
2. native hook 初始化失败时，回退到 `global shortcut`
3. 降级状态会写入日志或平台诊断

- [ ] **Step 2: 运行定向测试，确认先红**

Run:

```powershell
cargo test -p voice-app-desktop hotkey_runtime -- --nocapture
```

Expected:

```text
FAIL，提示当前 hotkeys.rs 仍只依赖 tauri global shortcut
```

- [ ] **Step 3: 用最小实现重构 hotkeys 主链**

要求：

1. `hotkeys.rs` 优先初始化 native backend
2. native backend 事件映射到：
   - `handle_hotkey_pressed`
   - `handle_hotkey_released`
   - `continue_hotkey_task`
3. fallback 才注册 `tauri-plugin-global-shortcut`
4. `platform_runtime.rs` / `platform-core` 暴露热键后端状态与错误原因

- [ ] **Step 4: 运行 src-tauri 定向测试**

Run:

```powershell
cargo test -p voice-app-desktop hotkey_runtime -- --nocapture
```

Expected:

```text
PASS
```

### Task 4: 接入 Windows 与 macOS native backend，并完成回归验证

**Files:**
- Create: `voice-app/crates/automation-core/src/windows_keyboard_hook.rs`
- Create: `voice-app/crates/automation-core/src/macos_keyboard_hook.rs`
- Modify: `voice-app/crates/automation-core/Cargo.toml`
- Modify: `voice-app/apps/desktop/src-tauri/Cargo.toml`
- Test: `voice-app/crates/automation-core/tests/keyboard_hook.rs`
- Test: `voice-app/apps/desktop/src-tauri/tests/hotkey_runtime.rs`

- [ ] **Step 1: 先写失败测试，覆盖平台 backend 的错误路径与可构造性**

至少覆盖：

1. Windows backend 在不满足初始化条件时返回明确错误
2. macOS backend 在权限缺失或不可用时返回明确错误
3. backend 生命周期句柄能正常关闭

- [ ] **Step 2: 运行失败测试，确认先红**

Run:

```powershell
cargo test -p automation-core keyboard_hook -- --nocapture
```

Expected:

```text
FAIL，提示平台 backend 尚未实现
```

- [ ] **Step 3: 实现双平台 backend**

要求：

1. Windows：
   - 使用 `WH_KEYBOARD_LL`
   - 拥有独立消息循环
   - 线程退出时发出取消/错误
2. macOS：
   - 使用 `CGEventTap`
   - 无辅助功能权限时返回明确错误
   - event tap 失效时发出取消/错误
3. 平台实现只负责事件采集和归一化

- [ ] **Step 4: 运行定向与集成验证**

Run:

```powershell
cargo test -p automation-core -- --nocapture
cargo test -p voice-app-desktop hotkey_runtime -- --nocapture
pnpm --dir voice-app/apps/desktop test
```

Expected:

```text
PASS
```

- [ ] **Step 5: 运行桌面构建验证**

Run:

```powershell
pnpm --dir voice-app/apps/desktop build
```

Expected:

```text
vite build completed successfully
```

## 执行备注

1. 当前用户已明确要求：plan 写完后直接执行，因此本计划默认以内联执行方式推进。
2. 受当前会话规则约束，本轮不使用子代理做 plan review；改为主代理本地自检后直接执行。
3. 若 Windows/macOS 原生 API 引入导致依赖或宿主环境阻塞，应立刻停止并汇报真实阻塞，不得假装“已支持双平台”。
