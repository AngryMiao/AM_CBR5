# Voice App Handoff

## 目标

这份文档用于在切换开发环境后，继续推进 `voice-app` 的 `Rust-first + Tauri-shell` 重构工作。

当前目标产品形态已经收敛为：

1. 不再保留 `chatbox` 主界面
2. 应用默认后台常驻
3. 任意位置长按开始录音，松开后执行 `ASR -> LLM -> MCP`
4. 所有结果进入历史记录
5. 前台仅保留：
   - History
   - Settings
   - Logs
   - Runtime

## 文档入口

当前已经整理好的设计与计划文档：

1. 设计文档  
   [2026-04-04-voice-app-rust-tauri-rebuild-design.md](/e:/code/AM_CBR5/docs/superpowers/specs/2026-04-04-voice-app-rust-tauri-rebuild-design.md)
2. 实施计划  
   [2026-04-04-voice-app-foundation.md](/e:/code/AM_CBR5/docs/superpowers/plans/2026-04-04-voice-app-foundation.md)

这两份文档定义了：

1. 新项目入口是 `voice-app/`
2. 技术路线是 `Rust-first + Tauri-shell`
3. 一期目标是后台常驻语音代理最小闭环

## 工作区信息

当前实现不是直接在主工作区做，而是在隔离 worktree 中推进：

1. 主仓库根目录：`E:\code\AM_CBR5`
2. 隔离 worktree：`E:\code\AM_CBR5\.worktrees\voice-app-foundation`
3. 当前 worktree 分支：`refactor/voice-app-foundation`

## 已完成

### 1. 设计与计划已完成

已完成并确认：

1. `voice-app` 的架构设计文档
2. foundation 实施计划
3. foundation 计划复审，当前判定为“可执行”

### 2. Task 2 已完成并提交

提交：

1. `6673773 feat(voice-app): 初始化重构工作区与迁移文档骨架`

这一步已经完成的内容：

1. 创建了 `voice-app/` 根目录
2. 创建了 `voice-app/package.json`
3. 创建了 `voice-app/pnpm-workspace.yaml`
4. 创建了 `voice-app/pnpm-lock.yaml`
5. 创建了 `voice-app/Cargo.toml`
6. 创建了 `voice-app/docs/migration/*` 四份迁移文档骨架
7. 安装了 `@tauri-apps/cli`

已存在文件：

1. `voice-app/README.md`
2. `voice-app/.gitignore`
3. `voice-app/docs/migration/feature-inventory.md`
4. `voice-app/docs/migration/electron-capability-map.md`
5. `voice-app/docs/migration/target-architecture.md`
6. `voice-app/docs/migration/migration-plan.md`

### 3. Task 3 已完成并提交

提交：

1. `c159469 feat(voice-app): 添加无 chatbox 的桌面壳`

这一步已经完成的内容：

1. 创建了 `voice-app/apps/desktop/package.json`
2. 创建了 `voice-app/apps/desktop/tsconfig.json`
3. 创建了 `voice-app/apps/desktop/vite.config.ts`
4. 创建了 `voice-app/apps/desktop/vitest.config.ts`
5. 创建了 `voice-app/apps/desktop/index.html`
6. 创建了 `voice-app/apps/desktop/src/App.tsx`
7. 创建了 `voice-app/apps/desktop/src/main.tsx`
8. 创建了 `voice-app/apps/desktop/src/styles.css`
9. 创建了四个辅助面板：
   - `HistoryPanel.tsx`
   - `SettingsPanel.tsx`
   - `LogsPanel.tsx`
   - `RuntimeStatus.tsx`
10. 创建了测试基座：
   - `src/test/setup.ts`
   - `src/__tests__/app-shell.test.tsx`

### 4. 已验证通过

已确认通过的验证：

1. `pnpm --dir voice-app exec tauri --version`

结果：

```text
tauri-cli 2.10.1
```

2. `pnpm --dir voice-app/apps/desktop test`

结果：

```text
Test Files  1 passed (1)
Tests       1 passed (1)
```

### 5. Rust 已安装，但环境未完全可用

已确认：

1. `rustup` 已安装
2. `cargo` 已安装到 `C:\Users\yang\.cargo\bin`
3. `rustc` 已安装

实际版本：

```text
cargo 1.94.1
rustup 1.29.0
rustc 1.94.1
```

## 未完成

### 1. Task 4 只完成了“文件落地”，未完成“可验证”

已创建但**尚未提交**的内容：

#### `src-tauri`

1. `voice-app/apps/desktop/src-tauri/Cargo.toml`
2. `voice-app/apps/desktop/src-tauri/build.rs`
3. `voice-app/apps/desktop/src-tauri/tauri.conf.json`
4. `voice-app/apps/desktop/src-tauri/capabilities/default.json`
5. `voice-app/apps/desktop/src-tauri/src/main.rs`
6. `voice-app/apps/desktop/src-tauri/src/lib.rs`
7. `voice-app/apps/desktop/src-tauri/src/commands.rs`
8. `voice-app/apps/desktop/src-tauri/src/app_state.rs`
9. `voice-app/apps/desktop/src-tauri/src/windowing.rs`

#### `crates`

1. `voice-app/crates/ipc-contract/*`
2. `voice-app/crates/settings-core/*`
3. `voice-app/crates/history-core/*`
4. `voice-app/crates/logging-core/*`
5. `voice-app/crates/voice-core/*`
6. `voice-app/crates/platform-core/*`
7. `voice-app/crates/automation-core/*`
8. `voice-app/crates/asr-core/*`

#### 额外生成文件

1. `voice-app/Cargo.lock`

### 2. Task 4 的 Rust 测试没有通过

尝试执行：

```powershell
cargo test -p ipc-contract -p settings-core -p history-core -p voice-core
```

失败原因不是代码语法，而是宿主机缺少 Windows C/C++ 链接器：

```text
error: linker `link.exe` not found
note: the msvc targets depend on the msvc linker but `link.exe` was not found
```

### 3. Task 5 未完成验证

虽然 `src-tauri` 的最小 runtime 文件已经创建，但以下内容还**没有完成验证**：

1. `cargo check -p voice-app-desktop`
2. Tauri runtime 是否能通过 Windows 本机编译
3. `tauri::generate_context!()` 对应配置是否完整

### 4. Task 6 还没开始

还没做的内容：

1. `voice-app/apps/desktop/src/lib/tauri.ts`
2. 前端通过 `@tauri-apps/api/core` 调用 `get_app_mode`
3. 前端测试里 mock `invoke`
4. `RuntimeStatus` 真正从 runtime 读取状态

### 5. Task 7 还没开始

`voice-app/docs/migration/*` 目前只是骨架，不是完整迁移内容。  
尤其还没补这些实质信息：

1. 旧项目功能盘点
2. Electron 能力映射表
3. 模块级目标架构
4. 分阶段迁移路线

### 6. Task 8 还没开始

还未完成：

1. Rust workspace 测试
2. frontend build
3. 最终 clean tree 验证

## 当前真实阻塞

这是换环境后首先要解决的内容。

### 1. 缺 `link.exe`

命令检查结果：

```powershell
Get-Command cl.exe -ErrorAction SilentlyContinue
```

当前结果：没有输出，说明 `cl.exe` 不可用。

这意味着当前 Windows 环境没有完整的 `MSVC Build Tools`。

### 2. WebView2 Runtime 未确认可用

命令检查结果：

```powershell
winget list Microsoft.EdgeWebView2Runtime
```

当前结果：

```text
找不到与输入条件匹配的已安装程序包。
```

这意味着当前机器上至少没有通过 `winget` 能识别到的 WebView2 Runtime 安装记录。

### 3. `cargo` 没进当前 shell 的 PATH

虽然 `cargo.exe` 已存在于：

```text
C:\Users\yang\.cargo\bin
```

但当前 shell 默认找不到 `cargo`，只能通过显式拼接 PATH 使用。

## 建议的下一步顺序

换环境后建议严格按这个顺序继续：

1. 安装 Windows 原生前置
2. 确认 `cargo` / `cl.exe` / `WebView2` 都可用
3. 回到 `voice-app` worktree，重新跑 Rust tests
4. 如果 Rust tests 通过，再提交 Task 4 的未提交文件
5. 再做 Task 5 验证
6. 然后进入 Task 6 和 Task 7

## 建议执行命令

### 1. 进入工作区

```powershell
cd E:\code\AM_CBR5\.worktrees\voice-app-foundation
git branch --show-current
```

期望：

```text
refactor/voice-app-foundation
```

### 2. 安装 Windows 编译环境

建议至少安装：

1. `Visual Studio 2022 Build Tools`
2. `Desktop development with C++`
3. `MSVC toolchain`
4. `Windows SDK`
5. `Microsoft Edge WebView2 Runtime`

安装后先验证：

```powershell
Get-Command cl.exe
winget list Microsoft.EdgeWebView2Runtime
```

### 3. 修正 PATH 并验证 Rust

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo --version
rustup --version
rustc --version
```

### 4. 重新跑 Task 4 验证

```powershell
cd E:\code\AM_CBR5\.worktrees\voice-app-foundation\voice-app
cargo test -p ipc-contract -p settings-core -p history-core -p voice-core
```

### 5. 如果 Task 4 通过，提交未提交文件

```powershell
cd E:\code\AM_CBR5\.worktrees\voice-app-foundation
git status --short
git add voice-app/Cargo.lock voice-app/crates voice-app/apps/desktop/src-tauri
git commit -m "feat(voice-app): 建立核心 rust crate 与 tauri runtime 基线"
```

### 6. 接着补 Task 6

重点是：

1. 创建 `voice-app/apps/desktop/src/lib/tauri.ts`
2. 修改 `RuntimeStatus.tsx`
3. 在 `src/test/setup.ts` 中 mock `@tauri-apps/api/core`
4. 重跑：

```powershell
pnpm --dir voice-app/apps/desktop test
```

### 7. 再补 Task 7

补全这四个文件的实质内容：

1. `voice-app/docs/migration/feature-inventory.md`
2. `voice-app/docs/migration/electron-capability-map.md`
3. `voice-app/docs/migration/target-architecture.md`
4. `voice-app/docs/migration/migration-plan.md`

## 当前已提交的关键提交

继续开发时，至少要基于这两个提交：

1. `6673773 feat(voice-app): 初始化重构工作区与迁移文档骨架`
2. `c159469 feat(voice-app): 添加无 chatbox 的桌面壳`

## 当前未提交的内容

当前 `git status --short` 在 worktree 中对应：

```text
?? voice-app/Cargo.lock
?? voice-app/apps/desktop/src-tauri/
?? voice-app/crates/
```

也就是说，**Task 4 和 Task 5 的基础文件已经在磁盘上，但还没有形成提交。**

## 交接建议

如果你换到新环境继续，优先保留以下三部分：

1. `voice-app/` 当前目录内容
2. 设计文档和 foundation 计划
3. 本文档

如果走 git 同步路线，建议至少确保：

1. 迁移后的环境能拿到 `refactor/voice-app-foundation`
2. 两个已提交 commit 可见
3. 未提交文件要么手动复制，要么在当前环境补齐编译前置后再提交

## 结论

当前状态可以概括为：

1. 架构方向已经稳定
2. `voice-app` 根目录和无-chatbox desktop shell 已经搭好
3. Rust core 与 `src-tauri` 最小入口文件已创建，但未提交
4. 真正的阻塞是 Windows 原生编译环境，而不是当前代码方向

换环境后，先补系统前置，再继续提交 Task 4/5，然后做 Task 6/7/8。  
不要从头再做 foundation，也不要回到 Electron 主工程里继续开发。
