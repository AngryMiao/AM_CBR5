# Voice App 主窗口主体重构设计

## 背景

`voice-app/apps/desktop` 的客户端功能已经落地，主窗口当前仍保留一版偏深色、控制台感较强的样式。用户当前阶段的要求不是补功能，而是把主 app 主体页面重构到更接近 Typeless 参考图的桌面产品壳层，同时移除无意义描述。

本轮已经确认的视觉方向：

1. 首页 / 主壳层采用 `A`
2. 历史记录采用 `B`
3. 设置页采用 `C`

## 硬约束

1. 不修改识别胶囊和返回结果里面的任何代码
2. 不触碰 `voice-app/apps/desktop/src/features/runtime/OverlayWindow.tsx`
3. 不触碰 `voice-app/apps/desktop/src/features/runtime/ResultWindow.tsx`
4. 主窗口内已有业务逻辑、诊断数据、设置保存链路、历史操作链路保持不变
5. 测试中已依赖的关键文本尽量保持稳定

## 目标

本轮只解决主窗口主体观感与信息层级问题：

1. 重做主 app 的左侧导航和右侧内容壳层
2. 首页变成更像桌面产品首页的浅色 hero + 卡片布局
3. 历史记录改成列表优先、筛选更轻的工作流界面
4. 设置页改成主窗口内居中的大面板体验
5. 日志页跟随新视觉系统统一

## 非目标

1. 不调整 overlay / result window 的结构、行为和视觉
2. 不改 runtime 行为、录音流程、历史记录能力或设置 schema
3. 不引入新的全局状态或新依赖

## 设计结论

### 1. 主壳层

采用浅色桌面应用壳层：

1. 页面背景使用暖白 + 柔和渐变，不再是深色控制台底
2. 左侧使用固定导航栏，强调产品级主窗口
3. 右侧使用白色主内容板，形成明确的信息舞台
4. 顶部保留当前面板的轻量上下文，不放无意义说明

### 2. 首页

首页保留现有诊断信息与操作按钮，但重排为：

1. 顶部 hero，明确主标题为 `自然说话，直接开始输入`
2. hero 右侧直接放当前阶段和主操作按钮
3. 中部先展示实时文本与任务结果
4. 下部再铺开平台、权限、MCP、Deep Link、AngryMiao 等诊断卡片
5. 详细运行时信息继续保留，但降为第二层信息

### 3. 历史记录

历史记录改为列表优先：

1. 顶部只保留必要的说明、数量和筛选
2. 列表项优先展示任务状态、完成时间、识别文本、结果、详情
3. 操作按钮维持 `预览` / `重新生成`

### 4. 设置页

设置页按 `C` 处理成主窗口内部的大面板：

1. 页面整体看起来像嵌入式 modal / center stage
2. 左侧分区导航保留
3. 右侧 stage 强化为表单舞台，不改任何字段逻辑
4. 警告、错误、保存状态继续保留，但改成新视觉语言

### 5. 日志页

日志页统一到新浅色系统：

1. 保留等级筛选、关键字筛选、导出、清空
2. 列表项改成浅色日志卡片
3. 信息 / 错误态用边框和色块区分

## 实现边界

本轮预计修改：

1. `voice-app/apps/desktop/src/App.tsx`
2. `voice-app/apps/desktop/src/features/runtime/RuntimeStatus.tsx`
3. `voice-app/apps/desktop/src/features/history/HistoryPanel.tsx`
4. `voice-app/apps/desktop/src/features/settings/SettingsPanel.tsx`
5. `voice-app/apps/desktop/src/features/logs/LogsPanel.tsx`
6. `voice-app/apps/desktop/src/styles.css`
7. `voice-app/apps/desktop/src/__tests__/app-shell.test.tsx`

## 验收标准

满足以下条件才算本轮完成：

1. 主窗口默认进入新的浅色主壳层
2. 首页出现 `自然说话，直接开始输入`
3. 历史记录、设置、日志都切到统一的新视觉系统
4. 识别胶囊和结果窗口代码未被改动
5. `pnpm --dir voice-app/apps/desktop test`
6. `pnpm --dir voice-app/apps/desktop build`
