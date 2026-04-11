---
name: voice-app-pages-redesign
description: 设置、历史、日志页面的科技简约风格重设计方案
type: project
---

# Voice-App 页面重设计

**日期**: 2026-04-11  
**目标**: 对设置、历史、日志三个页面进行科技简约风格重设计，基于 shadcn/ui 和 Tailwind CSS

## 设计决策

### 视觉风格
- **A+B 组合**：极简扁平 + 科技玻璃感
- 去除厚重卡片边框，使用分割线替代
- 保留微妙玻璃质感背景（rgba + backdrop-filter）
- 主色调点缀（cyan/blue via CSS variable `--primary`）

### 页面布局
| 页面 | 布局方式 |
|------|----------|
| 设置 | 保留 Tabs，简化为胶囊式切换器 |
| 历史 | Flow 单栏布局 |
| 日志 | Flow 单栏布局 |

### 标题样式
- **极简标题行**：标题 + 数量徽章（已取消数量显示）
- 不使用 Eyebrow 标签，不使用图标+描述组合

### 状态标签
- 不显示数量统计（已确认）
- **历史页面**：使用状态圆点（8px 小圆点），绿色表示成功、红色表示失败，颜色区分状态
- **日志页面**：使用 INFO/ERROR 文字级别标签（带背景色的小徽章）

---

## 组件使用参考

### 已有 shadcn/ui 组件
项目已安装以下组件：
- `Badge` - 支持 default/secondary/destructive/outline 变体
- `Button` - 支持 default/outline/ghost/destructive 变体
- `Input` - 基础输入框
- `Textarea` - 多行输入
- `Switch` - 开关切换
- `Separator` - 分割线
- `Select` - 下拉选择器
- `Tabs` - 标签页（需简化样式）
- `ScrollArea` - 滚动区域

### 无需扩展组件
状态标签采用极简符号方案，直接使用 Tailwind CSS 类，无需扩展 Badge 组件的 success 变体。

现有 Badge 组件变体足够用于其他场景（如 MCP 服务状态等）。

### Lucide React 图标（已使用）
- `History`, `Search`, `RefreshCw`, `Eye`, `CheckCircle2`, `XCircle`, `Clock`
- `FileText`, `Download`, `Trash2`, `Info`, `AlertCircle`
- `Save`, `RotateCcw`, `AlertTriangle`, `Settings`, `Keyboard`, `Mic`, `Brain`, `Server`

---

## 页面设计规范

### 1. 设置页面（SettingsPanel）

**保留 Tabs 布局，简化样式：**

```tsx
// Tabs 简化为胶囊式
<TabsList className="settings-tabs-pill">
  <TabsTrigger value="general">通用</TabsTrigger>
  ...
</TabsList>

// CSS 简化
.settings-tabs-pill {
  display: flex;
  gap: 8px;
  padding: 4px 0;
  background: transparent;
  border: none;
}

.settings-tabs-pill [data-state="active"] {
  background: rgba(255,255,255,0.95);
  border: 1px solid hsl(var(--primary));
  color: hsl(var(--primary));
  border-radius: 6px;
}
```

**内容区域 Flow Layout：**

```tsx
// 开关项
<div className="settings-toggle-row">
  <span className="settings-label">保存历史记录</span>
  <Switch checked={draft.history_enabled} />
</div>

// 字段项
<div className="settings-field-block">
  <label className="settings-field-title">默认热键</label>
  <Input value={draft.default_hotkey} />
</div>
```

### 2. 历史页面（HistoryPanel）

**极简标题行：**

```tsx
<header className="page-header-minimal">
  <h3>历史记录</h3>
</header>
```

**筛选栏（无数量统计）：**

```tsx
<div className="filter-bar-inline">
  <div className="search-input-minimal">
    <Search className="h-4 w-4" />
    <Input placeholder="搜索..." />
  </div>
  <Select>...</Select>
</div>
```

**列表项（状态圆点）：**

```tsx
<div className="history-item">
  <div className="item-head">
    <span className="status-dot success" />
    <span className="item-id">#123</span>
    <span className="item-time">14:32</span>
  </div>
  <div className="item-body">
    <div className="item-section">
      <span className="item-label">识别文本</span>
      <p className="item-text">...</p>
    </div>
  </div>
  <div className="item-actions">
    <Button variant="outline" size="sm">预览</Button>
    <Button variant="outline" size="sm">重试</Button>
  </div>
</div>

<div className="history-item history-item-error">
  <div className="item-head">
    <span className="status-dot error" />
    <span className="item-id">#122</span>
    <span className="item-time">14:28</span>
  </div>
</div>
```

### 3. 日志页面（LogsPanel）

**极简标题行：**

```tsx
<header className="page-header-minimal">
  <h3>运行日志</h3>
</header>
```

**筛选栏 + 操作按钮：**

```tsx
<div className="filter-bar-inline">
  <div className="search-input-minimal">...</div>
  <Select>...</Select>
  <div className="action-buttons">
    <Button variant="outline" size="sm">
      <Download className="h-4 w-4" />
      导出
    </Button>
    <Button variant="outline" size="sm" className="text-destructive">
      <Trash2 className="h-4 w-4" />
      清空
    </Button>
  </div>
</div>
```

**日志条目（INFO/ERROR 标签）：**

```tsx
<div className={`log-item ${entry.level === 'error' ? 'log-item-error' : ''}`}>
  <span className={`log-level ${entry.level}`}>
    {entry.level === 'error' ? 'ERROR' : 'INFO'}
  </span>
  <span className="log-time">14:32:05</span>
  <p className="log-text">{entry.message}</p>
</div>
```

---

## CSS 新增类（styles.css）

```css
/* 极简标题 */
.page-header-minimal {
  display: flex;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(203, 213, 225, 0.76);
}

.page-header-minimal h3 {
  font-size: 18px;
  font-weight: 600;
}

/* 简化 Tabs */
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
}

.settings-tabs-pill [data-state="active"] {
  background: rgba(255, 255, 255, 0.95);
  border-color: hsl(var(--primary));
  color: hsl(var(--primary));
}

/* 筛选栏 */
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

/* 历史列表项 */
.history-item {
  padding: 16px 0;
  border-bottom: 1px solid rgba(241, 245, 249, 1);
}

.history-item-error {
  border-left: 2px solid rgba(248, 113, 113, 0.68);
  padding-left: 12px;
  background: rgba(254, 242, 242, 0.3);
}

.item-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.item-id { font-size: 13px; font-weight: 600; }
.item-time { font-size: 12px; color: #94a3b8; }

.item-label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  letter-spacing: 0.05em;
}

.item-text {
  font-size: 14px;
  color: #1e293b;
  margin-top: 4px;
}

/* 状态圆点 */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.success { background: #10b981; }
.status-dot.error { background: #ef4444; }

/* 日志条目 */
.log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(241, 245, 249, 1);
}

.log-item-error {
  border-left: 2px solid rgba(248, 113, 113, 0.68);
  padding-left: 12px;
  background: rgba(254, 242, 242, 0.4);
}

.log-level {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
}

.log-level.info {
  background: rgba(241, 245, 249, 0.9);
  color: #64748b;
}

.log-level.error {
  background: rgba(254, 226, 226, 0.8);
  color: #b91c1c;
}

.log-time {
  font-size: 12px;
  color: #94a3b8;
  font-family: monospace;
}

.log-text {
  font-size: 13px;
  color: #334155;
}

/* 操作按钮组 */
.action-buttons {
  display: flex;
  gap: 8px;
}
```

---

## 测试影响

需要更新的测试文件：
- `src/__tests__/app-shell.test.tsx` - 验证页面结构变化
- 可能需要调整搜索组件的角色/标签查找

---

## 参考页面

RuntimeStatus 组件已采用 Flow Layout 风格，可作为设计参考：
- 使用 `runtime-header`、`runtime-section-new`、`runtime-detail-row-new` 等 CSS 类
- Badge 变体搭配合理
- 分割线使用 Separator 组件