---
name: voice-app-settings-panel-redesign
description: SettingsPanel 美化设计方案 - Glassmorphism 风格重构
type: project
---

# SettingsPanel 设计方案

## 概述

对 voice-app 桌面应用的设置页面进行结构重构，采用 Glassmorphism 风格，追求极致简洁。

**Why:** 当前设置页面存在多个视觉层级（sticky footer、多层边框、标题区），显得繁杂。用户要求科技简约方向，保留左右布局和录音识别胶囊不变。

**How to apply:** 重构 SettingsPanel React 组件，调整 CSS 样式，保持现有功能逻辑不变。

## 设计风格

- **风格:** Glassmorphism（玻璃态）
- **背景:** 浅色渐变 `#f6f8fb → #eef2f6`
- **卡片:** 半透明白色 + backdrop-filter blur(12px)
- **边框:** `rgba(203,213,225,0.72)` 半透明
- **强调色:** 青蓝色 `hsl(213, 91%, 49%)`

## 关键改动

### 1. Tabs → Pill 样式
- 圆角胶囊按钮（border-radius: 999px）
- 选中态：玻璃态背景 + 边框 + 阴影
- 未选中态：半透明背景，无边框

### 2. 移除 Sticky Footer
- 操作按钮移到卡片底部
- 简化布局层级
- 保存/重置按钮使用玻璃态样式

### 3. 内容区 → 玻璃态卡片
- 统一 Card 包裹各 tab 内容
- border-radius: 16px
- padding: 20px

### 4. 表单项 → 流式布局
- 移除 `.settings-pane-header` 标题区
- 开关项：直接展示，分隔线分隔
- 输入项：label 紧贴 input，减少间距

### 5. 分隔线 → 半透明
- `rgba(203,213,225,0.5)` 更柔和
- 细线 `height: 1px`

## 不修改的内容

- 录音识别胶囊（OverlayWindow）
- 结果返回卡片（ResultWindow）
- 现有功能逻辑（保存、重置、验证）
- 左右布局结构

## 涉及文件

- `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx` - React 组件重构
- `voice-app/apps/desktop/src/styles.css` - CSS 样式调整