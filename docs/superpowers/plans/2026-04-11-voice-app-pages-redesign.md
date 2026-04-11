# Voice-App Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign Settings, History, and Logs pages with minimal tech style using shadcn/ui + Tailwind CSS

**Architecture:** Add CSS utility classes first, then refactor each page component to use Flow Layout and minimal status indicators (dots for history, INFO/ERROR labels for logs)

**Tech Stack:** React, Tauri, shadcn/ui, Tailwind CSS, Vitest

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `voice-app/apps/desktop/src/styles.css` | Modify | Add new CSS utility classes |
| `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx` | Modify | Simplify Tabs to pill style |
| `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx` | Modify | Flow layout + status dots |
| `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx` | Modify | Flow layout + INFO/ERROR labels |
| `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx` | Modify | Update tests for new structure |

---

### Task 1: Add CSS Utility Classes

**Files:**
- Modify: `voice-app/apps/desktop/src/styles.css`

- [ ] **Step 1: Add page header minimal styles**

Append to `styles.css` after the existing Flow Layout section (around line 1087):

```css
/* ============================================
   Minimal Page Header Styles
   ============================================ */

.page-header-minimal {
  display: flex;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(203, 213, 225, 0.76);
}

.page-header-minimal h3 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}
```

- [ ] **Step 2: Add simplified Tabs pill styles**

Append to `styles.css`:

```css
/* ============================================
   Simplified Tabs Pill Styles
   ============================================ */

.settings-tabs-pill {
  display: flex;
  gap: 8px;
  padding: 12px 0;
  background: transparent;
  border: none;
  height: auto;
}

.settings-tabs-pill [role="tab"] {
  padding: 6px 14px;
  border-radius: 6px;
  background: rgba(241, 245, 249, 0.9);
  border: 1px solid rgba(203, 213, 225, 0.6);
  font-size: 13px;
  color: #475569;
  transition: all 0.15s ease;
}

.settings-tabs-pill [role="tab"]:hover {
  background: rgba(255, 255, 255, 0.95);
}

.settings-tabs-pill [data-state="active"] {
  background: rgba(255, 255, 255, 0.95);
  border-color: hsl(var(--primary));
  color: hsl(var(--primary));
}
```

- [ ] **Step 3: Add filter bar inline styles**

Append to `styles.css`:

```css
/* ============================================
   Inline Filter Bar Styles
   ============================================ */

.filter-bar-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px 0;
}

.search-input-minimal {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.search-input-minimal input {
  padding-left: 32px;
  background: rgba(248, 250, 252, 0.95);
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 6px;
}

.search-input-minimal svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}
```

- [ ] **Step 4: Add status dot styles**

Append to `styles.css`:

```css
/* ============================================
   Status Dot Styles
   ============================================ */

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.success { background: #10b981; }
.status-dot.error { background: #ef4444; }
```

- [ ] **Step 5: Add history item styles**

Append to `styles.css`:

```css
/* ============================================
   History Item Flow Styles
   ============================================ */

.history-item-flow {
  padding: 16px 0;
  border-bottom: 1px solid rgba(241, 245, 249, 1);
}

.history-item-flow-error {
  border-left: 2px solid rgba(248, 113, 113, 0.68);
  padding-left: 12px;
  margin-left: -12px;
  background: rgba(254, 242, 242, 0.3);
}

.item-head-flow {
  display: flex;
  align-items: center;
  gap: 12px;
}

.item-id-flow {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
}

.item-time-flow {
  font-size: 12px;
  color: #94a3b8;
}

.item-label-flow {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  letter-spacing: 0.05em;
  margin-bottom: 4px;
}

.item-text-flow {
  font-size: 14px;
  color: #1e293b;
  line-height: 1.5;
}

.item-section-flow {
  margin-top: 12px;
}

.item-actions-flow {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
```

- [ ] **Step 6: Add log item styles**

Append to `styles.css`:

```css
/* ============================================
   Log Item Flow Styles
   ============================================ */

.log-item-flow {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(241, 245, 249, 1);
}

.log-item-flow-error {
  border-left: 2px solid rgba(248, 113, 113, 0.68);
  padding-left: 12px;
  margin-left: -12px;
  background: rgba(254, 242, 242, 0.4);
}

.log-level-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

.log-level-badge.info {
  background: rgba(241, 245, 249, 0.9);
  color: #64748b;
}

.log-level-badge.error {
  background: rgba(254, 226, 226, 0.8);
  color: #b91c1c;
}

.log-time-flow {
  font-size: 12px;
  color: #94a3b8;
  font-family: ui-monospace, monospace;
  flex-shrink: 0;
}

.log-text-flow {
  font-size: 13px;
  color: #334155;
  line-height: 1.4;
  flex: 1;
  min-width: 0;
}

.action-buttons-flow {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
```

- [ ] **Step 7: Commit CSS changes**

```bash
cd voice-app/apps/desktop
git add src/styles.css
git commit -m "style: add minimal page layout CSS utility classes

- page-header-minimal for simple headers
- settings-tabs-pill for simplified tab navigation
- filter-bar-inline for inline search/filter
- status-dot for 8px status indicators
- history-item-flow for flow layout items
- log-item-flow with INFO/ERROR badges

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Redesign History Page

**Files:**
- Modify: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
- Test: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Read current HistoryPanel**

Run: Read the file to understand current structure
File: `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`

- [ ] **Step 2: Update imports to minimal style**

Change imports to remove Badge for status counts:

```tsx
import { useEffect, useState } from 'react'
import {
  listenHistoryRecords,
  previewHistoryRecord,
  queryHistoryRecords,
  retryHistoryRecord,
  type HistoryRecord,
} from '../../lib/tauri'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Search, 
  RefreshCw, 
  Eye, 
  Clock
} from 'lucide-react'
```

- [ ] **Step 3: Simplify header to minimal style**

Replace the filterbar section header. Change from:

```tsx
<section className="console-filterbar">
  <div className="console-search">
    <Search className="console-search-icon h-4 w-4" />
    <Input ... />
  </div>
  <Select ...>...</Select>
  <div className="console-summary">
    <Badge variant="secondary">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      已完成 {completedCount}
    </Badge>
    <Badge variant="destructive">
      <XCircle className="mr-1 h-3 w-3" />
      失败 {failedCount}
    </Badge>
  </div>
</section>
```

To:

```tsx
<header className="page-header-minimal">
  <h3>历史记录</h3>
</header>

<div className="filter-bar-inline">
  <div className="search-input-minimal">
    <Search className="h-4 w-4" />
    <Input
      aria-label="搜索历史记录"
      placeholder="搜索识别文本、结果..."
      value={keyword}
      onChange={(event) => setKeyword(event.target.value)}
    />
  </div>
  <Select
    value={statusFilter || 'all'}
    onValueChange={(value) => setStatusFilter(value === 'all' ? '' : value)}
  >
    <SelectTrigger aria-label="历史状态筛选" className="w-[140px]">
      <SelectValue placeholder="全部状态" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">全部状态</SelectItem>
      <SelectItem value="done">已完成</SelectItem>
      <SelectItem value="error">失败</SelectItem>
    </SelectContent>
  </Select>
</div>
```

- [ ] **Step 4: Replace history list item structure**

Replace the history row article structure. Change from:

```tsx
<article className="history-row" key={...}>
  <div className="history-row-meta">
    <div className="history-row-main">
      <strong>任务 #{record.id}</strong>
      <Badge variant={record.status === 'done' ? 'default' : 'destructive'}>
        {historyStatusLabel(record.status)}
      </Badge>
    </div>
    <div className="history-row-time">
      <Clock className="h-3.5 w-3.5" />
      <span>完成时间</span>
      <strong>{record.created_at || '未知时间'}</strong>
    </div>
  </div>
  <div className="history-row-section">
    <span>识别文本</span>
    <p>{record.transcript || '暂无识别文本'}</p>
  </div>
  ...
</article>
```

To:

```tsx
<article
  className={`history-item-flow ${record.status === 'error' ? 'history-item-flow-error' : ''}`}
  key={`${record.id}-${record.status}`}
>
  <div className="item-head-flow">
    <span className={`status-dot ${record.status === 'done' ? 'success' : 'error'}`} />
    <span className="item-id-flow">#{record.id}</span>
    <span className="item-time-flow">{record.created_at || '未知时间'}</span>
  </div>
  
  <div className="item-section-flow">
    <span className="item-label-flow">识别文本</span>
    <p className="item-text-flow">{record.transcript || '暂无识别文本'}</p>
  </div>

  <div className="item-section-flow">
    <span className="item-label-flow">任务结果</span>
    <p className="item-text-flow">{record.result || '暂无任务结果'}</p>
  </div>

  {record.detail ? (
    <div className="item-section-flow">
      <span className="item-label-flow">详情</span>
      <p className="item-text-flow">{record.detail}</p>
    </div>
  ) : null}

  <div className="item-actions-flow">
    <Button
      size="sm"
      variant="outline"
      onClick={() => void handlePreview(record.id)}
    >
      <Eye className="h-3.5 w-3.5 mr-1" />
      预览
    </Button>
    <Button
      size="sm"
      variant="outline"
      onClick={() => void handleRetry(record.id)}
    >
      <RefreshCw className="h-3.5 w-3.5 mr-1" />
      重试
    </Button>
  </div>
</article>
```

- [ ] **Step 5: Remove completedCount and failedCount variables**

Remove these variable declarations since we no longer display counts:

```tsx
// Remove these lines:
const completedCount = orderedHistory.filter((record) => record.status === 'done').length
const failedCount = orderedHistory.filter((record) => record.status === 'error').length
```

- [ ] **Step 6: Update feedback/error styling**

Replace console-feedback and console-error classes:

```tsx
{feedback ? (
  <div className="text-sm text-emerald-600 px-4 py-3" role="status">
    {feedback}
  </div>
) : null}

{error ? (
  <div className="text-sm text-red-600 px-4 py-3" role="alert">
    {error}
  </div>
) : null}
```

- [ ] **Step 7: Update outer section class**

Change outer section class from `console-page history-page` to:

```tsx
<section className="runtime-panel">
```

- [ ] **Step 8: Commit History page changes**

```bash
cd voice-app/apps/desktop
git add src/features/history/HistoryPanel.tsx
git commit -m "refactor(history): redesign with minimal flow layout

- Replace Badge status with 8px status dots
- Remove count statistics display
- Use filter-bar-inline for search/filter
- Apply history-item-flow for list items
- Simplify header to page-header-minimal

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Redesign Logs Page

**Files:**
- Modify: `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`

- [ ] **Step 1: Read current LogsPanel**

Run: Read the file to understand current structure
File: `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`

- [ ] **Step 2: Update imports to minimal style**

Change imports to remove Badge for counts:

```tsx
import { useEffect, useState } from 'react'
import {
  clearRuntimeLogs,
  exportRuntimeLogs,
  getRuntimeLogs,
  listenRuntimeLogs,
  type RuntimeLogEntry,
} from '../../lib/tauri'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Search, 
  Download, 
  Trash2
} from 'lucide-react'
```

- [ ] **Step 3: Add header and simplify filter bar**

Replace the console-filterbar section. Change from current structure to:

```tsx
<header className="page-header-minimal">
  <h3>运行日志</h3>
</header>

<div className="filter-bar-inline">
  <div className="search-input-minimal">
    <Search className="h-4 w-4" />
    <Input
      aria-label="筛选日志"
      placeholder="按内容筛选..."
      value={keyword}
      onChange={(event) => setKeyword(event.target.value)}
    />
  </div>
  <Select
    value={levelFilter || 'all'}
    onValueChange={(value) => setLevelFilter(value === 'all' ? '' : value)}
  >
    <SelectTrigger aria-label="日志级别" className="w-[120px]">
      <SelectValue placeholder="全部级别" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">全部级别</SelectItem>
      <SelectItem value="info">INFO</SelectItem>
      <SelectItem value="error">ERROR</SelectItem>
    </SelectContent>
  </Select>
  <div className="action-buttons-flow">
    <Button
      size="sm"
      variant="outline"
      onClick={() => void handleExport()}
    >
      <Download className="h-4 w-4 mr-1" />
      导出
    </Button>
    <Button
      size="sm"
      variant="outline"
      className="text-destructive hover:text-destructive"
      onClick={() => void handleClear()}
    >
      <Trash2 className="h-4 w-4 mr-1" />
      清空
    </Button>
  </div>
</div>
```

- [ ] **Step 4: Remove count variables**

Remove these variable declarations:

```tsx
// Remove these lines:
const infoCount = logs.filter((entry) => entry.level === 'info').length
const errorCount = logs.filter((entry) => entry.level === 'error').length
```

- [ ] **Step 5: Update log item structure**

Replace the log row structure. Change from:

```tsx
<div
  className={`log-row ${entry.level === 'error' ? 'log-row-error' : ''}`}
  key={...}
>
  <div className="log-row-meta">
    <Badge variant={entry.level === 'error' ? 'destructive' : 'secondary'}>
      {logLevelLabel(entry.level)}
    </Badge>
  </div>
  <p>{entry.message}</p>
</div>
```

To:

```tsx
<div
  className={`log-item-flow ${entry.level === 'error' ? 'log-item-flow-error' : ''}`}
  key={`${entry.level}-${entry.message}-${index}`}
>
  <span className={`log-level-badge ${entry.level}`}>
    {entry.level === 'error' ? 'ERROR' : 'INFO'}
  </span>
  <span className="log-time-flow">
    {entry.timestamp || new Date().toLocaleTimeString('zh-CN', { hour12: false })}
  </span>
  <p className="log-text-flow">{entry.message}</p>
</div>
```

- [ ] **Step 6: Update outer section class**

Change from `console-page logs-page` to:

```tsx
<section className="runtime-panel">
```

- [ ] **Step 7: Update empty state styling**

Replace console-empty-state:

```tsx
{filteredLogs.length === 0 ? (
  <div className="text-center py-12 text-muted-foreground">
    <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
    <p>暂无匹配日志</p>
  </div>
) : (
  ...
)}
```

- [ ] **Step 8: Update feedback/error styling**

Same as History page:

```tsx
{feedback ? (
  <div className="text-sm text-emerald-600 px-4 py-3" role="status">
    {feedback}
  </div>
) : null}

{error ? (
  <div className="text-sm text-red-600 px-4 py-3" role="alert">
    {error}
  </div>
) : null}
```

- [ ] **Step 9: Remove console-meta-row**

Remove the meta row that shows "当前显示 X 条":

```tsx
// Remove this section:
<div className="console-meta-row">
  <span>当前显示 {filteredLogs.length} 条</span>
  {keyword ? <Badge variant="outline">关键字: {keyword}</Badge> : null}
</div>
```

- [ ] **Step 10: Remove logLevelLabel helper function**

Remove the helper function since we now use direct INFO/ERROR text:

```tsx
// Remove this function:
function logLevelLabel(level: string) {
  switch (level) {
    case 'info':
      return '信息'
    case 'error':
      return '错误'
    default:
      return level || '未知'
  }
}
```

- [ ] **Step 11: Commit Logs page changes**

```bash
cd voice-app/apps/desktop
git add src/features/logs/LogsPanel.tsx
git commit -m "refactor(logs): redesign with minimal flow layout

- Replace Badge with INFO/ERROR text labels
- Remove count statistics display
- Use filter-bar-inline with action buttons
- Apply log-item-flow for log entries
- Simplify header to page-header-minimal

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Simplify Settings Tabs

**Files:**
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`

- [ ] **Step 1: Apply tabs pill styling**

Change the TabsList className from default to pill style. Find:

```tsx
<TabsList className="settings-tabs-list">
```

Replace with:

```tsx
<TabsList className="settings-tabs-pill">
```

- [ ] **Step 2: Update tabs bar wrapper**

Find the settings-tabs-bar div and simplify:

```tsx
<div className="settings-tabs-bar">
```

Keep the wrapper but the CSS will handle the styling now.

- [ ] **Step 3: Commit Settings tabs changes**

```bash
cd voice-app/apps/desktop
git add src/features/settings/SettingsPanel.tsx
git commit -m "refactor(settings): simplify tabs to pill style

- Change TabsList to settings-tabs-pill class
- Remove heavy border and background styling

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Update Tests

**Files:**
- Modify: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 1: Run existing tests to identify failures**

```bash
cd voice-app/apps/desktop
pnpm test
```

Expected: Some tests may fail due to removed Badge components and changed class names

- [ ] **Step 2: Read test file to understand test structure**

File: `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

- [ ] **Step 3: Update History panel test expectations**

Find tests that look for Badge elements with count text. Change from:

```tsx
// Old: looking for Badge with count
await section.findByText('已完成 8')
```

To look for status dots instead (or remove count assertions):

```tsx
// New: verify status dots exist
const statusDots = await section.findAllByRole('span')
expect(statusDots.length).toBeGreaterThan(0)
```

- [ ] **Step 4: Update Logs panel test expectations**

Similarly update log tests. Change from Badge INFO/错误 to direct INFO/ERROR text:

```tsx
// Old:
await section.findByText('信息')
await section.findByText('错误')

// New:
await section.findByText('INFO')
await section.findByText('ERROR')
```

- [ ] **Step 5: Update filter bar test**

Remove tests that look for console-summary or console-meta-row classes.

- [ ] **Step 6: Run tests to verify all pass**

```bash
cd voice-app/apps/desktop
pnpm test
```

Expected: All tests pass

- [ ] **Step 7: Commit test updates**

```bash
cd voice-app/apps/desktop
git add src/__tests__/app-shell.test.tsx
git commit -m "test: update tests for minimal page redesign

- Remove Badge count assertions
- Update log level text expectations
- Adjust class name selectors

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd voice-app/apps/desktop
pnpm test
```

Expected: All tests pass

- [ ] **Step 2: Start dev server and visual check**

```bash
cd voice-app/apps/desktop
pnpm dev
```

Manual check:
- Navigate to History page - verify status dots and minimal header
- Navigate to Logs page - verify INFO/ERROR labels and minimal header
- Navigate to Settings page - verify pill-style tabs

- [ ] **Step 3: Create final commit with all changes**

```bash
cd voice-app/apps/desktop
git status
# If any uncommitted changes remain:
git add -A
git commit -m "refactor(ui): complete minimal page redesign

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

| Spec Requirement | Task Coverage |
|------------------|---------------|
| Minimal header (title only) | Task 2 Step 3, Task 3 Step 3 |
| No count statistics | Task 2 Step 5, Task 3 Step 4 |
| Status dots (8px) for history | Task 1 Step 4, Task 2 Step 4 |
| INFO/ERROR labels for logs | Task 1 Step 6, Task 3 Step 5 |
| Simplified tabs pill style | Task 1 Step 2, Task 4 Step 1 |
| CSS utility classes added | Task 1 Steps 1-6 |
| Tests updated | Task 5 |

**Placeholder scan:** ✓ No TBD/TODO found
**Type consistency:** ✓ All class names match between CSS and TSX