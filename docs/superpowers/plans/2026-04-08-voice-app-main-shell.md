# Voice App Main Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按用户最新确认方案调整 `voice-app` 桌面端主窗口壳层，删除首页无意义头部、放大并固定左侧导航、让右侧内容独立滚动，并锁定主窗口最小尺寸。

**Architecture:** 保持 `App.tsx` 现有左右壳 JSX 结构，`RuntimeStatus.tsx` 删除首页 hero 文案，`styles.css` 追加主窗口布局覆盖层以固定左侧导航并让右侧内容单独滚动，`tauri.conf.json` 负责主窗口最小尺寸。测试继续沿用现有运行时 mock，但首页断言改成“无无意义头部 + 关键操作仍可见”。

**Tech Stack:** React 18, TypeScript, Vitest, Vite, Tauri desktop renderer

---

### Task 1: 同步方案文档并更新首页断言

**Files:**

- Modify: `docs/superpowers/specs/2026-04-08-voice-app-main-shell-design.md`
- Modify: `docs/superpowers/plans/2026-04-08-voice-app-main-shell.md`
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 将首页测试从“显示 hero 文案”改为“头部已移除但关键操作仍存在”**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx
```

Expected:

```text
PASS，首页不再断言 hero 文案
```

- [ ] **Step 2: 将已批准的最小尺寸、固定导航和独立滚动方案写入 spec / plan**

- [ ] **Step 3: 后续实现始终以“主窗口主体、非 overlay/result”作为边界**

### Task 2: 重构首页和主壳层滚动行为

**Files:**

- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Modify: `voice-app/apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: 删除首页无意义 hero 头部，但保留首页 heading 语义**

- [ ] **Step 2: 把左侧导航放大并固定在左边，让右侧内容区独立滚动**

- [ ] **Step 3: 给主窗口配置 `1200x780` 最小尺寸，并把默认尺寸调到高于下限**

- [ ] **Step 4: 保留以下关键文本与按钮不变**

```text
当前平台
MCP 服务
开始录音
结束录音
Deep Link
开机自启动
AngryMiao Runtime
```

- [ ] **Step 5: 跑定向测试确认首页断言通过**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx
```

Expected:

```text
首页无意义头部断言移除，主壳回归通过
```

### Task 3: 主窗口样式收口与验证

**Files:**

- Modify: `voice-app/apps/desktop/src/styles.css`
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: 仅覆盖主窗口壳层和首页，不触碰 overlay / result 代码路径**

- [ ] **Step 2: 验证窗口在最小尺寸下不会把导航和右侧内容挤坏**

- [ ] **Step 3: 跑定向测试和构建验证**

Run:

```powershell
pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx
pnpm --dir voice-app/apps/desktop build
```

Expected:

```text
app-shell.test.tsx 通过
build 通过
```
