# 默认麦克风选择设计

## 背景

当前语音设置页已经支持：

- 语音开关
- 工作模式
- ASR / TTS 提供商配置
- 语音快捷键
- 键盘控制驱动与键盘快捷键映射

但录音输入源仍然完全依赖浏览器 / 系统当前默认麦克风，没有给用户显式指定“默认麦克风”的能力。

现状对应的问题是：

1. 用户有多个输入设备时，无法稳定锁定某一个麦克风
2. 系统默认输入设备变化后，语音功能会跟着变化，行为不可预期
3. 设置页缺少“输入设备”层面的可见配置，和语音控制场景不匹配

## 用户确认的目标

本轮只增加“默认麦克风”选择能力，不扩大到整套音频设备管理。用户已确认目标如下：

1. 在语音设置页增加“默认麦克风”下拉选择
2. 下拉中列出系统当前可用的输入设备
3. 用户选择后，后续语音录音默认使用该设备
4. 如果用户不选，继续使用系统默认麦克风
5. 该设置需要持久化，刷新页面后仍然生效

## 非目标

本轮不包含以下内容：

1. 不增加扬声器 / 输出设备选择
2. 不增加设备音量测试、波形预览、噪声门限校准
3. 不引入主进程统一音频设备管理
4. 不处理系统级热插拔监听与自动切换策略
5. 不修改当前 ASR / TTS 提供商配置模型

## 当前代码观察

### 1. 录音器当前不支持指定设备

`src/renderer/packages/voice/recorder.ts`

- `VoiceRecorder.start()` 内部直接调用：

```ts
navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
})
```

- 目前没有：
  - `deviceId`
  - 设备枚举
  - 指定设备失败后的回退逻辑

### 2. 语音设置模型当前没有麦克风字段

`src/shared/types/voice.ts`

- `VoiceSettingsSchema` 里已有：
  - `enabled`
  - `workMode`
  - `asrProvider`
  - `ttsProvider`
  - `shortcuts`
  - `keyboardDriverPath`
  - `keyboardShortcuts`
- 但还没有任何与输入设备相关的持久化字段

### 3. 设置页已有合适的承载位置

`src/renderer/routes/settings/voice.tsx`

- 当前页面已经承担语音控制的主配置入口
- “默认麦克风”天然属于语音输入源设置，适合放在：
  - “启用语音控制 / 工作模式”之后
  - “ASR 提供商”之前

这样用户先选“用哪个麦克风采集”，再配“采集后的识别服务”

## 已评估方案

### 方案 1：推荐方案

在 renderer 侧增加设备枚举与下拉选择，持久化 `microphoneDeviceId` 到 `voice` 设置，录音时把该 `deviceId` 透传给 `VoiceRecorder.start()`

优点：

- 改动最小，直接贴合现有设置页结构
- 不需要增加新的主进程 IPC
- 行为直观，符合“默认麦克风”这一用户心智
- 后续若要扩展输出设备选择，也能沿用相同模式

缺点：

- 在设备权限未授予前，`enumerateDevices()` 可能拿不到友好标签
- 需要在 renderer 中补一点设备状态管理

### 方案 2：主进程统一设备管理

由 Electron 主进程统一获取、缓存、监听音频输入设备列表，再暴露给 renderer

优点：

- 未来更容易做热插拔监听
- 桌面端控制能力更强

缺点：

- 对当前需求明显偏重
- 会额外引入主进程桥接、状态同步和更多测试面

### 方案 3：不持久化，只在录音前临时选设备

优点：

- 实现最快

缺点：

- 不符合“默认麦克风”的需求
- 会打断语音输入流程
- 用户体验差

## 结论

采用方案 1。

即：

1. 在 `voice` 设置里新增可选字段 `microphoneDeviceId`
2. 在语音设置页新增“默认麦克风”下拉选择
3. 录音时把该字段透传给 `VoiceRecorder.start()`
4. 若指定设备不可用，自动回退到系统默认麦克风

## 设计总览

### 设计原则

1. 用户不配置时，行为必须与当前版本一致
2. 指定设备不可用时，优先保证语音功能可用，而不是直接硬失败
3. 设备选择是“输入源配置”，不和 ASR 提供商配置耦合
4. 保持当前设置页“即时保存”的交互风格，不增加额外保存按钮

## 数据模型

### 新增字段

在 `src/shared/types/voice.ts` 的 `VoiceSettingsSchema` 中新增：

```ts
microphoneDeviceId: z.string().optional()
```

语义约定：

- `undefined` / 空值：使用系统默认麦克风
- 非空字符串：使用该设备 ID 对应的输入设备

### 默认值

在默认语音设置中不主动写具体设备 ID：

```ts
microphoneDeviceId: undefined
```

这样可以保持当前所有用户的默认行为不变。

## 设置页设计

### 位置

在 `src/renderer/routes/settings/voice.tsx` 中，将“默认麦克风”区块放在：

1. “启用语音控制”
2. “工作模式”
3. “默认麦克风”
4. “ASR 提供商”

### UI 结构

区块包含：

1. 标签：`默认麦克风`
2. 描述文案：说明未选择时将跟随系统默认设备
3. 下拉框
4. 刷新设备列表按钮
5. 必要时的轻量错误 / 提示文案

### 下拉选项

固定第一项：

- `系统默认麦克风`

后续选项来自：

```ts
navigator.mediaDevices.enumerateDevices()
  .filter((device) => device.kind === 'audioinput')
```

每项展示：

- `device.label`，如果可用
- 若 label 为空，则降级为 `麦克风 1 / 麦克风 2 ...`

### 设备不可用时的展示

如果当前保存的 `microphoneDeviceId` 不在设备列表中：

1. 下拉框中补一个只读占位项，例如：`已保存设备不可用`
2. 用户可以切回“系统默认麦克风”或重新选择其他设备

这样可以避免“值丢失但用户不知道为什么”的状态。

## 录音链路设计

### VoiceRecorder.start 签名扩展

在 `src/renderer/packages/voice/recorder.ts` 中把 `start()` 扩展为：

```ts
async start(options?: {
  microphoneDeviceId?: string
  onAudioLevelChange?: (level: number) => void
  onSilenceDetected?: () => void
  silenceThreshold?: number
  silenceDuration?: number
}): Promise<void>
```

### getUserMedia 约束

如果未指定设备：

```ts
audio: {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}
```

如果指定了设备：

```ts
audio: {
  deviceId: { exact: microphoneDeviceId },
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
}
```

### 录音入口透传

在 `src/renderer/hooks/useVoiceController.ts` 启动录音时，把：

```ts
settings.microphoneDeviceId
```

透传给 `VoiceRecorder.start(...)`。

## 回退与异常处理

### 设备失效回退

如果用户保存的设备不存在，或者 `getUserMedia` 因指定 `deviceId` 失败，按以下顺序处理：

1. 先尝试用户指定设备
2. 若抛出 `NotFoundError` 或 `OverconstrainedError`
3. 自动改用“系统默认麦克风”再试一次
4. 若回退成功，则继续本轮录音
5. 同时给出轻量提示，例如：
   - `已选麦克风不可用，已回退到系统默认设备`

### 权限未授予

若设备标签拿不到或设备列表为空：

1. 设置页仍显示“系统默认麦克风”
2. 下方显示轻提示，例如：
   - `未检测到可枚举的输入设备，请先授权麦克风权限`

不因为枚举失败而阻断当前页面打开。

## 状态与生命周期

### 页面进入时

语音设置页加载后：

1. 调用 `enumerateDevices()` 获取当前输入设备列表
2. 过滤 `audioinput`
3. 写入页面本地状态

### 用户点击刷新时

再次执行设备枚举，覆盖本地设备列表。

### 保存策略

沿用当前设置页的即时保存策略：

- 用户一旦切换下拉值，立即写入 `voice.microphoneDeviceId`
- 不增加“应用 / 保存”按钮

## 文件边界建议

### 需要修改

- `src/shared/types/voice.ts`
  - 新增 `microphoneDeviceId`
- `src/shared/defaults.ts`
  - 增加默认值
- `src/renderer/routes/settings/voice.tsx`
  - 增加默认麦克风选择 UI
  - 管理设备枚举列表与刷新逻辑
- `src/renderer/packages/voice/recorder.ts`
  - 支持按 `deviceId` 录音
  - 增加失效设备回退逻辑
- `src/renderer/hooks/useVoiceController.ts`
  - 透传 `settings.microphoneDeviceId`

### 不需要新增主进程文件

本轮不建议新增 main / preload / electron IPC 相关文件。

## 测试计划

### 单元 / 定向验证

#### Recorder

补充 `VoiceRecorder` 相关测试，至少覆盖：

1. 未指定 `microphoneDeviceId` 时，使用当前默认 `audio` 约束
2. 指定 `microphoneDeviceId` 时，`getUserMedia` 收到 `deviceId.exact`
3. 指定设备失败时，会自动回退到系统默认麦克风

#### 设置页

补充或新增语音设置页测试，至少覆盖：

1. 设备列表能正确渲染 `audioinput`
2. 选择设备后，`setSettings` 收到对应 `microphoneDeviceId`
3. 当前设备失效时，页面能显示“已保存设备不可用”占位状态

### 手工验证

至少验证以下场景：

1. 不选择设备时，语音录音仍能正常工作
2. 选择 USB 麦克风后，录音确实从该设备采集
3. 刷新页面后，选择结果仍然保留
4. 拔掉已选麦克风后，再次录音会自动回退到系统默认设备
5. 设备列表在点击“刷新设备列表”后会更新

## 风险与控制

### 风险 1：权限未授予时设备列表没有标签

控制：

- 下拉框允许显示无标签设备的降级名称
- 通过轻提示告知用户需要授权麦克风权限

### 风险 2：用户保存了已经失效的设备 ID

控制：

- 录音时自动回退到系统默认麦克风
- 设置页显式展示“已保存设备不可用”

### 风险 3：把输入设备逻辑和 ASR 配置耦合

控制：

- `microphoneDeviceId` 保持在 `voice` 顶层设置
- 不写进任何单个 ASR 提供商配置对象

## 推荐实施顺序

1. 先扩展 `VoiceSettings` 模型与默认值
2. 再扩展 `VoiceRecorder.start()` 的 `deviceId` 支持和回退逻辑
3. 再把 `useVoiceController` 录音入口接上
4. 最后补设置页设备枚举与下拉 UI
5. 运行定向测试与手工验证
