# Voice App Rust + Tauri 重构设计

## 背景

当前仓库是基于 Electron 的跨平台桌面应用，并在其上叠加了语音控制、`typeless` 模式、系统控制、MCP、skill bundle、多窗口与多端构建能力。

经过本轮评审，用户已明确以下重构前提：

1. 新项目只面向 `Windows` 与 `macOS`
2. 目标产品形态尽量向 `Typeless` 靠拢
3. 必须完整保留以下能力：
   - 全局热键
   - 低层键盘监听
   - 后台常驻
   - 透明悬浮窗
   - 系统输入控制
   - 麦克风与系统权限申请
4. 新项目入口固定为仓库根目录下的 `voice-app/`
5. 技术路线采用 `Rust-first + Tauri-shell`
6. 新项目不再保留 `chatbox` 主界面，所有对话与执行结果统一进入历史记录

本设计文档的目标不是“把 Electron API 换成 Tauri API”，而是定义一套新的桌面产品架构，使 `voice-app/` 成为未来重构实现的唯一入口。

## 现状扫描结论

### 1. 现有项目不是纯网页壳

现有能力横跨以下层次：

1. `src/main/`
   - Electron 主进程
   - 多窗口控制
   - 托盘、深链、自动启动
   - 全局热键与键盘钩子
   - 权限申请
   - 日志、配置、代理、MCP stdio、ASR session
2. `src/preload/`
   - `contextBridge` 暴露 `electronAPI`
   - renderer 与 main 的桥接层
3. `src/renderer/`
   - React 应用
   - 设置页、聊天 UI、voice UI、image generation、MCP UI
   - 语音控制与 typeless 业务状态机
4. `src/shared/`
   - 类型、默认值、provider 定义、配置契约

### 2. 现有 typeless / voice 是系统级能力，不是普通页面功能

现有 typeless 链路覆盖：

1. 全局热键与长按行为
2. 隐藏语音运行窗口
3. 透明 overlay
4. 极简结果窗
5. 录音
6. ASR
7. LLM
8. MCP 工具调用
9. 文本插入与系统控制

这意味着新架构不能把实时链路继续放在 Web UI 层；否则即使切到 Tauri，也只是“更轻的 Electron”，而不是“更像 Typeless 的系统级输入工具”。

### 3. 当前项目的功能面很广，必须分层迁移

从仓库与文档扫描可归纳出以下主要功能域：

1. 桌面应用壳：
   - 主窗口
   - 多窗口
   - 托盘
   - 深链
   - 自动启动
   - 窗口状态保存
2. 配置与持久化：
   - settings/config
   - blob 存储
   - 日志导出
   - 备份恢复
3. 语音能力：
   - 录音
   - 音量检测
   - ASR providers
   - TTS providers
   - typeless 模式
4. 系统控制：
   - 键盘注入
   - 文本输入
   - 浏览器启动
   - 系统命令
5. AI / 模型能力：
   - 多 provider
   - 模型配置
   - 流式生成
   - 图片生成
6. MCP / skill bundles：
   - stdio transport
   - runtime server config
   - 本地 skill bundle 安装与读取
7. 多端遗留能力：
   - web build
   - mobile build
   - Capacitor 适配

## 重构目标

本轮重构的总目标：

1. 在 `voice-app/` 下建立全新的 `Rust + Tauri` 工程体系
2. 将实时热路径从前端状态驱动迁移到 `Rust core`
3. 将桌面壳职责收缩到：
   - 历史面板
   - 设置面板
   - 日志/调试 UI
   - overlay/result window 壳层
4. 将语音核心与系统能力集中到 Rust：
   - 热键
   - 低层输入监听
   - 权限
   - 文本插入
   - ASR/TTS 编排
   - 后台 daemon
   - 子进程与 sidecar 管理
5. 让未来所有新代码都落在 `voice-app/`，旧项目仅作为迁移参考
6. 将产品形态改造成“后台常驻语音代理”，而不是“桌面聊天客户端”
7. 应用默认后台常驻，通过托盘或菜单栏入口打开历史与设置面板

## 非目标

本轮不做：

1. 不保留 Web / iOS / Android 统一代码复用目标
2. 不继续维护 Electron 与 Tauri 双运行时并存
3. 不在第一阶段迁移旧项目全部 AI 客户端能力
4. 不再以 chatbox 页面作为产品入口
5. 不以“最小改造复用旧 React 代码”为首要目标
6. 不为了追求全 Rust UI 而引入不成熟桌面 UI 栈

## 技术路线比较

### 方案 1：Tauri 作为轻量 Electron 替代

做法：

1. 使用 Tauri 替换 Electron 容器
2. 主要业务逻辑继续由前端驱动
3. Rust 只承接少量原生命令

优点：

1. 改造表面最小
2. 前端迁移快

缺点：

1. 仍然容易让 WebView 进入热路径
2. typeless 手感难以逼近目标产品
3. 会把 Electron 的结构性问题平移到 Tauri

### 方案 2：推荐方案，Rust-first + Tauri-shell

做法：

1. `Rust core` 负责实时语音、输入控制、任务编排、后台运行
2. `Tauri` 只承载历史 UI、设置 UI、日志 UI 和窗口容器
3. WebView 不进入全局热键 -> 录音 -> ASR -> 插入文本的实时热路径

优点：

1. 更接近 Typeless 的系统级产品形态
2. 性能瓶颈更容易集中优化
3. 与 Electron 的架构债切割最彻底

缺点：

1. 前期边界设计要求更高
2. 需要编写 Tauri plugin / native helper

### 方案 3：原生桌面壳 + Rust 核心

做法：

1. 放弃 Tauri
2. 直接用原生壳或 Qt 做桌面 UI
3. Rust 负责核心

优点：

1. 桌面原生能力上限更高

缺点：

1. 与当前已确认技术路线不一致
2. 起步成本更高

## 结论

采用方案 2：

**`voice-app/` 使用 `Rust-first + Tauri-shell` 作为重构入口。**

约束如下：

1. Rust 是主能力拥有者，不是辅助命令层
2. Tauri 是桌面壳，不是业务主引擎
3. 前端只承接非实时交互与配置 UI
4. 所有关键系统能力都必须有 Rust 侧模块归属

## 新项目目录设计

建议目录结构如下：

```text
voice-app/
  README.md
  Cargo.toml
  package.json
  pnpm-workspace.yaml
  .gitignore
  docs/
    migration/
      feature-inventory.md
      electron-capability-map.md
      target-architecture.md
      migration-plan.md
  apps/
    desktop/
      package.json
      src/
      src-tauri/
      vite.config.ts
      tsconfig.json
      tauri.conf.json
  crates/
    ipc-contract/
    voice-core/
    platform-core/
    automation-core/
    asr-core/
    settings-core/
    history-core/
    logging-core/
  tools/
  scripts/
```

### 目录职责

#### `apps/desktop/`

职责：

1. Tauri 前端应用
2. 历史面板、设置面板、日志页、调试页
3. 调用 Rust 命令与订阅事件
4. 非实时 UI 展示

#### `crates/ipc-contract/`

职责：

1. 定义 Tauri 前后端共享协议
2. 定义命令参数、事件载荷、窗口状态、daemon snapshot

#### `crates/voice-core/`

职责：

1. typeless / voice 主状态机
2. 长按开始、抬起结束、短按取消
3. 音频会话控制
4. transcript 生命周期
5. 结果状态与错误态

#### `crates/platform-core/`

职责：

1. 统一封装平台差异
2. macOS / Windows 平台能力判断
3. 权限检查与安装环境探测

#### `crates/automation-core/`

职责：

1. 全局热键
2. 低层键盘监听
3. 文本插入
4. 系统输入控制
5. overlay / result window 行为控制

#### `crates/asr-core/`

职责：

1. 麦克风录音编排
2. ASR provider 管理
3. streaming / batch transcript
4. provider 失败回退

#### `crates/settings-core/`

职责：

1. 设置 schema
2. 设置读写与迁移
3. 默认值、版本化与兼容策略

#### `crates/history-core/`

职责：

1. typeless 历史记录
2. 历次执行结果归档
3. 重放、重试、筛选与搜索

#### `crates/logging-core/`

职责：

1. 应用日志
2. 导出与清理
3. 诊断事件

## 目标架构

### 1. 进程模型

建议采用三段式：

1. `Tauri frontend`
   - 仅负责 UI
2. `Tauri/Rust app runtime`
   - 主进程
   - 负责窗口、配置、事件分发
3. `Rust core modules`
   - 负责所有实时链路与系统级能力

### 2. 热路径原则

以下链路必须完全由 Rust 主导：

1. 热键按下
2. 录音开始
3. overlay 状态切换
4. 音频采集
5. ASR 调度
6. 文本插入
7. typeless 结果提交

前端只可观察，不可成为执行前提。

### 3. 历史/设置面板职责

前台面板负责：

1. 设置管理
2. provider 配置
3. 语音设备配置
4. 历史记录查看
5. 调试与日志查看
6. 权限引导 UI

前台面板不负责：

1. 热键生命周期
2. 录音实时状态驱动
3. typeless 主状态机
4. 作为产品主入口

### 4. overlay / result window

采用独立窗口：

1. `overlay window`
   - 正在聆听
   - 正在识别
   - 正在执行
   - 正在插入
   - 成功 / 错误
2. `result window`
   - 展示最终转录与生成结果

这两个窗口的生命周期由 Rust 控制，不依赖前端路由和页面状态。

## 当前功能清单与迁移优先级

### A. 一期必须迁移

1. 桌面常驻启动
2. 全局热键与低层键盘监听
3. 透明 overlay
4. result window
5. 麦克风录音
6. 至少一种 streaming ASR
7. 文本插入到当前输入焦点
8. 历史面板与设置面板中的基础 voice 配置
9. 日志能力
10. 权限申请与失败提示
11. LLM -> MCP 执行闭环

### B. 二期迁移

1. 多 ASR provider
2. TTS provider
3. MCP runtime
4. system control tool 集
5. 会话历史与结果回放
6. 自动启动、深链、托盘

### C. 三期迁移

1. 完整多模型聊天能力
2. provider registry 全量迁移
3. skill bundle 体系
4. 图片生成
5. 代理配置、团队能力、复杂导入导出

### D. 不直接迁移

以下能力不应作为 `voice-app` 首批目标：

1. mobile 构建链路
2. web 构建链路
3. Electron preload 兼容层
4. 旧的多端 platform adapter
5. 任何形式的 chatbox 首页

## 旧项目到新项目的能力映射

### 1. Electron 主进程能力

旧实现：

1. `src/main/main.ts`
2. `src/main/global-keyboard-hook.ts`
3. `src/main/typeless-overlay.ts`
4. `src/main/typeless-chat-result.ts`
5. `src/main/voice-runtime-window.ts`
6. `src/main/mcp/ipc-stdio-transport.ts`

新归属：

1. `automation-core`
2. `voice-core`
3. `asr-core`
4. `apps/desktop/src-tauri`

### 2. Preload / Electron API

旧实现：

1. `src/preload/index.ts`
2. `src/shared/electron-types.ts`

新归属：

1. 删除 Electron preload 形态
2. 改为 `ipc-contract` + Tauri commands/events

### 3. Renderer 语音控制

旧实现：

1. `src/renderer/hooks/useVoiceController.ts`
2. `src/renderer/stores/voiceStore.ts`
3. `src/renderer/packages/voice/asr/*`
4. `src/renderer/components/voice/*`

新归属：

1. 核心流程迁到 Rust crates
2. 前端只保留历史展示、配置 UI 与调试 UI

### 4. 持久化、历史与日志

旧实现：

1. `src/main/store-node.ts`
2. `src/renderer/platform/storages.ts`
3. `src/renderer/platform/desktop_platform.ts`

新归属：

1. `settings-core`
2. `history-core`
3. `logging-core`
4. 可选 SQLite / JSON 配置存储

### 5. MCP / Skill Bundles

旧实现：

1. `src/main/mcp/ipc-stdio-transport.ts`
2. `src/main/skill-bundles.ts`
3. `voice-app/skill-bundles/angrymiao-voice-control`

新归属：

1. 二期迁移进入 Rust runtime
2. 不作为 `voice-app` 一期落地前提

## 一期能力定义

`voice-app` 一期只做“后台常驻语音代理最小闭环”：

1. 应用安装后可启动桌面常驻进程
2. 按住热键可开始录音
3. 录音时显示 overlay
4. 松开后触发识别
5. 识别后调用 `LLM -> MCP`
6. 结果写入当前输入焦点或执行系统动作
7. 可选展示 result window
8. 所有任务与结果进入历史记录
9. 可在历史/设置面板中调整基础设置

### 一期不要求

1. 全量聊天能力
2. 多 provider 管理界面
3. 图片生成
4. 高阶 MCP 编排能力
5. 旧项目所有设置项完全兼容

## 数据流设计

### 1. Typeless 主循环

```text
Global Hotkey Down
  -> Voice Core start task
  -> Overlay show(listening)
  -> Audio capture start

Global Hotkey Up
  -> Audio capture stop
  -> Overlay show(processing)
  -> ASR execute
  -> LLM execute
  -> MCP execute
  -> Text insertion / System action / Result window
  -> Persist into history
  -> Overlay hide or success
```

### 2. 历史/设置面板与核心的关系

```text
Desktop UI
  -> reads settings
  -> updates settings
  -> reads history
  -> subscribes runtime snapshot
  -> never owns the hot path
```

### 3. 日志与诊断

所有核心事件统一写入 Rust 日志管线：

1. hotkey task start/stop
2. microphone open/close
3. permission success/failure
4. ASR provider request/response
5. LLM round start/finish
6. MCP tool start/finish
7. text insertion success/failure
8. crash recovery / restart

## 平台差异策略

### macOS

需要支持：

1. Accessibility 权限
2. Microphone 权限
3. 全局热键
4. 文本插入
5. 透明 overlay
6. 常驻菜单栏或托盘形态

### Windows

需要支持：

1. 全局热键
2. 低层键盘监听
3. 文本注入
4. 透明 overlay
5. 后台常驻
6. 自动启动

## 迁移文档要求

在 `voice-app/docs/migration/` 下必须生成以下文档：

1. `feature-inventory.md`
   - 按功能域列出旧项目能力
   - 标注一期 / 二期 / 三期
2. `electron-capability-map.md`
   - 逐条映射旧 Electron 能力与新 Rust/Tauri 实现位置
3. `target-architecture.md`
   - 详细模块图
   - 数据流
   - 窗口模型
4. `migration-plan.md`
   - 阶段拆分
   - 风险点
   - 验收标准

## 风险与权衡

### 1. Tauri 不是自动性能药

如果 Rust 不接管实时热路径，`voice-app` 依然会退化为“更轻的 WebView 桌面应用”，而不会真正接近 Typeless。

### 2. 低层输入与文本注入是最高风险模块

这些能力直接决定 Typeless 风格体验是否成立，必须优先建边界、单测与平台抽象。

### 3. 旧项目功能不能一股脑迁移

旧项目范围远大于后台语音代理，一期必须严格收缩，否则新项目会在开始阶段就被旧能力拖回“大而全”。

### 4. `voice-app/` 必须是新根，不可继续混用旧构建链

新项目的构建、依赖、脚手架、测试与发布链必须完全收敛在 `voice-app/` 下，不能继续复用现有 Electron release 流程。

## 验收标准

本设计被认为满足需求，需同时满足：

1. 新项目入口明确为 `voice-app/`
2. 新技术栈明确为 `Rust-first + Tauri-shell`
3. 一期目标聚焦后台常驻语音代理最小闭环
4. 旧功能域已完成分层与迁移优先级划分
5. 后续实施会以 `voice-app/docs/migration/*` 为迁移依据

## 下一步

在本设计确认后，下一阶段应执行：

1. 生成实施计划
2. 在 `voice-app/` 创建新的 Rust workspace 与 Tauri desktop shell
3. 同步创建迁移文档骨架
4. 先实现一期最小闭环，不直接迁移全量 Electron 功能
