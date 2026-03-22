import type { AgentSkillReference } from '@shared/types'
import type { KeyboardShortcut } from '@shared/types/voice'
import { getDefaultKeyboardShortcuts } from '@shared/defaults/keyboard-shortcuts'
import { getInstalledSkillBundle, readSkillBundleTextFile } from '../skill-bundles'

export const ANGRYMIAO_AGENT_SKILL_ID = 'angrymiao-voice-control'
export const ANGRYMIAO_SKILL_BUNDLE_ID = 'angrymiao-voice-control'
export const ANGRYMIAO_SKILL_RUNTIME_ID = 'system-control'

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) {
    return markdown
  }

  const closingIndex = markdown.indexOf('\n---', 3)
  if (closingIndex < 0) {
    return markdown
  }

  return markdown.slice(closingIndex + 4).trim()
}

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

const DEFAULT_PROMPT_TEMPLATE = `# Angrymiao Voice Control

Use the system-control runtime shipped with this skill bundle to type text, run keyboard shortcuts, open browser pages, and trigger desktop system actions.`

export function buildAngrymiaoAgentSkillPrompt(
  platformType: string,
  keyboardShortcuts: KeyboardShortcut[] = [],
  template: string = DEFAULT_PROMPT_TEMPLATE
): string {
  const platformLabel = getPlatformLabel(platformType)
  const keyboardShortcutBlock = buildKeyboardShortcutBlock(platformType, keyboardShortcuts)

  return `<runtime_environment>
当前检测到的操作系统环境：${platformLabel}。
- 在执行快捷键、窗口切换、文本输入前，先按当前系统环境理解指令。
- macOS 优先使用 Command 体系快捷键；Windows 优先使用 Ctrl / Alt 体系快捷键。
- 如果当前环境与用户说法冲突，优先相信运行时检测到的系统环境。
</runtime_environment>

${template}

${keyboardShortcutBlock}`
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
      const manifest = await getInstalledSkillBundle(skill.bundleId || ANGRYMIAO_SKILL_BUNDLE_ID)
      if (!manifest) {
        return ''
      }
      const promptTemplate = stripFrontmatter(await readSkillBundleTextFile(manifest.id, manifest.prompt.file))
      const platformType = await platform.getPlatform()
      const settings = settingsStore.getState().getSettings()
      return buildAngrymiaoAgentSkillPrompt(platformType, settings.voice?.keyboardShortcuts || [], promptTemplate)
    }
    default:
      return ''
  }
}
