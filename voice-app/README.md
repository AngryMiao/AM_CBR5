# Voice App

`voice-app/` 是当前 `Rust + Tauri` 重构入口。
这里不再承接旧 Electron 的 chatbox 产品形态，而是一个后台常驻的桌面语音代理。

## 当前能力

- 豆包流式 ASR
- OpenAI-compatible LLM
- MCP stdio runtime
- 内置 AngryMiao system-control skill runtime
- 内置键盘快捷键映射表与设置页录制编辑
- `settings.json` 作为唯一正式配置真源
- 历史记录 / 日志 / 运行态面板
- 主窗口 + overlay + result 多窗口
- 全局热键长按说话
- 系统托盘 + 关闭主窗口后隐藏到后台
- 托盘左键/双击切换主窗口，应用菜单可显隐主窗口
- 中文状态流：`待命中 -> 正在聆听 -> 正在识别 -> 正在生成 -> 已完成`

当前阶段不做：

- 其他 ASR provider
- TTS

## 目录结构

- `apps/desktop/`: React + Vite 前端壳
- `apps/desktop/src-tauri/`: Tauri 桌面入口与原生配置
- `crates/`: Rust 核心 crate
- `docs/migration/`: 迁移文档

## 开发环境

### Windows

官方前置条件建议按下面安装：

1. Node.js LTS
2. `corepack enable` 后启用 `pnpm`
3. Rust 官方工具链，选择 `stable-msvc`
4. `Visual Studio 2022 Build Tools`
5. 安装组件：
   - `Desktop development with C++`
   - `MSVC` 工具集
   - `Windows SDK`
6. `Microsoft Edge WebView2 Runtime`

推荐直接使用：

- `Developer PowerShell for VS 2022`
- 或 `Developer Command Prompt for VS 2022`

原因很简单：`voice-app` 启动的是原生 Tauri 桌面进程，不是纯网页。
Windows 下编译这个桌面壳需要 `Rust + MSVC + Windows SDK + WebView2`。

官方参考：

- Tauri prerequisites: <https://v2.tauri.app/start/prerequisites/>
- Rust: <https://rustup.rs/>
- Visual Studio Build Tools: <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
- WebView2: <https://developer.microsoft.com/en-us/microsoft-edge/webview2/>

### macOS

至少需要：

1. Node.js LTS
2. `corepack enable`
3. Rust 官方工具链
4. Xcode Command Line Tools

```bash
xcode-select --install
```

### macOS 打包

请在 Mac 机器上执行：

```bash
cd <你的仓库路径>/voice-app
pnpm run build:mac
```

当前仓库已补齐这几项 mac 打包配置：

- `apps/desktop/src-tauri/Info.plist`
  - 声明 `NSMicrophoneUsageDescription`
  - 声明 `NSAppleEventsUsageDescription`
- `apps/desktop/src-tauri/Entitlements.plist`
  - 为后续签名场景预留音频输入和 Apple Events 能力声明
- `apps/desktop/src-tauri/tauri.macos.conf.json`
  - 在 macOS 上启用 `app` / `dmg` bundle，并挂载 entitlements

说明：

- 首次真正开始录音时，macOS 仍会弹出麦克风权限授权框
- 如果后续使用内置 system-control runtime 执行键盘注入或系统控制，macOS 还会要求你在“隐私与安全性”里授予“辅助功能”与“自动化 -> System Events”
- 这套配置解决的是 bundle 侧缺少隐私用途声明的问题，不替代用户在系统设置里的授权

## 安装依赖

```powershell
cd <你的仓库路径>\voice-app
pnpm install
```

## Windows 打包

Windows 推荐在 `Developer PowerShell for VS 2022` 中执行：

```powershell
cd <你的仓库路径>\voice-app
pnpm --dir apps/desktop exec tauri build --bundles nsis --ci --no-sign
```

说明：

- `pnpm build` 只会执行前端的 `vite build`
- 真正生成 Windows 安装包要用上面的 `tauri build`
- 即使 `src-tauri/tauri.conf.json` 里 `bundle.active` 为 `false`，显式传入 `--bundles nsis` 仍会产出 NSIS 安装包

默认产物路径：

```text
voice-app/target/release/bundle/nsis/Voice App_0.1.0_x64-setup.exe
```

## 启动原生桌面 App

Windows 推荐在 `Developer PowerShell for VS 2022` 中执行：

```powershell
cd <你的仓库路径>\voice-app
pnpm --dir apps/desktop exec tauri dev
```

如果你已经在 `apps/desktop/` 目录里，也可以执行：

```powershell
pnpm exec tauri dev
```

这条命令会：

1. 启动 Tauri 需要的内部 Vite dev server
2. 编译 Rust 桌面壳
3. 拉起原生桌面进程 `voice-app-desktop`

它不是网页预览。

启动成功时，终端里应看到类似输出：

```text
VITE v7.x ready in ...
Running `...\voice-app\target\debug\voice-app-desktop.exe`
```

第二行表示启动的是桌面二进制，而不是浏览器页面。

## 首次启动后要做什么

首次启动时，应用数据目录里如果没有 `settings.json`，
应用会自动创建默认配置文件。

然后在设置页填写至少这些字段：

- 豆包 `App ID`
- 豆包 `Access Token`
- 豆包 `Resource ID`
- 豆包模型
- `LLM API Key`
- `LLM Base URL`
- `LLM 模型`

保存后：

- 新任务立即使用最新配置
- 重启应用后继续读取同一个 `settings.json`

## 配置说明

当前正式配置文件只有一个：

- 应用数据目录下的 `settings.json`

当前不再使用 `.env` 作为运行时真源，也不支持从 `.env` 导入。

设置页支持：

- 编辑通用设置
- 编辑豆包 ASR 基础参数、默认麦克风与转录静音自动结束
- 编辑 OpenAI-compatible LLM 参数
- 编辑内置 AngryMiao skill 开关、键盘驱动路径、键盘快捷键映射
- 编辑自定义 MCP server JSON
- 保存前结构校验
- 保存设置
- 重置为当前已保存值

敏感字段：

- 豆包 `Access Token`
- `LLM API Key`

默认不会回显真实值；留空保存时保持原值不变。

## 运行时行为

正常情况下，长按语音热键后的状态流是：

```text
待命中
  -> 正在聆听
  -> 正在识别
  -> 正在生成
  -> 正在执行
  -> 正在输出
  -> 已完成
```

如果已启用内置 AngryMiao runtime，且当前任务命中了 MCP / 本地工具动作，
结果会继续走到系统控制或文本输出链路。
当前 `settings.json` 中保存的键盘快捷键映射也会进入 LLM 系统提示，作为
`mcp__system-control__keyboard_control` 的优先执行依据。

关闭主窗口不是退出应用，而是：

```text
关闭主窗口
  -> 隐藏到后台
  -> 保留系统托盘
  -> 托盘左键 / 双击可切换主窗口显隐
  -> 可从托盘重新打开主界面
  -> 可从托盘退出应用
```

overlay / result 原生窗口行为：

- overlay 会按当前工作区底部居中定位
- result 会按当前工作区中央定位
- `正在识别` 阶段若长时间无下一跳，overlay 会自动隐藏

语音任务结束后会落到本地历史中，主窗口重开或应用重启后仍可看到：

- 状态
- 完成时间
- 识别文本
- 任务结果
- 任务详情

## 验证命令

```powershell
cd <你的仓库路径>\voice-app
cargo test --workspace -- --nocapture
pnpm --dir apps/desktop test -- --run
pnpm --dir apps/desktop build
```

## 常见故障

### `failed to run 'cargo metadata'` / `program not found`

说明当前终端找不到 `cargo`。

先确认：

```powershell
rustup --version
cargo --version
rustc --version
```

如果命令不存在，按 Rust 官方方式安装 `rustup` 后重新打开终端。

### `link.exe` / `cl.exe` 找不到

说明当前 Windows 原生编译环境没有准备好。

优先检查：

1. 是否已安装 `Visual Studio 2022 Build Tools`
2. 是否勾选 `Desktop development with C++`
3. 是否在 `Developer PowerShell for VS 2022` 中启动

### App 能启动，但语音任务失败

优先检查设置页中的：

- 豆包 `App ID`
- 豆包 `Access Token`
- 豆包 `Resource ID`
- `LLM API Key`
- `LLM Base URL`
- `LLM 模型`
- 键盘驱动路径或快捷键映射配置是否异常
