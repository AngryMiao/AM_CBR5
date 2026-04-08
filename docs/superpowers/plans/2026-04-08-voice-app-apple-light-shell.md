# Voice App Apple Light Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `voice-app/apps/desktop` 重构为统一浅色、少卡片、Apple Light Mode 风格的桌面壳层，同时保留左导航 / 右内容结构，并同步更新 `overlay`、`result` 和相关测试。

**Architecture:** 主窗口保留现有 React + 单 CSS 体系，但把视觉语言统一到浅色 grouped layout；`App.tsx` 调整为更轻的壳层与 section 分段，`RuntimeStatus.tsx` 负责首页分区重排，`HistoryPanel.tsx` / `SettingsPanel.tsx` / `LogsPanel.tsx` 跟进 grouped 视觉，`OverlayWindow.tsx` 与 `ResultWindow.tsx` 切到新材质；测试继续以行为稳定为主，只更新与 DOM 层级和文案相关的断言。

**Tech Stack:** React 18, TypeScript, Vite, Tauri, Vitest, CSS

---

### Task 1: 重建主窗口壳层与全局样式基线

**Files:**
- Modify: `voice-app/apps/desktop/src/App.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 重写主壳层结构草图**

将主窗口 `main -> section -> aside + section` 结构保留为左右布局，但移除营销化 topbar / hero 语义，只保留轻量产品头部和导航。

```tsx
<main className="app-shell">
  <section className="workspace-shell">
    <aside className="workspace-sidebar">
      <div className="workspace-brand">
        <strong>Voice App</strong>
        <small>Desktop</small>
      </div>
      <nav className="workspace-menu" aria-label="主导航">
        {/* panel buttons */}
      </nav>
      <div className="workspace-sidebar-footer">
        <span className="workspace-ready-badge">Ready</span>
        <small className="workspace-ready-note">{currentPanel.footer}</small>
      </div>
    </aside>

    <section className="workspace-content">
      {/* active panel */}
    </section>
  </section>
</main>
```

- [ ] **Step 2: 先更新主壳体测试期望**

把测试从“深色壳层 / 旧首页文案”转向“默认打开首页 / 导航仍可切换 / 不出现 marketing hero”。

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 与旧壳层结构相关的断言失败，但面板切换和窗口类型测试仍可作为迁移目标存在。

- [ ] **Step 3: 在 `styles.css` 中建立新的浅色主题 token**

新增或覆盖统一浅色变量，避免继续叠加旧的深色 token。

```css
:root {
  color-scheme: light;
  --shell-bg: #f5f5f7;
  --shell-sidebar: #efeff2;
  --shell-surface: #ffffff;
  --shell-surface-soft: #fafafc;
  --shell-text: #1d1d1f;
  --shell-text-soft: rgba(29, 29, 31, 0.8);
  --shell-text-dim: rgba(29, 29, 31, 0.48);
  --shell-line: rgba(29, 29, 31, 0.08);
  --shell-line-strong: rgba(29, 29, 31, 0.14);
  --shell-accent: #0071e3;
}
```

- [ ] **Step 4: 重写主壳体、导航和右侧内容区的基线样式**

实现“统一浅色 + 轻微层差 + 少卡片”的主体布局，而不是在旧样式上打补丁。

```css
.workspace-shell {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.66);
}

.workspace-sidebar {
  background: linear-gradient(180deg, var(--shell-sidebar), #ececf0);
  border-right: 1px solid var(--shell-line);
}

.workspace-content {
  background: linear-gradient(180deg, var(--shell-bg), #f7f7f9);
  padding: 24px 26px;
}
```

- [ ] **Step 5: 运行单测确认壳层迁移没有破坏主导航行为**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 默认首页、四个主面板切换、overlay / result 窗口分流测试可继续通过；若断言失败，失败点只集中在结构或文案更新处。

### Task 2: 重排首页 Runtime 为分区式工作台

**Files:**
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 调整 `RuntimeStatus.tsx` 的 DOM 结构**

将首页拆成三个 section：

1. 运行控制带
2. 实时内容 / 系统摘要双栏
3. 次级入口或详细运行信息区

```tsx
<section className="panel runtime-panel">
  <section className="runtime-strip">
    {/* 当前阶段 + 操作按钮 + 状态摘要 */}
  </section>

  <section className="runtime-content-grid">
    <div className="runtime-main-column">
      {/* 实时文本 / 任务结果 */}
    </div>
    <aside className="runtime-side-column">
      {/* 系统摘要 */}
    </aside>
  </section>

  <section className="runtime-secondary-grid">
    {/* 历史 / 设置 / 日志捷径 或 详细运行信息 */}
  </section>
</section>
```

- [ ] **Step 2: 移除营销化标题和重卡片式首页组织**

删除类似 hero 的展示语义，只保留：

```tsx
<div className="runtime-strip-copy">
  <span className="runtime-phase-pill">{phase}</span>
  <h2>运行控制</h2>
  <p>{detail}</p>
</div>
```

- [ ] **Step 3: 将实时文本、任务结果、系统摘要改为连续分组**

避免每块都浮起为卡片，优先用 section 标题、条目和分隔线。

```css
.runtime-content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.26fr) minmax(320px, 0.84fr);
  gap: 28px;
}

.runtime-side-column {
  padding-left: 28px;
  border-left: 1px solid var(--shell-line-strong);
}

.runtime-entry {
  padding: 14px 0;
  border-top: 1px solid var(--shell-line);
}
```

- [ ] **Step 4: 重排详细诊断列表**

保留 MCP runtime、AngryMiao、工具列表等信息，但下沉到次级 section，不与第一屏主任务争夺注意力。

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 首页仍能渲染平台、MCP、权限、AngryMiao 信息，但结构断言需要按新 section 重写。

### Task 3: 将 History / Logs 改成 grouped list 风格

**Files:**
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 保留工具栏能力，去掉卡片墙样式**

历史和日志都维持顶部筛选区，但列表项改为连续 grouped row。

```tsx
<section className="panel history-panel">
  <div className="history-toolbar">{/* filters + meta */}</div>
  <div className="history-group">
    {orderedHistory.map((record) => (
      <article className="history-row" key={record.id}>
        {/* row content */}
      </article>
    ))}
  </div>
</section>
```

- [ ] **Step 2: 历史记录按“标题 / 元信息 / 识别文本 / 结果 / 操作”压平**

减少厚重边框和大面积底色，仅保留轻分隔。

```css
.history-row,
.log-row {
  display: grid;
  gap: 8px;
  padding: 16px 0;
  border-top: 1px solid var(--shell-line);
}
```

- [ ] **Step 3: 日志页改成浅色开发者工具表意**

错误态通过标签和文字层级表达，而不是整条深色或高饱和红块。

```tsx
<li className={`log-row ${entry.level === 'error' ? 'log-row-error' : ''}`}>
  <span>{logLevelLabel(entry.level)}</span>
  <strong>{entry.message}</strong>
</li>
```

- [ ] **Step 4: 更新相关测试文案和结构期望**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 历史、日志仍保留筛选、导出、清空、预览、重试等功能；只更新结构性断言。

### Task 4: 将 Settings 收敛为 Apple Light grouped form

**Files:**
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 保留单页连续设置结构，不引入二级菜单**

继续复用当前 `fieldset` 顺序，但把每个 section 从重卡片改成 grouped form。

```tsx
<form className="settings-form">
  <div className="settings-sections">
    <fieldset className="settings-section">{/* 通用 */}</fieldset>
    <fieldset className="settings-section">{/* 快捷键 */}</fieldset>
    <fieldset className="settings-section">{/* 豆包 ASR */}</fieldset>
    <fieldset className="settings-section">{/* 高级参数 */}</fieldset>
    <fieldset className="settings-section">{/* OpenAI-compatible LLM */}</fieldset>
    <fieldset className="settings-section">{/* MCP */}</fieldset>
  </div>
</form>
```

- [ ] **Step 2: 统一字段、输入框、复选框和内联按钮样式**

从深色工具面板切到浅色分组输入。

```css
.settings-section {
  padding: 18px 0;
  border-top: 1px solid var(--shell-line-strong);
}

.settings-field input,
.settings-field select,
.settings-field textarea {
  background: var(--shell-surface-soft);
  border: 1px solid var(--shell-line);
}
```

- [ ] **Step 3: 保留警告、错误、反馈，但改成轻提示**

例如：

```css
.settings-warning {
  color: #8a5b00;
  background: rgba(245, 158, 11, 0.10);
}

.settings-feedback {
  color: #1f6f3d;
}
```

- [ ] **Step 4: 跑一遍设置相关测试，保证保存链路不受视觉重构影响**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 设置项渲染、录制默认热键、保存字段、错误回滚、Bundle 安装等交互仍然通过。

### Task 5: 更新 Overlay / Result 视觉并完成最终验证

**Files:**
- Modify: `voice-app/apps/desktop/src/features/runtime/OverlayWindow.tsx`
- Modify: `voice-app/apps/desktop/src/features/runtime/ResultWindow.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 将 overlay 切换到 Smoky Graphite**

保留现有结构与行为，但替换材质。

```css
.typeless-overlay-card {
  background: rgba(32, 33, 37, 0.80);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: saturate(180%) blur(20px);
}
```

- [ ] **Step 2: 将 result 改成浅色 sheet**

保留关闭按钮和两个语义分区，减少旧的深色卡片感。

```tsx
<section className="typeless-result-card">
  <div className="typeless-result-toolbar">{/* close */}</div>
  <div className="typeless-result-section">{/* transcript */}</div>
  <div className="typeless-result-section">{/* result */}</div>
</section>
```

- [ ] **Step 3: 同步更新 overlay / result 测试断言**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: overlay 仍按输入模式显示图标或文本；result 仍显示识别内容、执行结果和关闭按钮。

- [ ] **Step 4: 运行最终验证**

Run: `pnpm --dir voice-app/apps/desktop test`
Expected: 全部 Vitest 用例通过

Run: `pnpm --dir voice-app/apps/desktop build`
Expected: Vite build 成功，无类型或打包错误
