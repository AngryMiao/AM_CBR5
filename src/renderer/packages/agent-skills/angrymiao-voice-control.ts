import type { AgentSkillReference } from '@shared/types'
import type { KeyboardShortcut, VoiceSettings } from '@shared/types/voice'
import platform from '@/platform'
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

const DEFAULT_PROMPT_TEMPLATE = `# Angrymiao Voice Control

Use the system-control runtime shipped with this skill bundle to type text, open browser pages, and trigger desktop system actions.

## Default Shortcut Mapping

For macOS:

| Trigger words | keyCodes |
| --- | --- |
| 复制 / 拷贝 | ["110700E3","11070006","10070006","100700E3"] |
| 粘贴 | ["110700E3","11070019","10070019","100700E3"] |
| 剪切 | ["110700E3","1107001B","1007001B","100700E3"] |
| 撤销 | ["110700E3","1107001D","1007001D","100700E3"] |
| 重做 | ["110700E3","110700E1","1107001D","1007001D","100700E1","100700E3"] |
| 全选 | ["110700E3","11070004","10070004","100700E3"] |
| 保存 | ["110700E3","11070016","10070016","100700E3"] |
| 回车 / 换行 | ["11070028","10070028"] |
| 删除 / 退格 | ["1107002A","1007002A"] |
| Tab / 制表符 | ["1107002B","1007002B"] |
| 切换窗口 | ["110700E3","1107002B","1007002B","100700E3"] |
| 取消 / 退出 | ["11070029","10070029"] |

For Windows:

| Trigger words | keyCodes |
| --- | --- |
| 复制 / 拷贝 | ["110700E0","11070006","10070006","100700E0"] |
| 粘贴 | ["110700E0","11070019","10070019","100700E0"] |
| 剪切 | ["110700E0","1107001B","1007001B","100700E0"] |
| 撤销 | ["110700E0","1107001D","1007001D","100700E0"] |
| 重做 | ["110700E0","1107001C","1007001C","100700E0"] |
| 全选 | ["110700E0","11070004","10070004","100700E0"] |
| 保存 | ["110700E0","11070016","10070016","100700E0"] |
| 回车 / 换行 | ["11070028","10070028"] |
| 删除 / 退格 | ["1107002A","1007002A"] |
| Tab / 制表符 | ["1107002B","1007002B"] |
| 切换窗口 | ["110700E2","1107002B","1007002B","100700E2"] |
| 取消 / 退出 | ["11070029","10070029"] |`

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

function buildKeyboardShortcutOverrides(keyboardShortcuts: KeyboardShortcut[] = []): string {
  const enabledShortcuts = keyboardShortcuts.filter((shortcut) => shortcut.enabled)
  if (enabledShortcuts.length === 0) {
    return ''
  }

  const rows = enabledShortcuts
    .map((shortcut) => {
      const triggerWords = escapeTableCell(shortcut.triggerWords.join(' / '))
      const keyCodes = escapeTableCell(JSON.stringify(shortcut.keyCodes))
      return `| ${triggerWords} | ${keyCodes} |`
    })
    .join('\n')

  return `## User Configured Shortcut Mapping

以下是用户在应用内配置的键盘快捷键映射，优先级高于上文 Default Shortcut Mapping。

| Trigger words | keyCodes |
| --- | --- |
${rows}

使用规则：
- 当用户语句命中上表 trigger words 时，优先调用 \`mcp__system-control__keyboard_control\`，并严格使用表中 keyCodes。
- 如果上表未命中，再回退到上文 skill bundle 自带的默认快捷键映射。
- 工具执行成功后保持简短确认，不要重复解释 keyCodes。`
}

export function buildAngrymiaoAgentSkillPrompt(
  platformType: string,
  template: string = DEFAULT_PROMPT_TEMPLATE,
  keyboardShortcuts: KeyboardShortcut[] = []
): string {
  const platformLabel = getPlatformLabel(platformType)
  const keyboardShortcutOverrides = buildKeyboardShortcutOverrides(keyboardShortcuts)

  return `<runtime_environment>
当前检测到的操作系统环境：${platformLabel}。
- 在执行快捷键、窗口切换、文本输入前，先按当前系统环境理解指令。
- macOS 优先使用 Command 体系快捷键；Windows 优先使用 Ctrl / Alt 体系快捷键。
- 如果当前环境与用户说法冲突，优先相信运行时检测到的系统环境。
</runtime_environment>

${template}${keyboardShortcutOverrides ? `\n\n${keyboardShortcutOverrides}` : ''}`
}

export async function resolveAgentSkillPrompt(
  skill?: AgentSkillReference | null,
  voiceSettings?: Pick<VoiceSettings, 'keyboardShortcuts'> | null
): Promise<string> {
  if (!skill) {
    return ''
  }

  switch (skill.id) {
    case ANGRYMIAO_AGENT_SKILL_ID: {
      const manifest = await getInstalledSkillBundle(skill.bundleId || ANGRYMIAO_SKILL_BUNDLE_ID)
      if (!manifest) {
        return ''
      }
      const promptTemplate = stripFrontmatter(await readSkillBundleTextFile(manifest.id, manifest.prompt.file))
      const platformType = await platform.getPlatform()
      return buildAngrymiaoAgentSkillPrompt(platformType, promptTemplate, voiceSettings?.keyboardShortcuts || [])
    }
    default:
      return ''
  }
}
