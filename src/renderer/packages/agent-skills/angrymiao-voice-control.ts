import type { AgentSkillReference } from '@shared/types'
import { getInstalledSkillBundle, readSkillBundleTextFile } from '../skill-bundles'
import platform from '@/platform'

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

Use the system-control runtime shipped with this skill bundle to type text, open browser pages, and trigger desktop system actions.`

export function buildAngrymiaoAgentSkillPrompt(
  platformType: string,
  template: string = DEFAULT_PROMPT_TEMPLATE
): string {
  const platformLabel = getPlatformLabel(platformType)

  return `<runtime_environment>
当前检测到的操作系统环境：${platformLabel}。
- 在执行快捷键、窗口切换、文本输入前，先按当前系统环境理解指令。
- macOS 优先使用 Command 体系快捷键；Windows 优先使用 Ctrl / Alt 体系快捷键。
- 如果当前环境与用户说法冲突，优先相信运行时检测到的系统环境。
</runtime_environment>

${template}`
}

export async function resolveAgentSkillPrompt(skill?: AgentSkillReference | null): Promise<string> {
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
      return buildAngrymiaoAgentSkillPrompt(platformType, promptTemplate)
    }
    default:
      return ''
  }
}
