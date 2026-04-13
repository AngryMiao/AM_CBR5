# 语音识别胶囊组件重设计

## 当前组件分析

**文件位置**: `apps/desktop/src/features/runtime/OverlayWindow.tsx`

**当前问题**:
1. 视觉层次不够清晰 - 状态图标、波形、文字堆叠在一起
2. 动画效果简单 - 仅有基础的波形动画
3. 缺乏状态色彩区分 - 所有状态使用相同的视觉样式
4. 转录文字显示不够优雅 - 简单的 inline-flex 布局
5. 没有玻璃拟态效果 - 与 macOS/Apple 设计语言不一致

---

## 新设计方案

### 设计原则 (基于 DESIGN.md)

1. **Apple 设计语言** - 采用玻璃拟态、纯净色彩、精致排版
2. **状态清晰可辨** - 每个状态都有独特的视觉标识
3. **动效流畅自然** - 使用流畅的过渡动画和微交互
4. **信息层次分明** - 主要状态、次要信息、辅助文字层次分明

---

### 视觉设计

#### 1. 胶囊容器 (Voice Capsule Container)

```
┌─────────────────────────────────────────────────────────┐
│  ╭──────────────────────────────────────────────────╮   │
│  │  🔴  ┃┃┃┃┃  正在聆听...  "今天天气真不错"       │   │
│  │  ↑   波形    状态文字    转录预览 (可选)          │   │
│  ╰──────────────────────────────────────────────────╯   │
│         ↑ 玻璃拟态胶囊容器                               │
└─────────────────────────────────────────────────────────┘
```

**样式规范**:
- **背景**: `rgba(0, 0 0, 0.75)` + `backdrop-filter: saturate(180%) blur(20px)`
- **边框**: `1px solid rgba(255, 255, 255, 0.1)`
- **圆角**: `980px` (Apple pill 形状)
- **阴影**: `0 8px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.2)`
- **内边距**: `12px 20px`

#### 2. 状态指示器 (Status Indicator)

不同状态使用不同色彩和动画：

| 状态 | 颜色 | 动画 | 图标 |
|------|------|------|------|
| listening (聆听) | `#34C759` (绿) | 脉冲呼吸动画 | ● |
| processing (识别) | `#0071E3` (蓝) | 旋转加载 | ⟳ |
| thinking (生成) | `#AF52DE` (紫) | 闪烁动画 | ✦ |
| executing (执行) | `#FF9500` (橙) | 进度条 | ⌘ |
| done (完成) | `#34C759` (绿) | 勾选动画 | ✓ |
| error (错误) | `#FF3B30` (红) | 抖动动画 | ! |
| idle (待命) | `#8E8E93` (灰) | 无 | ○ |

#### 3. 波形动画 (Voice Waveform)

```
当前: 简单的 5 条柱状图
新设计: 更细腻的音频波形

  ╱╲    ╱╲╱╲      ╱╲
 ╱  ╲  ╱    ╲    ╱  ╲╱╲
╱    ╲╱      ╲  ╱      ╲

特点:
- 24 条细线组成波形
- 每条线独立动画，形成波浪效果
- 颜色渐变: 左->右 从透明到高亮
- 高度根据音量动态变化
```

**动画参数**:
- 持续时间: `1.2s`
- 缓动函数: `cubic-bezier(0.4, 0, 0.2, 1)`
- 交错延迟: 每条线延迟 `0.05s`

#### 4. 状态文字 (Status Text)

```
字体: SF Pro Text
大小: 14px
字重: 500 (中等)
颜色: rgba(255, 255, 255, 0.9)
字间距: -0.01em
```

**状态文字内容**:
- listening → "正在聆听"
- processing → "正在识别"
- thinking → "正在生成"
- executing → "正在执行"
- inserting → "正在输入"
- done → "已完成"
- error → "识别失败"
- idle → "待命中"

#### 5. 转录预览 (Transcription Preview)

仅在 `input_mode === 'transcription'` 时显示：

```
样式:
- 字体: SF Pro Text
- 大小: 13px
- 颜色: rgba(255, 255, 255, 0.7)
- 最大宽度: 280px
- 截断: 末尾显示 "..."
- 过渡: 文字更新时淡入淡出
```

---

### 组件结构

```tsx
<VoiceCapsule>
  <CapsuleContainer>
    <StatusIndicator tone={phaseTone} />
    <Waveform active={isListening} />
    <StatusText>{phaseLabel}</StatusText>
    {showTranscript && <TranscriptPreview text={previewText} />}
  </CapsuleContainer>
</VoiceCapsule>
```

---

### 使用的 shadcn/ui 组件

1. **Badge** - 用于状态标签（可选的紧凑模式）
2. **Tooltip** - 鼠标悬停显示完整转录文字
3. **AnimatePresence** (Framer Motion) - 组件进出场动画

---

### 动画规格

#### 1. 容器进入动画

```css
@keyframes capsule-enter {
  0% {
    opacity: 0;
    transform: scale(0.9) translateY(10px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* 持续时间: 0.3s */
/* 缓动: cubic-bezier(0.4, 0, 0.2, 1) */
```

#### 2. 状态切换动画

```css
/* 状态指示器颜色过渡 */
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

/* 状态文字淡入淡出 */
@keyframes text-fade {
  0% { opacity: 0; transform: translateY(4px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

#### 3. 波形动画

```css
@keyframes wave-bar {
  0%, 100% {
    transform: scaleY(0.3);
    opacity: 0.4;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}

/* 每条线交错延迟 */
animation-delay: calc(var(--index) * 0.05s);
```

#### 4. 脉冲动画 (listening 状态)

```css
@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.4);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(52, 199, 89, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(52, 199, 89, 0);
  }
}

/* 持续时间: 1.5s */
/* 循环: infinite */
```

---

### 响应式行为

| 屏幕宽度 | 布局调整 |
|---------|---------|
| >= 640px | 完整布局：图标 + 波形 + 文字 + 预览 |
| < 640px | 紧凑布局：图标 + 文字（波形简化为3条线） |
| < 380px | 最小布局：仅图标 + 文字 |

---

### 无障碍设计

1. **ARIA 标签**: `aria-live="polite"` 确保状态变化被朗读
2. **高对比度**: 确保文字与背景对比度 >= 4.5:1
3. **减少动效**: `@media (prefers-reduced-motion)` 简化动画
4. **键盘导航**: 支持焦点状态显示

---

### 实现文件结构

```
apps/desktop/src/features/runtime/
├── OverlayWindow.tsx          # 主组件（更新）
├── VoiceCapsule.tsx         # 新：胶囊容器组件
├── StatusIndicator.tsx      # 新：状态指示器
├── VoiceWaveform.tsx        # 新：波形动画
└── hooks/
    └── useVoiceAnimation.ts # 新：动画状态管理
```

---

### 颜色代码速查

```css
/* Apple 系统颜色 */
--apple-green: #34C759;
--apple-blue: #0071E3;
--apple-purple: #AF52DE;
--apple-orange: #FF9500;
--apple-red: #FF3B30;
--apple-gray: #8E8E93;
--apple-white: #FFFFFF;

/* 胶囊背景 */
--capsule-bg: rgba(0, 0, 0, 0.75);
--capsule-border: rgba(255, 255, 255, 0.1);

/* 文字颜色 */
--text-primary: rgba(255, 255, 255, 0.9);
--text-secondary: rgba(255, 255, 255, 0.7);
```

---

### 设计预览

#### 状态对比

**Before (当前)**:
```
┌────────────────────┐
│ ●  ┃┃┃  正在聆听   │
└────────────────────┘
简单黑底白字，5条波形线
```

**After (新设计)**:
```
┌────────────────────────────────┐
│  ╭──────────────────────────╮  │
│  │ 🔴  〰〰〰  正在聆听... │  │
│  │ ↑   细腻波形  状态文字    │  │
│  ╰──────────────────────────╯  │
│     ↑ 玻璃拟态 + 精致动效      │
└────────────────────────────────┘
```

---

## 下一步

1. 确认设计方案
2. 创建组件实现计划
3. 开发新组件
4. 集成测试
