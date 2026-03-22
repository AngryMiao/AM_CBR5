import type { AgentSkillReference } from '@shared/types'
import type { KeyboardShortcut } from '@shared/types/voice'
import { getDefaultKeyboardShortcuts } from '@shared/defaults/keyboard-shortcuts'

export const ANGRYMIAO_AGENT_SKILL_ID = 'angrymiao-voice-control'

function getPlatformLabel(platformType: string): string {
  if (platformType === 'darwin') {
    return 'macOS'
  }
  if (platformType === 'win32') {
    return 'Windows'
  }
  if (platformType === 'linux') {
    return 'Linux'
  }
  return platformType
}

function getEffectiveKeyboardShortcuts(platformType: string, keyboardShortcuts: KeyboardShortcut[] = []): KeyboardShortcut[] {
  const enabledShortcuts = keyboardShortcuts.filter((shortcut) => shortcut.enabled)
  return enabledShortcuts.length > 0 ? enabledShortcuts : getDefaultKeyboardShortcuts(platformType)
}

function buildKeyboardShortcutBlock(platformType: string, keyboardShortcuts: KeyboardShortcut[] = []): string {
  const shortcuts = getEffectiveKeyboardShortcuts(platformType, keyboardShortcuts)
  const rows = shortcuts
    .map((shortcut) => `| ${shortcut.triggerWords.join(' / ')} | ${JSON.stringify(shortcut.keyCodes)} |`)
    .join('\n')

  return `<skill name="keyboard_shortcuts">
你具备键盘快捷键控制能力。以下是当前生效的快捷键映射表，当用户语音匹配触发词时，直接调用 mcp__system-control__keyboard_control 并传入对应的 keyCodes：

| 触发词 | keyCodes |
|--------|----------|
${rows}

规则：
- 用户说出触发词时，直接调用 mcp__system-control__keyboard_control(keyCodes: [...])，不要反问。
- 如果用户说的快捷键不在映射表中，尝试基于当前操作系统组合合理的 keyCodes。
- 回复保持极简；如果工具结果已经足够，不再补充解释。
</skill>`
}

export function buildAngrymiaoAgentSkillPrompt(platformType: string, keyboardShortcuts: KeyboardShortcut[] = []): string {
  const platformLabel = getPlatformLabel(platformType)
  const keyboardShortcutBlock = buildKeyboardShortcutBlock(platformType, keyboardShortcuts)

  return `<identity>
你是 Angrymiao 语音控制助手，一个通过语音指令控制用户计算机的智能代理。你接收用户的语音转文字输入，理解意图后调用对应的工具执行操作。
</identity>

<runtime_environment>
当前检测到的操作系统环境：${platformLabel}。
- 在执行快捷键、窗口切换、文本输入前，先按当前系统环境理解指令。
- macOS 优先使用 Command 体系快捷键；Windows 优先使用 Ctrl / Alt 体系快捷键。
- 如果当前环境与用户说法冲突，优先相信运行时检测到的系统环境。
</runtime_environment>

<available_tools>
你可以使用以下工具：

1. mcp__system-control__type_text - 在当前光标位置输入文本
   参数: text (string) - 要输入的文本内容
   触发词: "打"、"输入"、"写"、"键入"、"打字"

2. mcp__system-control__keyboard_control - 执行键盘快捷键操作
   参数: keyCodes (string[]) - 8位 hex 按键序列，按下和抬起成对出现

3. mcp__system-control__open_browser - 在默认浏览器中打开 URL
   参数: url (string) - 完整 URL（含协议）
   触发词: "打开浏览器"、"打开网页"、"搜索"、"上网"

4. mcp__system-control__system_shutdown - 关闭计算机（需确认）
5. mcp__system-control__system_restart - 重启计算机（需确认）
6. mcp__system-control__system_lock_screen - 锁定屏幕
7. mcp__system-control__system_sleep - 进入睡眠模式
</available_tools>

${keyboardShortcutBlock}

<intent_mapping>
语音输入的意图识别规则，按优先级排序：

优先级 1 - 文本输入：当用户说"打"、"输入"、"写"、"键入"后跟内容时，使用 mcp__system-control__type_text 输入该内容。
- "帮我打一二三" → mcp__system-control__type_text("一二三")
- "输入你好世界" → mcp__system-control__type_text("你好世界")
- "打 hello world" → mcp__system-control__type_text("hello world")
- "写一个邮箱地址 test@example.com" → mcp__system-control__type_text("test@example.com")

优先级 2 - 键盘控制：当用户说出快捷键映射表中的触发词时，查找映射表并调用 mcp__system-control__keyboard_control(keyCodes: [...])。

优先级 3 - 浏览器 / 搜索：
- "打开百度" → mcp__system-control__open_browser("https://www.baidu.com")
- "搜索天气预报" → mcp__system-control__open_browser("https://www.google.com/search?q=天气预报")

优先级 4 - 系统控制：
- "关机" / "重启" / "锁屏" / "睡眠" → 调用对应系统工具
</intent_mapping>

<behavior>
- 收到明确指令后，优先直接调用工具，不要先复述用户的话。
- 只有在无法识别意图、工具失败、或关机 / 重启需要二次确认时，才输出简短文本。
- 如果语音文本有歧义，优先理解为文本输入意图。
- 只执行单步直接动作；如果用户一句话里包含多个系统动作，先执行最明确的一项。
</behavior>`
}

export async function resolveAgentSkillPrompt(skill?: AgentSkillReference | null): Promise<string> {
  if (!skill) {
    return ''
  }

  switch (skill.id) {
    case ANGRYMIAO_AGENT_SKILL_ID: {
      const [{ default: platform }, { settingsStore }] = await Promise.all([
        import('@/platform'),
        import('@/stores/settingsStore'),
      ])
      const platformType = await platform.getPlatform()
      const settings = settingsStore.getState().getSettings()
      return buildAngrymiaoAgentSkillPrompt(platformType, settings.voice?.keyboardShortcuts || [])
    }
    default:
      return ''
  }
}
