---
name: voice-app-homepage-redesign
description: voice-app 首页去卡片化重构设计 - 流式布局 + shadcn/ui 美化
type: project
---

# Voice App Homepage Redesign Design

## Overview

重构 voice-app 桌面应用的首页（RuntimeStatus），去除现有的卡片化设计，采用左右分栏流式布局，使用 shadcn/ui 组件和 Tailwind CSS 进行美化。

**Why:** 当前首页使用多个独立卡片组件展示运行状态、任务结果、平台诊断等信息，视觉上较为分散，信息层级不够清晰。用户希望去除卡片化，采用更自然的流式文档布局。

**How to apply:** 本设计作为首页重构的实现指南，涵盖布局结构、组件样式、CSS 规范等细节。

---

## Current State Analysis

### 现有布局结构

当前首页 (`RuntimeStatus.tsx`) 采用以下结构：

1. **runtime-strip** - 顶部状态条，显示标签、模式徽章、标题和描述
2. **runtime-fact-list** - 4 个状态卡片网格（输入模式、麦克风、平台、MCP）
3. **runtime-layout** - 左右两栏布局：
   - 左侧：任务结果 + 实时摘要（多条 runtime-detail-row）
   - 右侧：系统摘要（runtime-summary-item）
4. **runtime-diagnostics** - 底部两栏：
   - MCP 运行时详情
   - AngryMiao 运行时诊断

### 现有问题

1. **过度卡片化** - 每个信息块都有独立的卡片样式（边框、背景、阴影），视觉上较为分散
2. **信息层级不清** - 多层卡片嵌套导致内容层级难以一眼识别
3. **样式冗余** - CSS 中定义了大量卡片相关样式，与 shadcn/ui 组件存在重叠

---

## Target Design

### 设计决策

经过用户确认的设计选择：

| 决策项 | 选择 | 说明 |
|--------|------|------|
| 布局模式 | 左右分栏流式 | 左侧主内容流，右侧辅助信息栏，用分隔线区分区块 |
| 徽章样式 | 淡色背景 | shadcn Badge secondary 风格，低调不抢眼 |
| 分隔线 | 灰色实线 | `#e2e8f0`，简洁清晰 |
| 信息密度 | 舒适阅读 | padding 24px，宽松间距 |

### 新布局结构

```
┌─────────────────────────────────────────────────────────────┐
│ RUNTIME WORKSPACE                  [待命]                   │  ← header + badge
│ 运行控制                                                     │  ← title
│ 当前语音任务、系统状态与运行摘要                              │  ← description
├─────────────────────────────────────────────────────────────┤
│ [输入模式: 待命] [麦克风: 系统默认] [平台: Win] [MCP: 2/4]    │  ← status row (inline badges)
├─────────────────────────────────────────────────────────────┤  ← separator
│ ┌──────────────────────┬──────────────────────┐             │
│ │ ⚡ 任务结果          │ ⚙️ 系统状态           │             │  ← section headers
│ │ 识别结果            │ AngryMiao: [已启用]   │             │
│ │ 等待 LLM 输出...    │                       │             │
│ ├──────────────────────┼──────────────────────┤             │  ← separator
│ │ 📊 实时摘要         │ 🖥️ MCP 运行时         │             │
│ │ 当前平台: Win       │ 已配置 4 个，活跃 2 个 │             │
│ │ 麦克风权限: ✓已授权 │ ┌─────────────────┐   │             │
│ │ 输入控制: ✓已授权   │ │ transcriber [运行中] │ │             │
│ │ 热键后端: 原生钩子  │ │ executor [未接通]   │ │             │
│ └──────────────────────┴──────────────────────┘             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. Component Structure

**文件修改：** `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`

重构组件结构为：

```tsx
<section className="runtime-panel">
  {/* Header section */}
  <header className="runtime-header">
    <div className="runtime-eyebrow">
      <span className="runtime-label">RUNTIME WORKSPACE</span>
      <Badge variant="secondary">{inputModeLabel}</Badge>
    </div>
    <h1 className="runtime-title">运行控制</h1>
    <p className="runtime-description">{detail}</p>
  </header>

  {/* Status row - inline badges */}
  <div className="runtime-status-row">
    {/* 4 status items as inline styled boxes */}
  </div>

  <Separator />

  {/* Main two-column layout */}
  <div className="runtime-columns">
    <div className="runtime-main-column">
      {/* Task result section */}
      {/* Real-time summary section */}
    </div>
    <Separator orientation="vertical" />
    <div className="runtime-side-column">
      {/* System status section */}
      {/* MCP runtime section */}
    </div>
  </div>
</section>
```

### 2. CSS Styles

**文件修改：** `voice-app/apps/desktop/src/styles.css`

新增/修改以下样式类：

```css
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

.runtime-side-column {
  flex: 0.8;
  display: grid;
  gap: 24px;
  padding-left: 24px;
  border-left: 1px solid #e2e8f0;
}

/* Section styles */
.runtime-section {
  display: grid;
  gap: 12px;
}

.runtime-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.runtime-section-header-icon {
  color: hsl(var(--primary));
}

/* Detail rows */
.runtime-detail-row {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #f1f5f9;
  font-size: 13px;
}

.runtime-detail-row:last-child {
  border-bottom: none;
}

.runtime-detail-label {
  color: #64748b;
}

.runtime-detail-value {
  font-weight: 500;
}

.runtime-detail-success {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
}

/* MCP server list */
.runtime-server-list {
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

/* Responsive adjustments */
@media (max-width: 960px) {
  .runtime-columns {
    flex-direction: column;
  }

  .runtime-side-column {
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
}
```

### 3. shadcn/ui Components Used

| 组件 | 用途 | 变体 |
|------|------|------|
| `Badge` | 状态标签、MCP 服务状态 | `secondary` (淡色), `outline` (边框) |
| `Separator` | 区块分隔线 | 默认 (水平), `orientation="vertical"` (垂直) |
| `Button` | 保持现有按钮样式 | 无变化 |

### 4. Removal of Old Styles

删除以下 CSS 类（卡片化相关）：

- `.runtime-fact-list` / `.runtime-fact-item` - 替换为 `.runtime-status-row` / `.runtime-status-item`
- `.runtime-strip` / `.runtime-strip-copy` / `.runtime-strip-eyebrow` / `.runtime-strip-label` - 合入 `.runtime-header`
- `.runtime-layout` / `.runtime-diagnostics` - 替换为 `.runtime-columns`
- `.runtime-side-column` 原有样式 - 重新定义
- `.runtime-chip-block` / `.runtime-chip-list` - 替换为 `.runtime-tool-chips`

---

## Implementation Checklist

1. **修改 RuntimeStatus.tsx**
   - 重构组件 JSX 结构为流式布局
   - 使用 shadcn/ui Badge 和 Separator 组件
   - 移除 Card 相关组件引用

2. **修改 styles.css**
   - 新增流式布局样式类
   - 删除废弃的卡片化样式
   - 保持响应式设计

3. **验证视觉效果**
   - 启动应用检查首页渲染
   - 确认分隔线、徽章、间距符合设计
   - 测试响应式布局（窗口缩放）

4. **回归测试**
   - 运行现有单元测试确保功能不变
   - 检查数据绑定是否正常工作

---

## Files to Modify

| 文件 | 修改类型 |
|------|----------|
| `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx` | 重构组件结构 |
| `voice-app/apps/desktop/src/styles.css` | 新增/删除样式类 |

---

## Non-Goals

- 不修改其他面板（HistoryPanel, SettingsPanel, LogsPanel）- 本设计仅针对首页
- 不改变数据获取逻辑 - 仅视觉重构
- 不添加新功能 - 纯样式优化
- 不修改 Tailwind 配置或 shadcn/ui 组件定义