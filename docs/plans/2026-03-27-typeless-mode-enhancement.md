# Typeless 模式增强实现计划

> **给 Claude：** 必须使用 superpowers:executing-plans 子技能逐任务执行本计划。

**目标：** 重构 Typeless 模式，支持自动判断三种子模式（语音输入、控制、对话），并实现流式识别、极简交互。

**架构：**
- ASR 识别完成后，先匹配 triggerWords（控制意图）
- 不匹配时，根据内容判断是语音输入还是对话意图
- Typeless 模式下不弹出主窗口，使用极简浮动组件
- Chat 意图显示极简内容结果窗口

**技术栈：** Electron IPC、ASR 流式识别、Jotai atoms、MCP Tools

---

## 概述

### 三种子模式（Typeless 模式下自动判断）

| 子模式 | 触发条件 | 行为 | 显示 |
|--------|---------|------|------|
| **控制模式** | 匹配 keyboardShortcuts.triggerWords | 执行 keyboard_control | 极简 icon + 执行状态 |
| **语音输入模式** | 纯文字内容（无控制意图、无对话意图） | 直接插入光标处 | 极简 icon + 插入状态 |
| **Typeless Chat 模式** | 对话意图（疑问句、需要 AI 回复） | 发送给 AI，显示结果窗口 | 极简内容结果窗口 |

### 自动判断逻辑

```typescript
function determineIntent(text: string, shortcuts: KeyboardShortcut[]): Intent {
  // 1. 匹配控制意图
  const matchedShortcut = shortcuts.find(s => 
    s.enabled && s.triggerWords.some(word => text.includes(word))
  )
  if (matchedShortcut) {
    return { type: 'control', shortcut: matchedShortcut }
  }
  
  // 2. 判断对话意图（简单启发式）
  if (isQuestion(text) || needsAIResponse(text)) {
    return { type: 'chat' }
  }
  
  // 3. 默认为语音输入
  return { type: 'input' }
}
```

---

## 任务清单

| # | 任务 | 优先级 | 文件 |
|---|------|--------|------|
| 1 | 创建意图判断模块 | P0 | 新建 `intent-detector.ts` |
| 2 | 重构 useVoiceController 逻辑 | P0 | `useVoiceController.ts` |
| 3 | 添加流式 ASR 支持 | P0 | `funasr-local.ts`, `useVoiceController.ts` |
| 4 | 创建 TypelessChatResult 窗口 | P0 | 新建 `TypelessChatResult.tsx` |
| 5 | 更新 TypelessPanel 状态显示 | P1 | `TypelessPanel.tsx` |
| 6 | 添加状态管理 atoms | P1 | `voiceStore.ts` |
| 7 | 更新设置页面说明 | P2 | `settings/voice.tsx` |
| 8 | 集成测试 | P2 | 手动测试 |

---

## 任务 1：创建意图判断模块

**文件：**
- 新建：`src/renderer/packages/voice/intent-detector.ts`

**实现：**

```typescript
import type { KeyboardShortcut } from '@shared/types/voice'

export type IntentType = 'control' | 'input' | 'chat'

export interface Intent {
  type: IntentType
  shortcut?: KeyboardShortcut
  confidence: number
}

/**
 * 判断用户意图
 * 1. 优先匹配控制意图（keyboardShortcuts）
 * 2. 判断是否为对话意图
 * 3. 默认为输入意图
 */
export function determineIntent(
  text: string,
  shortcuts: KeyboardShortcut[] = []
): Intent {
  const normalizedText = text.toLowerCase().trim()
  
  // 1. 匹配控制意图
  const matchedShortcut = shortcuts.find((shortcut) => {
    if (!shortcut.enabled) return false
    return shortcut.triggerWords.some((word) => 
      normalizedText.includes(word.toLowerCase())
    )
  })
  
  if (matchedShortcut) {
    return {
      type: 'control',
      shortcut: matchedShortcut,
      confidence: 1.0,
    }
  }
  
  // 2. 判断对话意图（简单启发式）
  if (isConversationIntent(normalizedText)) {
    return {
      type: 'chat',
      confidence: 0.8,
    }
  }
  
  // 3. 默认为输入意图
  return {
    type: 'input',
    confidence: 0.9,
  }
}

/**
 * 判断是否为对话意图
 * 包含疑问词、疑问句特征
 */
function isConversationIntent(text: string): boolean {
  // 疑问词
  const questionWords = [
    '什么', '怎么', '为什么', '多少', '哪里', '谁', '哪个',
    '吗', '呢', '吧', '？', '?',
    '如何', '帮忙', '请', '谢谢',
  ]
  
  // 是否以疑问词开头或包含疑问词
  return questionWords.some((word) => text.includes(word))
}
```

**测试：** 运行 `pnpm check`，确保无类型错误。

**提交：**
```bash
git add src/renderer/packages/voice/intent-detector.ts
git commit -m "feat(voice): add intent detection module for Typeless mode"
```

---

## 任务 2：重构 useVoiceController 逻辑

**文件：**
- 修改：`src/renderer/hooks/useVoiceController.ts`

### 2.1 修改 stopRecording 逻辑

```typescript
// 根据工作模式决定处理流程
if (text) {
  if (settings.workMode === 'typeless') {
    // Typeless 模式：自动判断意图
    const intent = determineIntent(text, settings.keyboardShortcuts || [])
    
    switch (intent.type) {
      case 'control':
        // 控制模式：执行 keyboard_control
        await handleControlIntent(intent.shortcut!)
        break
      case 'input':
        // 语音输入模式：直接插入文字
        await handleInputIntent(text)
        break
      case 'chat':
        // Typeless Chat 模式：显示结果窗口
        await handleChatIntent(text)
        break
    }
  } else {
    // Chat 模式：发送到 AI 对话（原有逻辑）
    await handleChatMode(text)
  }
}
```

### 2.2 添加三种处理函数

```typescript
// 控制意图处理
const handleControlIntent = async (shortcut: KeyboardShortcut) => {
  setVoiceMode('processing')
  setTypelessStatus({ type: 'executing', message: `正在执行: ${shortcut.name}` })
  
  try {
    // 调用 MCP 执行键盘控制
    const result = await executeKeyboardControl(shortcut.keyCodes)
    if (result.success) {
      setTypelessStatus({ type: 'success', message: '执行完成' })
    } else {
      setTypelessStatus({ type: 'error', message: result.error || '执行失败' })
    }
  } catch (error) {
    setTypelessStatus({ type: 'error', message: String(error) })
  }
  
  // 3秒后清除状态
  setTimeout(() => setTypelessStatus(null), 3000)
}

// 语音输入意图处理
const handleInputIntent = async (text: string) => {
  setVoiceMode('processing')
  setTypelessStatus({ type: 'inserting', message: '正在插入...' })
  
  try {
    const result = await window.electronAPI?.insertText(text)
    if (result?.success) {
      setTypelessStatus({ type: 'success', message: '已插入' })
    } else {
      setTypelessStatus({ type: 'error', message: result?.error || '插入失败' })
    }
  } catch (error) {
    setTypelessStatus({ type: 'error', message: String(error) })
  }
  
  setTimeout(() => setTypelessStatus(null), 2000)
}

// Chat 意图处理
const handleChatIntent = async (text: string) => {
  setVoiceMode('processing')
  setTypelessStatus({ type: 'thinking', message: '正在思考...' })
  
  try {
    // 创建 Typeless Chat Session
    const session = await ensureTypelessChatSession()
    
    // 发送消息
    const msg = createMessage('user', text)
    await submitNewUserMessage(session.id, {
      newUserMsg: msg,
      needGenerating: true,
    })
    
    // 显示结果窗口
    setTypelessChatResult({ sessionId: session.id, userText: text })
    setTypelessStatus(null)
  } catch (error) {
    setTypelessStatus({ type: 'error', message: String(error) })
    setTimeout(() => setTypelessStatus(null), 3000)
  }
}
```

**提交：**
```bash
git add src/renderer/hooks/useVoiceController.ts
git commit -m "feat(voice): refactor Typeless mode with intent detection"
```

---

## 任务 3：添加流式 ASR 支持

**文件：**
- 修改：`src/renderer/packages/voice/asr/funasr-local.ts`
- 修改：`src/renderer/hooks/useVoiceController.ts`

### 3.1 添加流式识别方法

在 `funasr-local.ts` 中添加：

```typescript
/**
 * 流式识别
 * 实时返回部分识别结果
 */
async transcribeStreaming(
  audioStream: ReadableStream<Blob>,
  onPartial: (text: string) => void,
  onComplete: (text: string) => void
): Promise<void> {
  // 使用 WebSocket 连接 FunASR 流式服务
  const ws = new WebSocket(`${this.baseURL.replace('http', 'ws')}/ws/transcribe`)
  
  ws.onopen = () => {
    // 发送配置
    ws.send(JSON.stringify({
      mode: '2pass',
      chunk_size: [5, 10, 5],
      wav_name: 'stream',
      is_speaking: true,
    }))
  }
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data)
    if (data.text) {
      onPartial(data.text)
    }
    if (data.is_final && data.text) {
      onComplete(data.text)
    }
  }
  
  // 发送音频流
  const reader = audioStream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    ws.send(value)
  }
  
  ws.send(JSON.stringify({ is_speaking: false }))
}
```

### 3.2 在 useVoiceController 中使用流式识别

```typescript
// 流式识别状态
const [streamingText, setStreamingText] = useState('')

// 开始流式录音
const startStreamingRecording = useCallback(async () => {
  setError(null)
  setVoiceMode('listening')
  setPanelVisible(true)
  setIsRecording(true)
  setStreamingText('')
  
  const recorder = new VoiceRecorder()
  recorderRef.current = recorder
  
  // 启动流式识别
  const asrProvider = getASRProvider()
  if (asrProvider instanceof FunASRLocalProvider) {
    const audioStream = await recorder.startStreaming()
    
    await asrProvider.transcribeStreaming(
      audioStream,
      (partial) => setStreamingText(partial), // 实时更新
      (complete) => {
        setTranscript(complete)
        setVoiceMode('inactive')
        processResult(complete)
      }
    )
  }
}, [...])
```

**提交：**
```bash
git add src/renderer/packages/voice/asr/funasr-local.ts src/renderer/hooks/useVoiceController.ts
git commit -m "feat(voice): add streaming ASR support"
```

---

## 任务 4：创建 TypelessChatResult 窗口

**文件：**
- 新建：`src/renderer/components/voice/TypelessChatResult.tsx`

### 4.1 组件结构

```typescript
import { useAtom } from 'jotai'
import { typelessChatResultAtom, closeTypelessChatResult } from '@/stores/voiceStore'
import * as chatStore from '@/stores/chatStore'
import { getMessageText } from '@shared/utils/message'

export function TypelessChatResult() {
  const [result, setResult] = useAtom(typelessChatResultAtom)
  
  if (!result) return null
  
  const session = chatStore.useSession(result.sessionId)
  const lastAssistantMsg = session?.messages
    .filter((m) => m.role === 'assistant' && !m.error)
    .pop()
  
  const responseText = lastAssistantMsg ? getMessageText(lastAssistantMsg) : ''
  const isGenerating = lastAssistantMsg?.generating ?? false
  
  return (
    <div className="fixed right-4 top-20 w-96 max-h-[80vh] overflow-auto z-50 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">⌫</span>
          <span className="font-medium">Typeless</span>
        </div>
        <button
          onClick={() => setResult(null)}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ✕
        </button>
      </div>
      
      {/* 内容区域 */}
      <div className="p-4 space-y-4">
        {/* 用户语音 */}
        <div className="flex items-start gap-2">
          <span className="text-gray-500">🎤</span>
          <p className="text-sm text-gray-900 dark:text-gray-100">{result.userText}</p>
        </div>
        
        {/* AI 回复 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
            <span>✨</span>
            <span className="text-sm font-medium">回答</span>
            {isGenerating && (
              <span className="text-xs animate-pulse">生成中...</span>
            )}
          </div>
          
          <div className="prose dark:prose-invert prose-sm max-w-none">
            {responseText ? (
              <MarkdownRenderer content={responseText} />
            ) : (
              <div className="flex items-center gap-2 text-gray-500">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-sm">思考中...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

### 4.2 添加到 __root.tsx

```typescript
// 在 return 中添加
<TypelessChatResult />
```

**提交：**
```bash
git add src/renderer/components/voice/TypelessChatResult.tsx src/renderer/routes/__root.tsx
git commit -m "feat(voice): add TypelessChatResult window"
```

---

## 任务 5：更新 TypelessPanel 状态显示

**文件：**
- 修改：`src/renderer/components/voice/TypelessPanel.tsx`

### 5.1 添加状态显示

```typescript
import { typelessStatusAtom, streamingTextAtom } from '@/stores/voiceStore'

export function TypelessPanel() {
  const voiceMode = useAtomValue(voiceModeAtom)
  const isRecording = useAtomValue(isRecordingAtom)
  const transcript = useAtomValue(transcriptAtom)
  const audioLevel = useAtomValue(audioLevelAtom)
  const streamingText = useAtomValue(streamingTextAtom)
  const status = useAtomValue(typelessStatusAtom)
  
  const [visible, setVisible] = useState(false)
  
  useEffect(() => {
    if (voiceMode !== 'inactive' || status) {
      setVisible(true)
    } else {
      const timer = setTimeout(() => setVisible(false), 500)
      return () => clearTimeout(timer)
    }
  }, [voiceMode, status])
  
  if (!visible) return null
  
  // 获取显示文本
  const displayText = streamingText || transcript || ''
  
  // 获取状态样式
  const getStatusStyle = () => {
    switch (status?.type) {
      case 'executing':
        return { icon: '⚙️', bg: 'bg-blue-600/95' }
      case 'inserting':
        return { icon: '✏️', bg: 'bg-yellow-600/95' }
      case 'thinking':
        return { icon: '💭', bg: 'bg-purple-600/95' }
      case 'success':
        return { icon: '✅', bg: 'bg-green-600/95' }
      case 'error':
        return { icon: '❌', bg: 'bg-red-600/95' }
      default:
        return { icon: '🎤', bg: 'bg-gray-900/95' }
    }
  }
  
  const { icon, bg } = getStatusStyle()
  
  return (
    <div
      className={cn(
        'fixed bottom-8 left-1/2 -translate-x-1/2 z-50',
        'px-6 py-3 rounded-full shadow-xl',
        'text-white flex items-center gap-3',
        'transition-all duration-200',
        bg
      )}
    >
      {/* 状态图标 */}
      <span className="text-lg">{icon}</span>
      
      {/* 录音波形 */}
      {isRecording && (
        <div className="flex items-center gap-0.5 h-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-white/80 rounded-full transition-all animate-pulse"
              style={{
                height: `${Math.max(4, Math.min(16, audioLevel * 100 + 4))}px`,
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
      )}
      
      {/* 流式识别文本 */}
      {displayText && !status && (
        <span className="text-sm max-w-xs truncate">{displayText}</span>
      )}
      
      {/* 状态消息 */}
      {status && (
        <span className="text-sm">{status.message}</span>
      )}
    </div>
  )
}
```

**提交：**
```bash
git add src/renderer/components/voice/TypelessPanel.tsx
 git commit -m "feat(voice): update TypelessPanel with status display"
```

---

## 任务 6：添加状态管理 atoms

**文件：**
- 修改：`src/renderer/stores/voiceStore.ts`

```typescript
// 流式识别文本
export const streamingTextAtom = atom<string>('')

// Typeless 状态
export interface TypelessStatus {
  type: 'executing' | 'inserting' | 'thinking' | 'success' | 'error'
  message: string
}
export const typelessStatusAtom = atom<TypelessStatus | null>(null)

// Typeless Chat 结果
export interface TypelessChatResult {
  sessionId: string
  userText: string
}
export const typelessChatResultAtom = atom<TypelessChatResult | null>(null)

// 关闭结果窗口
export const closeTypelessChatResult = atom(null, (_get, set) => {
  set(typelessChatResultAtom, null)
})
```

**提交：**
```bash
git add src/renderer/stores/voiceStore.ts
git commit -m "feat(voice): add Typeless mode state atoms"
```

---

## 任务 7：更新设置页面说明

**文件：**
- 修改：`src/renderer/routes/settings/voice.tsx`

更新工作模式说明：

```typescript
<p className="text-sm text-gray-600 dark:text-gray-400">
  {t('Typeless 模式：语音识别后自动判断意图 - 控制命令执行快捷键、纯文本直接插入、对话问题显示结果窗口')}
</p>
```

**提交：**
```bash
git add src/renderer/routes/settings/voice.tsx
git commit -m "docs(settings): update Typeless mode description"
```

---

## 任务 8：集成测试

### 测试用例

| 场景 | 操作 | 预期结果 |
|------|------|---------|
| 控制意图 | 说"复制" | 执行 Ctrl+C，显示 ⚙️ 执行完成 |
| 语音输入 | 说"这是一段测试文字" | 文字插入光标，显示 ✅ 已插入 |
| Chat 意图 | 说"今天天气怎么样" | 显示 TypelessChatResult 窗口 |
| 流式识别 | 长按说话 | 实时显示识别内容 |
| 窗口关闭 | 点击 ✕ | 窗口关闭，可重新录音 |

### 运行测试

```bash
pnpm dev
```

---

## 依赖关系

```
Task 1 (intent-detector)
    ↓
Task 2 (useVoiceController) → Task 3 (streaming ASR)
    ↓                           ↓
Task 6 (state atoms) ←──────┘
    ↓
Task 4 (TypelessChatResult)
    ↓
Task 5 (TypelessPanel)
    ↓
Task 7 (settings)
    ↓
Task 8 (testing)
```

---

## 总结

本计划实现了完整的 Typeless 模式增强：
1. ✅ 自动意图判断（控制/输入/对话）
2. ✅ 流式识别实时显示
3. ✅ 极简交互（不弹主窗口）
4. ✅ Typeless Chat 结果窗口
5. ✅ 执行状态反馈