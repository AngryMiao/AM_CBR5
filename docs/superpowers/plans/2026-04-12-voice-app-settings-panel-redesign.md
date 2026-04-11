# SettingsPanel 美化重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 SettingsPanel 为 Glassmorphism 风格的简洁设计，移除 sticky footer，采用 pill 样式 tabs 和玻璃态卡片。

**Architecture:** 保持现有 React 组件结构和功能逻辑，仅调整 CSS 样式和布局结构。主要改动：TabsList 改为 pill 样式、移除 .settings-sticky-footer、内容区使用 Card 包裹、简化分隔线样式。

**Tech Stack:** React, Tailwind CSS, shadcn/ui (Card, Tabs, Switch, Input, Button, Badge)

---

## 文件结构

| 文件 | 改动 |
|------|------|
| `voice-app/apps/desktop/src/styles.css` | 修改样式：新增 pill tabs、玻璃态卡片样式、移除 sticky footer 相关样式 |
| `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx` | 修改组件：使用 Card 包裹内容、移除 sticky footer、调整布局结构 |

---

### Task 1: 更新 CSS 样式 - Pill Tabs 和玻璃态卡片

**Files:**
- Modify: `voice-app/apps/desktop/src/styles.css`

- [ ] **Step 1: 添加 pill tabs 样式**

在 `styles.css` 的 `@layer components` 或合适位置添加：

```css
/* Settings Pill Tabs - Glassmorphism Style */
.settings-pill-tabs {
  display: flex;
  gap: 8px;
  padding: 0;
  background: transparent;
  border: none;
  height: auto;
}

.settings-pill-tab {
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
  border: none;
  font-size: 13px;
  color: #64748b;
  transition: all 0.15s ease;
  cursor: pointer;
}

.settings-pill-tab:hover {
  background: rgba(255, 255, 255, 0.78);
}

.settings-pill-tab[data-state="active"] {
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(203, 213, 225, 0.78);
  color: hsl(var(--primary));
  box-shadow: 0 2px 8px rgba(148, 163, 184, 0.12);
}

.settings-pill-panel {
  margin-top: 0;
}
```

- [ ] **Step 2: 添加玻璃态设置卡片样式**

```css
/* Settings Glass Card */
.settings-glass-card {
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(203, 213, 225, 0.72);
  border-radius: 16px;
  padding: 20px;
}

/* Settings Toggle Row - Simplified */
.settings-toggle-simple {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.settings-toggle-simple:first-child {
  padding-top: 0;
}

/* Settings Divider - Semi-transparent */
.settings-divider {
  height: 1px;
  background: rgba(203, 213, 225, 0.5);
  margin: 4px 0;
}

/* Settings Action Bar - Inline */
.settings-action-bar {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
  padding-top: 16px;
}

/* Settings Glass Button */
.settings-btn-glass {
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(203, 213, 225, 0.72);
  border-radius: 8px;
  color: #475569;
  font-size: 13px;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.settings-btn-glass:hover {
  background: rgba(255, 255, 255, 0.92);
}

.settings-btn-primary {
  background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(213, 91%, 45%) 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  padding: 8px 16px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(14, 165, 233, 0.3);
  transition: all 0.15s ease;
}

.settings-btn-primary:hover {
  box-shadow: 0 4px 12px rgba(14, 165, 233, 0.4);
}

.settings-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
```

- [ ] **Step 3: 移除旧的 sticky footer 样式**

找到并删除以下 CSS 规则（约 800-823 行）：

```css
/* 删除这些 */
.settings-sticky-footer { ... }
.settings-sticky-message { ... }
.settings-sticky-actions { ... }
```

替换为新的 action bar 样式（已在 Step 2 添加）。

- [ ] **Step 4: 简化 pane header 样式**

修改 `.settings-pane-header` 样式，移除边框：

```css
.settings-pane-header-minimal {
  display: none; /* 移除标题区 */
}
```

- [ ] **Step 5: 提交 CSS 更改**

```bash
git add voice-app/apps/desktop/src/styles.css
git commit -m "style(settings): add glassmorphism pill tabs and card styles"
```

---

### Task 2: 重构 SettingsPanel React 组件

**Files:**
- Modify: `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`

- [ ] **Step 1: 导入 Card 组件**

在文件顶部添加 Card 导入：

```tsx
import { Card, CardContent } from '@/components/ui/card'
```

- [ ] **Step 2: 修改 TabsList 为 pill 样式**

找到 `<TabsList>` 元素（约 308 行），修改 className：

```tsx
<TabsList className="settings-pill-tabs">
  <TabsTrigger 
    className="settings-pill-tab" 
    value="general"
  >通用</TabsTrigger>
  <TabsTrigger 
    className="settings-pill-tab" 
    value="hotkey"
  >快捷键</TabsTrigger>
  <TabsTrigger 
    className="settings-pill-tab" 
    value="asr"
  >ASR</TabsTrigger>
  <TabsTrigger 
    className="settings-pill-tab" 
    value="model"
  >模型</TabsTrigger>
  <TabsTrigger 
    className="settings-pill-tab" 
    value="mcp"
  >MCP</TabsTrigger>
</TabsList>
```

移除 `onClick={() => setActiveTab(...)}` 调用，Tabs 组件已处理状态切换。

- [ ] **Step 3: 移除 settings-tabs-bar 包装 div**

找到包装 TabsList 的 div（约 307 行），删除：

```tsx
<!-- 删除这个 div -->
<div className="settings-tabs-bar">
  <TabsList className="settings-tabs-pill">
    ...
  </TabsList>
</div>
```

改为直接放置 TabsList：

```tsx
<TabsList className="settings-pill-tabs">
  ...
</TabsList>
```

- [ ] **Step 4: 用 Card 包裹 TabsContent 内容**

修改每个 TabsContent 的内容结构，例如 `value="general"`：

```tsx
<TabsContent className="settings-pill-panel" value="general">
  <div className="settings-glass-card">
    <div className="settings-toggle-simple">
      <div>
        <strong>保存历史记录</strong>
      </div>
      <Switch
        aria-label="保存历史记录"
        checked={draft.history_enabled}
        disabled={isBusy}
        onCheckedChange={(checked) => updateDraft('history_enabled', checked)}
      />
    </div>
    
    <div className="settings-divider" />
    
    <div className="settings-toggle-simple">
      <div>
        <strong>开机自启动</strong>
      </div>
      <Switch
        aria-label="开机自启动"
        checked={draft.auto_launch_enabled}
        disabled={isBusy}
        onCheckedChange={(checked) => updateDraft('auto_launch_enabled', checked)}
      />
    </div>
  </div>
  
  <!-- Action buttons moved here -->
  <div className="settings-action-bar">
    <button
      className="settings-btn-glass"
      disabled={isBusy}
      onClick={() => void handleReset()}
      type="button"
    >
      重置
    </button>
    <button
      className="settings-btn-primary"
      disabled={isBusy || hasBlockingErrors}
      type="submit"
    >
      保存
    </button>
  </div>
</TabsContent>
```

- [ ] **Step 5: 同样修改其他 TabsContent**

对 `hotkey`、`asr`、`model`、`mcp` tabs 应用相同结构：

1. 移除 `<section className="settings-pane">` 包装
2. 移除 `<div className="settings-pane-header">` 标题区
3. 用 `<div className="settings-glass-card">` 包裹表单内容
4. 用 `<div className="settings-divider" />` 分隔各项
5. 将 action buttons 放在卡片外部的 `<div className="settings-action-bar">`

注意：保留所有表单字段的功能逻辑不变，只调整布局。

- [ ] **Step 6: 移除旧的 sticky footer**

找到并删除以下 JSX（约 596-619 行）：

```tsx
<!-- 删除这个 div -->
<div className="settings-sticky-footer">
  <div className="settings-sticky-message">
    {message ? (...) : ...}
  </div>
  <div className="settings-sticky-actions">
    <Button ...>重置</Button>
    <Button ...>保存设置</Button>
  </div>
</div>
```

状态消息改为在卡片顶部显示（如果有错误/反馈）：

```tsx
{message ? (
  <div className={status === 'error' ? 'text-destructive' : 'text-emerald-600'} style={{ marginBottom: '12px', fontSize: '13px' }}>
    {message}
  </div>
) : null}
```

- [ ] **Step 7: 确保表单功能完整**

检查以下功能是否正常：
- 保存按钮触发 `handleSave`
- 重置按钮触发 `handleReset`
- 禁用状态：`isBusy` 和 `hasBlockingErrors`
- 验证错误显示

- [ ] **Step 8: 提交组件更改**

```bash
git add voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx
git commit -m "refactor(settings): redesign with glassmorphism style and pill tabs"
```

---

### Task 3: 验证和测试

**Files:**
- Run: `voice-app/apps/desktop/` 目录

- [ ] **Step 1: 启动开发服务器测试**

```bash
cd voice-app/apps/desktop
pnpm dev
```

Expected: 应用启动，打开设置页面查看新样式

- [ ] **Step 2: 手动验证功能**

验证以下功能正常工作：
1. 点击 Tabs 切换不同设置面板
2. 开关切换（保存历史记录、开机自启动）
3. 输入框编辑（ASR 配置、模型配置）
4. 保存按钮点击保存设置
5. 重置按钮恢复默认设置
6. 验证错误显示（如必填项缺失）

- [ ] **Step 3: 检查视觉样式**

确认以下样式正确：
1. Tabs 为 pill 样式（圆角胶囊）
2. 内容区为玻璃态卡片（半透明 + blur）
3. 分隔线为半透明细线
4. 按钮样式：玻璃态 + 渐变主按钮
5. 响应式布局正常

- [ ] **Step 4: 提交最终更改**

如果一切正常：

```bash
git add -A
git commit -m "feat(settings): complete glassmorphism redesign"
```

---

## Self-Review Checklist

| Spec 要求 | Task 覆盖 |
|-----------|----------|
| Tabs → Pill 样式 | Task 1 Step 1, Task 2 Step 2 |
| 移除 Sticky Footer | Task 1 Step 3, Task 2 Step 6 |
| 内容区 → 玻璃态卡片 | Task 1 Step 2, Task 2 Step 4-5 |
| 表单项 → 流式布局 | Task 2 Step 4-5 |
| 分隔线 → 半透明 | Task 1 Step 2 |
| 保持功能逻辑不变 | Task 2 Step 7, Task 3 Step 2 |

**Placeholder 检查:** ✓ 无 TBD/TODO
**类型一致性:** ✓ className 名称一致

---

## 完成状态

实施完成后，SettingsPanel 将具备：
- Glassmorphism 风格的简洁外观
- Pill 样式的 Tabs 导航
- 玻璃态卡片内容区
- 半透明分隔线
- 内联操作按钮（非 sticky）
- 完整保留原有功能