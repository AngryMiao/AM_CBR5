# Voice App Homepage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor RuntimeStatus component to use flow-based layout, removing card-based styling, using shadcn/ui Badge and Separator.

**Architecture:** Two-column flow layout with left main content (flex 1.2) and right side info (flex 0.8). Content separated by dividers, not cards. Status items displayed as inline styled boxes.

**Tech Stack:** React, Tailwind CSS, shadcn/ui (Badge, Separator), Tauri

---

## File Structure

| File | Responsibility |
|------|----------------|
| `voice-app/apps/desktop/src/styles.css` | New flow layout CSS classes, remove old card styles |
| `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx` | Refactored component with flow layout |

---

### Task 1: Add New CSS Styles

**Files:**
- Modify: `voice-app/apps/desktop/src/styles.css`

- [ ] **Step 1: Add new flow layout styles to styles.css**

Append the following CSS at the end of `voice-app/apps/desktop/src/styles.css` (before the media queries section, around line 988):

```css
/* ============================================
   Flow Layout Styles (Homepage Redesign)
   ============================================ */

/* Header section */
.runtime-header {
  display: grid;
  gap: 8px;
  padding-bottom: 20px;
}

.runtime-eyebrow {
  display: flex;
  align-items: center;
  gap: 12px;
}

.runtime-label {
  font-size: 11px;
  color: #94a3b8;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.runtime-title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.runtime-description {
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
}

/* Status row - inline items */
.runtime-status-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding-bottom: 24px;
}

.runtime-status-item {
  padding: 12px 16px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e2e8f0;
}

.runtime-status-item-label {
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.runtime-status-item-value {
  font-size: 14px;
  font-weight: 600;
}

.runtime-status-item-success {
  background: rgba(220, 252, 231, 0.5);
  border-color: #86efac;
}

.runtime-status-item-success .runtime-status-item-value {
  color: #166534;
}

/* Two-column layout */
.runtime-columns {
  display: flex;
  gap: 24px;
  padding-top: 24px;
}

.runtime-main-column {
  flex: 1.2;
  display: grid;
  gap: 24px;
}

.runtime-side-column-new {
  flex: 0.8;
  display: grid;
  gap: 24px;
  padding-left: 24px;
  border-left: 1px solid #e2e8f0;
}

/* Section styles */
.runtime-section-new {
  display: grid;
  gap: 12px;
}

.runtime-section-header-new {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.runtime-section-header-icon {
  color: hsl(var(--primary));
}

/* Detail rows - flow style */
.runtime-detail-row-new {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}

.runtime-detail-row-new:last-child {
  border-bottom: none;
}

.runtime-detail-label-new {
  color: #64748b;
}

.runtime-detail-value-new {
  font-weight: 500;
}

.runtime-detail-success {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
}

/* MCP server list */
.runtime-server-list-new {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.runtime-server-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
}

.runtime-server-info {
  display: grid;
  gap: 2px;
}

.runtime-server-name {
  font-size: 13px;
  font-weight: 500;
}

.runtime-server-id {
  font-size: 11px;
  color: #94a3b8;
}

/* Tool chips */
.runtime-tool-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.runtime-tool-chip {
  padding: 3px 8px;
  border-radius: 4px;
  background: #f1f5f9;
  font-size: 11px;
}

/* Supporting copy */
.runtime-supporting-copy-new {
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}
```

- [ ] **Step 2: Add responsive adjustments to media queries**

Find the `@media (max-width: 960px)` section (around line 989) and add the following inside it:

```css
  /* Flow layout responsive */
  .runtime-columns {
    flex-direction: column;
  }

  .runtime-side-column-new {
    padding-left: 0;
    border-left: none;
    padding-top: 24px;
    border-top: 1px solid #e2e8f0;
  }

  .runtime-status-row {
    flex-direction: column;
  }

  .runtime-status-item {
    flex: 1;
  }
```

- [ ] **Step 3: Commit CSS changes**

```bash
cd voice-app/apps/desktop
git add src/styles.css
git commit -m "style: add new flow layout CSS classes for homepage redesign

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Refactor RuntimeStatus Component

**Files:**
- Modify: `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`

- [ ] **Step 1: Read the current RuntimeStatus.tsx file**

The file is at `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`. Current structure uses:
- `runtime-strip`, `runtime-fact-list`, `runtime-layout`, `runtime-diagnostics` CSS classes
- Card-like styling with borders and backgrounds

- [ ] **Step 2: Refactor the component JSX structure**

Replace the entire return statement in `RuntimeStatus.tsx` with the new flow layout structure. Keep all the data bindings and logic exactly the same.

Key changes:
1. Replace `runtime-strip` with `runtime-header`
2. Replace `runtime-fact-list`/`runtime-fact-item` with `runtime-status-row`/`runtime-status-item`
3. Replace `runtime-layout`/`runtime-diagnostics` with `runtime-columns`
4. Use `Separator` component from shadcn/ui instead of CSS borders
5. Keep all text content the same (tests depend on it)

Write the new component structure:

```tsx
return (
  <section className="runtime-panel">
    {/* Header section */}
    <header className="runtime-header">
      <div className="runtime-eyebrow">
        <span className="runtime-label">RUNTIME WORKSPACE</span>
        <Badge variant="secondary">
          <Activity className="mr-1 h-3 w-3" />
          {getInputModeLabel(input_mode)}
        </Badge>
      </div>
      <h1 className="runtime-title">运行控制</h1>
      <p className="runtime-description">{detail}</p>
    </header>

    {/* Status row - inline items */}
    <div className="runtime-status-row">
      {topStatusItems.map((item, index) => (
        <div
          className={`runtime-status-item ${index === 3 ? 'runtime-status-item-success' : ''}`}
          key={item.label}
        >
          <div className="runtime-status-item-label">{item.label}</div>
          <div className="runtime-status-item-value">{item.value}</div>
        </div>
      ))}
    </div>

    <Separator />

    {/* Main two-column layout */}
    <div className="runtime-columns">
      {/* Left column - main content */}
      <div className="runtime-main-column">
        {/* Task result section */}
        <section className="runtime-section-new">
          <div className="runtime-section-header-new">
            <Zap className="h-4 w-4 runtime-section-header-icon" />
            <span>任务结果</span>
          </div>
          <div className="runtime-detail-row-new">
            <span className="runtime-detail-label-new runtime-entry-label">识别结果</span>
          </div>
          <p className="runtime-entry-value">{result || '等待 LLM 输出...'}</p>
          {runtimeNotices.map((notice) => (
            <div className="runtime-detail-row-new" key={notice.label}>
              <span className="runtime-detail-label-new">{notice.label}</span>
              <strong className="runtime-detail-value-new">{notice.value}</strong>
            </div>
          ))}
          {platformDiagnostics?.permission_hint ? (
            <div className="runtime-alert runtime-alert-warning">
              <AlertCircle className="h-4 w-4" />
              <span>{platformDiagnostics.permission_hint}</span>
            </div>
          ) : null}
        </section>

        {/* Real-time summary section */}
        <section className="runtime-section-new">
          <div className="runtime-section-header-new">
            <Activity className="h-4 w-4 runtime-section-header-icon" />
            <span>实时摘要</span>
          </div>
          {platformCards.map((card) => (
            <div className="runtime-detail-row-new" key={card.label}>
              <span className="runtime-detail-label-new">{card.label}</span>
              <strong className="runtime-detail-value-new">{card.value}</strong>
            </div>
          ))}
          {runtimeCards.map((card) => (
            <div className="runtime-detail-row-new" key={card.label}>
              <span className="runtime-detail-label-new">{card.label}</span>
              <strong className="runtime-detail-value-new">{card.value}</strong>
            </div>
          ))}
        </section>
      </div>

      {/* Right column - side info */}
      <div className="runtime-side-column-new">
        {/* System status section */}
        <section className="runtime-section-new">
          <div className="runtime-section-header-new">
            <Settings className="h-4 w-4 runtime-section-header-icon" />
            <span>系统状态</span>
          </div>
          {platformCards.map((card) => (
            <div className="runtime-detail-row-new" key={`side-${card.label}`}>
              <span className="runtime-detail-label-new">{card.label}</span>
              <strong className="runtime-detail-value-new">{card.value}</strong>
            </div>
          ))}
          <div className="runtime-detail-row-new">
            <span className="runtime-detail-label-new">AngryMiao</span>
            <Badge
              variant={
                angrymiaoStatus.includes('异常') || angrymiaoStatus === '未启用'
                  ? 'secondary'
                  : 'default'
              }
            >
              {angrymiaoStatus}
            </Badge>
          </div>
        </section>

        {/* MCP Runtime section */}
        {runtimeDiagnostics ? (
          <section className="runtime-section-new">
            <div className="runtime-section-header-new">
              <Server className="h-4 w-4 runtime-section-header-icon" />
              <span>MCP 运行时</span>
              <Badge variant="outline">
                {runtimeDiagnostics.active_server_count}/{runtimeDiagnostics.configured_server_count}
              </Badge>
            </div>
            <p className="runtime-supporting-copy-new">
              已配置 {runtimeDiagnostics.configured_server_count} 个服务，当前活跃 {runtimeDiagnostics.active_server_count} 个。
            </p>
            {runtimeDiagnostics.skill_bundle_root ? (
              <p className="runtime-supporting-copy-new">内置技能包根目录：{runtimeDiagnostics.skill_bundle_root}</p>
            ) : null}
            {runtimeDiagnostics.mcp_servers.length === 0 ? (
              <p className="runtime-supporting-copy-new">当前没有启用中的 MCP 服务。</p>
            ) : (
              <div className="runtime-server-list-new">
                {runtimeDiagnostics.mcp_servers.map((server) => (
                  <div className="runtime-server-item" key={server.id}>
                    <div className="runtime-server-info">
                      <strong className="runtime-server-name">{server.name}</strong>
                      <span className="runtime-server-id">{server.id}</span>
                    </div>
                    <Badge variant={server.active_in_runtime ? 'default' : 'secondary'}>
                      {server.active_in_runtime ? '运行中' : '未接通'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {runtimeDiagnostics.active_tools.length > 0 ? (
              <>
                <Separator />
                <div>
                  <span className="runtime-entry-label runtime-detail-label-new">已发现工具</span>
                  <div className="runtime-tool-chips">
                    {runtimeDiagnostics.active_tools.map((tool) => (
                      <span className="runtime-tool-chip" key={tool.qualified_name}>
                        {tool.qualified_name}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {runtimeDiagnostics.mcp_last_sync_error ? (
              <div className="runtime-alert runtime-alert-danger">
                <AlertCircle className="h-4 w-4" />
                <span>MCP 运行时同步失败: {runtimeDiagnostics.mcp_last_sync_error}</span>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* AngryMiao Runtime section */}
        {runtimeDiagnostics ? (
          <section className="runtime-section-new">
            <div className="runtime-section-header-new">
              <Cpu className="h-4 w-4 runtime-section-header-icon" />
              <span>AngryMiao 运行时</span>
            </div>
            <div className="runtime-diagnostic-grid">
              <div className="runtime-diagnostic-stat">
                <span>技能包安装</span>
                <strong>{runtimeDiagnostics.angrymiao.bundle_installed ? '已安装' : '未安装'}</strong>
              </div>
              <div className="runtime-diagnostic-stat">
                <span>当前平台</span>
                <strong>{runtimeDiagnostics.angrymiao.supported_on_current_platform ? '已支持' : '未支持'}</strong>
              </div>
              <div className="runtime-diagnostic-stat">
                <span>运行入口</span>
                <strong>{runtimeDiagnostics.angrymiao.runtime_entry_exists ? '存在' : '缺失'}</strong>
              </div>
              <div className="runtime-diagnostic-stat">
                <span>键盘驱动</span>
                <strong>{runtimeDiagnostics.angrymiao.keyboard_driver_exists ? '已就绪' : '未就绪'}</strong>
              </div>
            </div>

            {runtimeDiagnostics.angrymiao.keyboard_driver_source ? (
              <div className="runtime-detail-row-new">
                <span className="runtime-detail-label-new">{getKeyboardDriverSourceLabel(runtimeDiagnostics.angrymiao.keyboard_driver_source)}</span>
                <strong className="runtime-detail-value-new">{runtimeDiagnostics.angrymiao.keyboard_driver_path ?? '未配置'}</strong>
              </div>
            ) : null}

            {runtimeDiagnostics.angrymiao.missing_required_env.length > 0 ? (
              <div className="runtime-alert runtime-alert-warning">
                <AlertCircle className="h-4 w-4" />
                <span>
                  缺少必填环境: {runtimeDiagnostics.angrymiao.missing_required_env.join('、')}
                </span>
              </div>
            ) : null}

            {runtimeDiagnostics.angrymiao.error ? (
              <div className="runtime-alert runtime-alert-danger">
                <AlertCircle className="h-4 w-4" />
                <span>{runtimeDiagnostics.angrymiao.error}</span>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>

    {/* Error display */}
    {(error ?? runtimeError) ? (
      <div className="runtime-alert runtime-alert-danger">
        <AlertCircle className="h-4 w-4" />
        <span>{error ?? runtimeError}</span>
      </div>
    ) : null}
  </section>
)
```

- [ ] **Step 3: Ensure Separator import exists**

Verify that `Separator` is imported from `@/components/ui/separator`. Add if missing:

```tsx
import { Separator } from '@/components/ui/separator'
```

- [ ] **Step 4: Run tests to verify component still renders expected content**

```bash
cd voice-app/apps/desktop
pnpm test -- --run src/__tests__/app-shell.test.tsx
```

Expected: All tests pass, especially:
- `renders the runtime control section without the removed marketing hero copy`
- `loads and renders platform diagnostics and mcp runtime diagnostics`

- [ ] **Step 5: Commit component refactor**

```bash
cd voice-app/apps/desktop
git add src/features/runtime/RuntimeStatus.tsx
git commit -m "refactor(runtime): use flow layout for RuntimeStatus component

Remove card-based styling, adopt two-column flow layout.
Use shadcn/ui Badge and Separator components.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Remove Old Card-Based CSS Styles

**Files:**
- Modify: `voice-app/apps/desktop/src/styles.css`

- [ ] **Step 1: Identify and remove old card-based CSS classes**

Remove the following CSS classes from `styles.css`:

1. `.runtime-strip` (lines ~487-537)
2. `.runtime-fact-list` and `.runtime-fact-item` (lines ~539-566)
3. `.runtime-layout` and `.runtime-diagnostics` (lines ~568-578)
4. `.runtime-side-column` (original, lines ~580-583) - keep `.runtime-side-column-new`
5. `.runtime-chip-block` and `.runtime-chip-list` (lines ~649-662)

Search and delete these sections. Be careful not to remove:
- `.runtime-panel` (keep for main container)
- `.runtime-entry`, `.runtime-entry-label`, `.runtime-entry-value` (keep for data display)
- `.runtime-alert`, `.runtime-alert-warning`, `.runtime-alert-danger` (keep for alerts)
- `.runtime-diagnostic-grid`, `.runtime-diagnostic-stat` (keep for AngryMiao runtime stats)

- [ ] **Step 2: Run tests again to verify nothing broke**

```bash
cd voice-app/apps/desktop
pnpm test -- --run src/__tests__/app-shell.test.tsx
```

Expected: All tests pass.

- [ ] **Step 3: Commit CSS cleanup**

```bash
cd voice-app/apps/desktop
git add src/styles.css
git commit -m "style: remove old card-based CSS classes from homepage

Remove runtime-strip, runtime-fact-list, runtime-layout, etc.
Keep flow layout classes added in previous commit.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Visual Verification

**Files:**
- None (manual verification)

- [ ] **Step 1: Start the development server**

```bash
cd voice-app/apps/desktop
pnpm dev
```

- [ ] **Step 2: Open the app and verify homepage**

Check that:
1. Header shows "RUNTIME WORKSPACE" label and "运行控制" title
2. Status row displays 4 inline items (输入模式, 麦克风, 平台, MCP)
3. Separator line appears between status row and columns
4. Left column shows 任务结果 and 实时摘要 sections
5. Right column shows 系统状态, MCP 运行时, AngryMiao 运行时
6. MCP server list items display correctly
7. Tool chips display as inline badges
8. All alerts/warnings display correctly

- [ ] **Step 3: Test responsive behavior**

Resize the window to under 960px width and verify:
1. Columns stack vertically
2. Side column moves below main column with top border
3. Status row items stack vertically

- [ ] **Step 4: Final commit (if any adjustments needed)**

```bash
cd voice-app/apps/desktop
git add -A
git commit -m "style: final polish for homepage flow layout

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

**1. Spec Coverage:**
- ✅ Layout: two-column flow → Task 2
- ✅ Badge style: shadcn secondary → Task 2 (Badge imports)
- ✅ Separator: shadcn Separator → Task 2
- ✅ Status row: inline items → Task 2
- ✅ CSS styles: new classes → Task 1
- ✅ Remove old styles → Task 3
- ✅ Responsive → Task 1 (media queries)
- ✅ Visual verification → Task 4

**2. Placeholder Scan:**
- ✅ No TBD/TODO
- ✅ All code blocks contain actual code
- ✅ All file paths are exact

**3. Type Consistency:**
- ✅ CSS class names match between styles.css and component
- ✅ All imports are from existing shadcn/ui components
- ✅ Text content preserved (tests check for specific text)