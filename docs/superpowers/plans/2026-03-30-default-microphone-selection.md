# Default Microphone Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给语音设置页增加“默认麦克风”选择，并让录音链路优先使用用户指定的输入设备，设备失效时自动回退到系统默认麦克风。

**Architecture:** 保持当前 renderer 驱动的语音设置架构，不新增 main/preload IPC。设置模型新增 `voice.microphoneDeviceId` 持久化字段；录音器支持 `deviceId.exact` 约束与失败回退；设置页通过一个独立的 `DefaultMicrophoneSelect` 组件做设备枚举、刷新和“已保存设备不可用”展示，最后由 `useVoiceController` 把选中的设备透传给 `VoiceRecorder.start()`。

**Tech Stack:** TypeScript, React, TanStack Router, Vitest, React Testing Library, MediaDevices API, MediaRecorder API

---

## File Structure

- Modify: `src/shared/types/voice.ts`
  - 为 `VoiceSettingsSchema` 增加 `microphoneDeviceId?: string`
- Modify: `src/shared/types/settings.ts`
  - 保持嵌套的 `voice` schema 与 `VoiceSettingsSchema` 对齐
- Modify: `src/shared/defaults.ts`
  - 给默认语音设置增加 `microphoneDeviceId: undefined`
- Modify: `src/renderer/packages/voice/recorder.ts`
  - 扩展 `VoiceRecorder.start()` 以支持 `microphoneDeviceId`
  - 增加指定设备失败时回退到系统默认麦克风
- Modify: `src/renderer/packages/voice/__tests__/recorder.test.ts`
  - 覆盖默认录音、指定设备录音、设备失效回退
- Create: `src/renderer/components/voice/DefaultMicrophoneSelect.tsx`
  - 独立封装设备枚举、刷新、不可用设备占位展示
- Create: `src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx`
  - 覆盖设备列表渲染、选择、不可用设备展示
- Modify: `src/renderer/routes/settings/voice.tsx`
  - 接入 `DefaultMicrophoneSelect`
  - 把值写入 `settings.microphoneDeviceId`
- Modify: `src/renderer/hooks/useVoiceController.ts`
  - 启动录音时把 `settings.microphoneDeviceId` 透传给 `VoiceRecorder.start()`

## Task 1: Extend Voice Settings Schema

**Files:**
- Modify: `src/shared/types/voice.ts`
- Modify: `src/shared/types/settings.ts`
- Modify: `src/shared/defaults.ts`

- [ ] **Step 1: Add the failing schema/default expectation in the recorder-facing tests**

在 `src/renderer/packages/voice/__tests__/recorder.test.ts` 旁边补一个最小断言，确保新字段存在默认空值，避免实现后漏改默认配置来源。

```ts
import { defaultVoiceSettings } from '@shared/defaults'

it('keeps microphoneDeviceId unset by default', () => {
  expect(defaultVoiceSettings().microphoneDeviceId).toBeUndefined()
})
```

- [ ] **Step 2: Run the targeted test to verify the expectation fails**

Run:

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts
```

Expected:

```text
FAIL with Property 'microphoneDeviceId' does not exist
```

- [ ] **Step 3: Add the minimal schema/default implementation**

在 `src/shared/types/voice.ts` 中新增：

```ts
microphoneDeviceId: z.string().optional(),
```

在 `src/shared/types/settings.ts` 的嵌套 `voice` schema 中同步新增：

```ts
microphoneDeviceId: z.string().optional(),
```

在 `src/shared/defaults.ts` 的 `defaultVoiceSettings()` 中补：

```ts
microphoneDeviceId: undefined,
```

- [ ] **Step 4: Re-run the targeted test**

Run:

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts
```

Expected:

```text
PASS the default microphoneDeviceId expectation
```

- [ ] **Step 5: Commit the schema/default slice**

```bash
git add src/shared/types/voice.ts src/shared/types/settings.ts src/shared/defaults.ts src/renderer/packages/voice/__tests__/recorder.test.ts
git commit -m "feat(voice): 增加默认麦克风设置字段"
```

## Task 2: Add Recorder Device Selection and Fallback

**Files:**
- Modify: `src/renderer/packages/voice/recorder.ts`
- Modify: `src/renderer/packages/voice/__tests__/recorder.test.ts`

- [ ] **Step 1: Write failing recorder tests for selected device and fallback**

在 `src/renderer/packages/voice/__tests__/recorder.test.ts` 增加两个测试：

```ts
it('passes deviceId.exact when microphoneDeviceId is provided', async () => {
  await recorder.start({ microphoneDeviceId: 'mic-usb-1' })

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
    audio: {
      deviceId: { exact: 'mic-usb-1' },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
})

it('falls back to the system default microphone when the saved device is unavailable', async () => {
  vi.mocked(navigator.mediaDevices.getUserMedia)
    .mockRejectedValueOnce(Object.assign(new Error('missing device'), { name: 'NotFoundError' }))
    .mockResolvedValueOnce(mockMediaStream)

  await recorder.start({ microphoneDeviceId: 'missing-mic' })

  expect(navigator.mediaDevices.getUserMedia).toHaveBeenNthCalledWith(1, {
    audio: {
      deviceId: { exact: 'missing-mic' },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenNthCalledWith(2, {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  })
})
```

- [ ] **Step 2: Run recorder tests to verify they fail**

Run:

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts
```

Expected:

```text
FAIL because VoiceRecorder.start() ignores microphoneDeviceId and does not retry
```

- [ ] **Step 3: Implement recorder device selection and fallback**

在 `src/renderer/packages/voice/recorder.ts`：

1. 扩展 `start()` 选项：

```ts
async start(options?: {
  microphoneDeviceId?: string
  onAudioLevelChange?: (level: number) => void
  onSilenceDetected?: () => void
  silenceThreshold?: number
  silenceDuration?: number
}): Promise<void>
```

2. 抽一个小的约束构造逻辑，避免在 `try/catch` 里复制对象：

```ts
const buildAudioConstraints = (microphoneDeviceId?: string) => ({
  audio: {
    ...(microphoneDeviceId ? { deviceId: { exact: microphoneDeviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
})
```

3. 先尝试指定设备；若错误名是 `NotFoundError` 或 `OverconstrainedError`，再重试一次系统默认设备：

```ts
try {
  this.stream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints(options?.microphoneDeviceId))
} catch (error) {
  const shouldFallback =
    options?.microphoneDeviceId &&
    (error instanceof DOMException
      ? error.name === 'NotFoundError' || error.name === 'OverconstrainedError'
      : typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        ((error as { name?: string }).name === 'NotFoundError' ||
          (error as { name?: string }).name === 'OverconstrainedError'))

  if (shouldFallback) {
    this.stream = await navigator.mediaDevices.getUserMedia(buildAudioConstraints())
  } else {
    throw error
  }
}
```

- [ ] **Step 4: Run recorder tests again**

Run:

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts
```

Expected:

```text
PASS with the original start-recording test plus the two new microphone selection tests
```

- [ ] **Step 5: Commit the recorder slice**

```bash
git add src/renderer/packages/voice/recorder.ts src/renderer/packages/voice/__tests__/recorder.test.ts
git commit -m "feat(voice): 支持指定默认麦克风录音"
```

## Task 3: Build the Default Microphone Selector UI

**Files:**
- Create: `src/renderer/components/voice/DefaultMicrophoneSelect.tsx`
- Create: `src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx`

- [ ] **Step 1: Write failing UI tests for device enumeration and selection**

创建 `src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx`，使用 React Testing Library 覆盖：

```ts
it('renders the system default option plus audioinput devices', async () => {
  vi.spyOn(navigator.mediaDevices, 'enumerateDevices').mockResolvedValue([
    { kind: 'audioinput', deviceId: 'mic-1', label: 'USB Mic' } as MediaDeviceInfo,
    { kind: 'videoinput', deviceId: 'cam-1', label: 'Webcam' } as MediaDeviceInfo,
  ])

  render(<DefaultMicrophoneSelect value={undefined} onChange={onChange} />)

  expect(await screen.findByRole('option', { name: '系统默认麦克风' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'USB Mic' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Webcam' })).not.toBeInTheDocument()
})

it('shows an unavailable placeholder when the saved device is missing', async () => {
  vi.spyOn(navigator.mediaDevices, 'enumerateDevices').mockResolvedValue([])

  render(<DefaultMicrophoneSelect value="missing-mic" onChange={onChange} />)

  expect(await screen.findByRole('option', { name: '已保存设备不可用' })).toBeInTheDocument()
})

it('calls onChange with the selected microphone device id', async () => {
  vi.spyOn(navigator.mediaDevices, 'enumerateDevices').mockResolvedValue([
    { kind: 'audioinput', deviceId: 'mic-2', label: 'Desk Mic' } as MediaDeviceInfo,
  ])

  render(<DefaultMicrophoneSelect value={undefined} onChange={onChange} />)

  await user.selectOptions(screen.getByRole('combobox'), 'mic-2')
  expect(onChange).toHaveBeenCalledWith('mic-2')
})
```

- [ ] **Step 2: Run the component test to verify it fails**

Run:

```bash
pnpm exec vitest run src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx
```

Expected:

```text
FAIL because the component does not exist yet
```

- [ ] **Step 3: Implement the standalone selector component**

创建 `src/renderer/components/voice/DefaultMicrophoneSelect.tsx`，职责保持单一：

```tsx
type DefaultMicrophoneSelectProps = {
  value?: string
  onChange: (deviceId?: string) => void
}
```

组件内部实现：

1. `useEffect` 中调用 `navigator.mediaDevices.enumerateDevices()`
2. 过滤 `kind === 'audioinput'`
3. 把空标签降级为 `麦克风 ${index + 1}`
4. 始终渲染系统默认项：

```tsx
<option value="">{t('系统默认麦克风')}</option>
```

5. 当 `value` 不在列表中时，追加：

```tsx
<option value={value}>{t('已保存设备不可用')}</option>
```

6. 增加刷新按钮：

```tsx
<button onClick={() => void loadDevices()}>{t('刷新设备列表')}</button>
```

- [ ] **Step 4: Run the component test**

Run:

```bash
pnpm exec vitest run src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx
```

Expected:

```text
PASS all selector tests
```

- [ ] **Step 5: Commit the selector slice**

```bash
git add src/renderer/components/voice/DefaultMicrophoneSelect.tsx src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx
git commit -m "feat(voice): 增加默认麦克风选择组件"
```

## Task 4: Wire Settings Page and Voice Controller

**Files:**
- Modify: `src/renderer/routes/settings/voice.tsx`
- Modify: `src/renderer/hooks/useVoiceController.ts`
- Test: `src/renderer/packages/voice/__tests__/recorder.test.ts`
- Test: `src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx`

- [ ] **Step 1: Add a small failing integration expectation**

在已有测试基础上补一个最小集成验证，确认 `VoiceRecorder.start()` 会收到设置里的设备 ID。最简单的做法是在 `useVoiceController` 的定向测试中 mock `VoiceRecorder`，如果当前仓库没有现成测试文件，则先加一个轻量测试文件：

Create if needed: `src/renderer/hooks/useVoiceController.microphone.test.tsx`

```ts
it('passes settings.microphoneDeviceId into VoiceRecorder.start', async () => {
  // mock useVoiceSettings() => { settings: { microphoneDeviceId: 'mic-1', ... } }
  // trigger startRecording()
  expect(mockRecorder.start).toHaveBeenCalledWith(
    expect.objectContaining({ microphoneDeviceId: 'mic-1' })
  )
})
```

- [ ] **Step 2: Run the targeted integration test to verify it fails**

Run:

```bash
pnpm exec vitest run src/renderer/hooks/useVoiceController.microphone.test.tsx
```

Expected:

```text
FAIL because useVoiceController does not pass microphoneDeviceId yet
```

- [ ] **Step 3: Implement the minimal integration**

在 `src/renderer/routes/settings/voice.tsx` 中接入新组件，位置放在“工作模式”后、“ASR 提供商”前：

```tsx
<DefaultMicrophoneSelect
  value={settings.microphoneDeviceId}
  onChange={(microphoneDeviceId) => setSettings({ ...settings, microphoneDeviceId })}
/>
```

在 `src/renderer/hooks/useVoiceController.ts` 的 `startRecording()` 中，把 `settings.microphoneDeviceId` 透传：

```ts
await recorder.start({
  microphoneDeviceId: settings.microphoneDeviceId,
  onAudioLevelChange: (level) => setAudioLevel(level),
  onSilenceDetected: settings.autoStopRecording ? () => { void stopRecording() } : undefined,
  silenceThreshold: settings.silenceThreshold,
  silenceDuration: settings.silenceDuration,
})
```

注意：

- 仅增加透传，不改当前 Typeless / 长按热键状态机语义
- 避免继续把 `voice.tsx` 内联逻辑堆大，保持组件职责清晰

- [ ] **Step 4: Run targeted tests and one focused static check**

Run:

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx src/renderer/hooks/useVoiceController.microphone.test.tsx
```

Expected:

```text
PASS all microphone-selection related tests
```

Run:

```bash
pnpm exec biome check src/renderer/components/voice/DefaultMicrophoneSelect.tsx src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx src/renderer/routes/settings/voice.tsx src/renderer/hooks/useVoiceController.ts src/renderer/packages/voice/recorder.ts src/shared/types/voice.ts src/shared/types/settings.ts src/shared/defaults.ts
```

Expected:

```text
Checked N files. No errors.
```

- [ ] **Step 5: Commit the integration slice**

```bash
git add src/renderer/routes/settings/voice.tsx src/renderer/hooks/useVoiceController.ts src/renderer/hooks/useVoiceController.microphone.test.tsx
git commit -m "feat(voice): 接入默认麦克风选择"
```

## Final Verification

- [ ] **Step 1: Run the full targeted verification bundle**

```bash
pnpm exec vitest run src/renderer/packages/voice/__tests__/recorder.test.ts src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx src/renderer/hooks/useVoiceController.microphone.test.tsx
```

Expected:

```text
PASS
```

- [ ] **Step 2: Manual smoke test in the app**

1. 打开语音设置页，确认能看到“默认麦克风”
2. 设备列表包含“系统默认麦克风”和当前 `audioinput`
3. 选择某个 USB 麦克风后刷新页面，选择结果仍在
4. 触发语音录音，确认从该设备采集
5. 拔掉已选设备后再次录音，确认能回退到系统默认麦克风
6. 点击“刷新设备列表”，确认设备列表更新

- [ ] **Step 3: Final commit**

```bash
git add src/shared/types/voice.ts src/shared/types/settings.ts src/shared/defaults.ts src/renderer/packages/voice/recorder.ts src/renderer/packages/voice/__tests__/recorder.test.ts src/renderer/components/voice/DefaultMicrophoneSelect.tsx src/renderer/components/voice/DefaultMicrophoneSelect.test.tsx src/renderer/routes/settings/voice.tsx src/renderer/hooks/useVoiceController.ts src/renderer/hooks/useVoiceController.microphone.test.tsx
git commit -m "feat(voice): 增加默认麦克风选择"
```
