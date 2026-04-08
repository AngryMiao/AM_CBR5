# Voice App Main Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按用户已确认的 A/B/C 方案重构 `voice-app` 桌面端主窗口主体样式，同时保持现有功能和 overlay/result 行为不变。

**Architecture:** 以 `App.tsx` 负责新的浅色主壳层与导航结构，`RuntimeStatus.tsx`、`HistoryPanel.tsx`、`SettingsPanel.tsx`、`LogsPanel.tsx` 负责各自内容区重排，`styles.css` 只重写主窗口视觉系统，不触碰 overlay/result 的代码路径。测试继续依赖现有运行时 mock，并补上新的首页 hero 文案断言。

**Tech Stack:** React 18, TypeScript, Vitest, Vite, Tauri desktop renderer

---

### Task 1: 记录方案并锁定首页文案

**Files:**
- Create: `docs/superpowers/specs/2026-04-08-voice-app-main-shell-design.md`
- Create: `docs/superpowers/plans/2026-04-08-voice-app-main-shell.md`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 保留首页 hero 的失败测试**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx
```

Expected:

```text
FAIL，缺少 自然说话，直接开始输入
```

- [ ] **Step 2: 将已批准的 A/B/C 设计写入 spec / plan**

- [ ] **Step 3: 后续实现始终以“主窗口主体、非 overlay/result”作为边界**

### Task 2: 重构主壳层与首页

**Files:**
- Modify: `voice-app/apps/desktop/src/App.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`

- [ ] **Step 1: 重做主窗口左侧导航和右侧内容舞台**

- [ ] **Step 2: 给运行状态页加入新的首页 hero 和内容卡片层级**

- [ ] **Step 3: 保留以下关键文本与按钮不变**

```text
运行状态
当前平台
MCP 服务
开始录音
结束录音
Deep Link
开机自启动
AngryMiao Runtime
```

- [ ] **Step 4: 跑定向测试确认首页 hero 通过**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx
```

Expected:

```text
首页 hero 文案测试通过
```

### Task 3: 重构历史、设置、日志三个主体面板

**Files:**
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`

- [ ] **Step 1: 历史记录改成列表优先布局**

- [ ] **Step 2: 设置页改成主窗口内的大面板体验，但不改字段逻辑**

- [ ] **Step 3: 日志页统一到新浅色样式**

- [ ] **Step 4: 检查已有测试依赖的控件名称和行为没有回归**

### Task 4: 主窗口样式收口与验证

**Files:**
- Modify: `voice-app/apps/desktop/src/styles.css`

- [ ] **Step 1: 重写主窗口主题 token、布局、卡片、表单、列表样式**

- [ ] **Step 2: 不修改 overlay / result 相关类和 JSX**

- [ ] **Step 3: 跑完整验证**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test
pnpm --dir voice-app/apps/desktop build
```

Expected:

```text
test 通过
build 通过
```
