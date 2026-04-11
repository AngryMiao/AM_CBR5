# Voice App Quiet Console Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `voice-app/apps/desktop` 重构为 Quiet Console 风格的浅色桌面工作台，新增自定义顶部拖动栏，重设计首页 / 设置 / 历史 / 日志页面，并保留现有录音识别胶囊与结果返回卡片不变。

**Architecture:** 主窗口继续沿用 React + 单 CSS 文件体系，但切换到“自定义 titlebar + 左侧导航 + 右侧滚动内容”的桌面壳层；`App.tsx` 负责总壳层、标题栏和页面切换，`RuntimeStatus.tsx` / `HistoryPanel.tsx` / `SettingsPanel.tsx` / `LogsPanel.tsx` 负责四个页面的连续分组重构，`lib/tauri.ts` 负责主窗口控制按钮的调用封装，测试以回归原有交互行为并适配新 DOM 结构为主。

**Tech Stack:** React 18, TypeScript, Vite, Tauri 2, Vitest, CSS, shadcn/ui primitives

---

### Task 1: 重建主窗口壳层与自定义标题栏

**Files:**
- Modify: `voice-app/apps/desktop/src-tauri/tauri.conf.json`
- Modify: `voice-app/apps/desktop/src/App.tsx`
- Modify: `voice-app/apps/desktop/src/lib/tauri.ts`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 先写主壳层与标题栏的失败测试**

为主窗口新增断言：默认渲染自定义标题栏、页面名、窗口控制按钮，且首页仍是默认面板。

```tsx
it('renders a custom titlebar with window controls in the main window', () => {
  render(<App />)

  expect(screen.getByText('Voice App')).toBeInTheDocument()
  expect(screen.getByText('运行控制')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '最小化窗口' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '切换窗口最大化' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '关闭窗口' })).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行单测确认当前确实失败**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 新增的标题栏断言失败，现有首页默认渲染测试仍可运行。

- [ ] **Step 3: 为主窗口补充窗口控制封装**

在 `lib/tauri.ts` 中增加主窗口控制函数，供 titlebar 按钮调用。

```ts
export async function minimizeCurrentWindow() {
  const currentWindow = getCurrentWindow()
  if (typeof currentWindow.minimize === 'function') {
    await currentWindow.minimize()
  }
}

export async function toggleCurrentWindowMaximize() {
  const currentWindow = getCurrentWindow()
  if (typeof currentWindow.toggleMaximize === 'function') {
    await currentWindow.toggleMaximize()
  }
}
```

- [ ] **Step 4: 将 `main` 窗口切到自定义标题栏方案**

在 `tauri.conf.json` 里仅对 `main` 窗口关闭系统装饰，保留大小和最小尺寸设置。

```json
{
  "label": "main",
  "title": "Voice App",
  "width": 1280,
  "height": 820,
  "minWidth": 1200,
  "minHeight": 780,
  "decorations": false
}
```

- [ ] **Step 5: 在 `App.tsx` 实现 titlebar + sidebar + content 三层壳体**

结构目标：

```tsx
<div className="desktop-shell">
  <header className="desktop-titlebar">
    {/* brand + drag region + window controls */}
  </header>
  <div className="desktop-workspace">
    <aside className="workspace-sidebar">{/* nav */}</aside>
    <main className="workspace-main">
      <ScrollArea>{/* active panel */}</ScrollArea>
    </main>
  </div>
</div>
```

titlebar 中间区域使用 `data-tauri-drag-region`。

- [ ] **Step 6: 在测试 mock 中补齐窗口控制方法**

为 `getCurrentWindow` mock 增加 `minimize`、`toggleMaximize`、`close`、`hide` 等函数，保证标题栏按钮测试可运行。

- [ ] **Step 7: 重写全局壳层样式**

在 `styles.css` 中建立 Quiet Console 的浅色 tokens、titlebar、sidebar、workspace 基线样式；保留 overlay/result 相关样式不变。

- [ ] **Step 8: 重新运行主壳层单测**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 主窗口能通过默认首页、导航切换、overlay/result 分流以及标题栏渲染相关断言；若失败，应集中在待更新页面结构断言。

### Task 2: 重构首页 Runtime 为连续分区工作台

**Files:**
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 写首页新结构的失败测试**

增加断言：首页以“运行控制带 + 主工作区 + 次级诊断区”结构渲染，而不再依赖多张 `Card`。

```tsx
expect(screen.getByText('运行控制')).toBeInTheDocument()
expect(screen.getByText('任务结果')).toBeInTheDocument()
expect(screen.getByText('系统摘要')).toBeInTheDocument()
expect(screen.getByText('MCP 运行时')).toBeInTheDocument()
```

- [ ] **Step 2: 运行单测确认首页结构断言失败**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 与首页卡片结构相关的断言失败，但数据获取逻辑仍正常。

- [ ] **Step 3: 将 `RuntimeStatus.tsx` 改成三段式布局**

建议结构：

```tsx
<section className="runtime-panel">
  <section className="runtime-strip">{/* mode + title + key facts */}</section>
  <section className="runtime-layout">
    <div className="runtime-main-column">{/* result + notices */}</div>
    <aside className="runtime-side-column">{/* system summary */}</aside>
  </section>
  <section className="runtime-diagnostics">{/* mcp + angrymiao */}</section>
</section>
```

- [ ] **Step 4: 用 grouped sections 替代 summary cards 和 glass-card**

运行摘要、任务结果、系统摘要、诊断项都改为连续 section / rows / separators。

- [ ] **Step 5: 更新首页样式并回归测试**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 首页仍保留平台、权限、MCP、AngryMiao、任务结果信息，只是 DOM 结构改为连续分区。

### Task 3: 将 History / Logs 重构为 grouped rows

**Files:**
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Modify: `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 为历史与日志增加新结构断言**

保留行为断言，但把结构性预期从 `Card` 调整为 toolbar + grouped rows。

- [ ] **Step 2: 运行测试确认失败点集中在旧结构**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 历史和日志的动作链路测试可运行，但旧卡片结构断言失败。

- [ ] **Step 3: 重写 `HistoryPanel.tsx`**

采用：

```tsx
<section className="history-panel">
  <header className="history-toolbar">{/* search + filter + stats */}</header>
  <div className="history-list">
    <article className="history-row">{/* meta + transcript + result + actions */}</article>
  </div>
</section>
```

- [ ] **Step 4: 重写 `LogsPanel.tsx`**

采用：

```tsx
<section className="logs-panel">
  <header className="logs-toolbar">{/* search + level + actions */}</header>
  <div className="logs-list">
    <div className="log-row">{/* badge + message */}</div>
  </div>
</section>
```

- [ ] **Step 5: 为历史和日志补齐 grouped list 样式**

包括 toolbar、summary、row、error row、empty state、action row 等规则。

- [ ] **Step 6: 回归历史与日志测试**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 历史的查询/预览/重试，日志的筛选/导出/清空都继续通过。

### Task 4: 将 Settings 收敛为 tabs + 固定保存栏

**Files:**
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
- Modify: `voice-app/apps/desktop/src/styles.css`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: 先写设置页顶部 tabs 和固定保存栏的失败测试**

```tsx
expect(screen.getByRole('tab', { name: '通用' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: '快捷键' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: 'ASR' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: '模型' })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: 'MCP' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '保存设置' })).toBeInTheDocument()
```

- [ ] **Step 2: 运行测试确认设置页新结构尚未存在**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: tabs 与固定保存栏断言失败，原保存逻辑相关断言仍保留参考价值。

- [ ] **Step 3: 将 `SettingsPanel.tsx` 改为 `Tabs` 结构**

使用现有 shadcn `Tabs` 组件包裹五个大类，保留原字段逻辑和状态逻辑：

```tsx
<Tabs defaultValue="general" className="settings-tabs">
  <TabsList>{/* tabs */}</TabsList>
  <TabsContent value="general">{/* fields */}</TabsContent>
  {/* other tabs */}
</Tabs>
```

- [ ] **Step 4: 重组字段到五个 tab 中**

保持原字段命名与保存数据结构不变，只调整页面组织：

1. `通用`
2. `快捷键`
3. `ASR`
4. `模型`
5. `MCP`

- [ ] **Step 5: 增加固定保存栏**

在设置页底部加入 sticky footer，承载保存反馈、运行警告、重置和保存按钮。

- [ ] **Step 6: 重写设置页样式**

重点包括：

1. tabs bar
2. grouped field sections
3. sticky footer
4. validation / warning / feedback

- [ ] **Step 7: 运行设置相关测试**

Run: `pnpm --dir voice-app/apps/desktop test -- app-shell.test.tsx`

Expected: 热键录制、字段保存、错误回滚、Bundle 安装、校验错误等行为继续通过。

### Task 5: 全量测试回归与收尾验证

**Files:**
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`
- Modify: `voice-app/apps/desktop/src/test/setup.ts`

- [ ] **Step 1: 清理并统一测试断言**

确保 `app-shell.test.tsx` 中所有结构性断言都切换到 Quiet Console + 自定义标题栏的新语义。

- [ ] **Step 2: 运行桌面端全部单测**

Run: `pnpm --dir voice-app/apps/desktop test`

Expected: 所有 Vitest 用例通过。

- [ ] **Step 3: 运行桌面端构建**

Run: `pnpm --dir voice-app/apps/desktop build`

Expected: Vite build 成功，无类型或打包错误。

- [ ] **Step 4: 记录残余风险**

如果构建或测试之外仍有桌面端专属风险，应在最终交付时明确说明，例如：

1. 自定义标题栏在真实 Windows 上的拖拽体验需要手动点验
2. 标题栏按钮 hover/active 状态需要真实窗口环境确认
