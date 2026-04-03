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

const CURRENT_TURN_PRIORITY_BLOCK = `## Current-turn priority

- 当前轮用户指令优先于任何历史对话内容。
- 若当前轮指令已经明确，只根据当前轮内容决定动作，不要复用上一轮的对象、动作、参数、目标文本或工具结果。
- 只有当当前轮明确要求“继续上一轮”“接着刚才”“重复上一步”时，才参考历史内容。
- 如果历史内容与当前轮冲突，始终以当前轮为准。`

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

const EXPLICIT_LITERAL_TEXT_MARKERS = ['输入文字', '输出文字', '这几个字', '字面', '原样', 'literal text']
const LEADING_POLITE_PREFIXES = [
  '请帮我',
  '请你帮我',
  '帮我',
  '请你',
  '请',
  '麻烦你',
  '麻烦',
  '劳烦你',
  '劳烦',
  '给我',
  '替我',
  '帮忙',
]
const DIRECT_LITERAL_INPUT_PREFIX_PATTERNS = [
  /^(?:把|将)?(?:输入|键入|打字|打出|写出|敲出|敲入|写|打|敲)(?:一下|一下子)?(?:文字|文本|内容|这几个字|这些字)?$/,
  /^(?:把|将)?(?:文字|文本|内容|这几个字|这些字)?(?:输入|键入|打字|打出|写出|敲出|敲入|写|打|敲)(?:一下|一下子)?$/,
]
const NEUTRAL_LITERAL_INPUT_SUFFIX_PATTERN = /^(?:吧|呀|啊|呢|啦|了|哦|噢|一下|一下子)?$/

function normalizeIntentFragment(value: string): string {
  return value.replace(/[\s"'`“”‘’。，！？!?,、：:；;]/g, '')
}

function stripLeadingPolitePrefixes(value: string): string {
  let result = value
  let hasRemovedPrefix = true

  while (hasRemovedPrefix) {
    hasRemovedPrefix = false
    for (const prefix of LEADING_POLITE_PREFIXES) {
      if (result.startsWith(prefix)) {
        result = result.slice(prefix.length)
        hasRemovedPrefix = true
        break
      }
    }
  }

  return result
}

function hasDirectLiteralInputPrefix(text: string, triggerWord: string): boolean {
  const triggerIndex = text.indexOf(triggerWord)
  if (triggerIndex < 0) {
    return false
  }

  const prefix = stripLeadingPolitePrefixes(normalizeIntentFragment(text.slice(0, triggerIndex)))
  const suffix = normalizeIntentFragment(text.slice(triggerIndex + triggerWord.length))
  if (!prefix || !NEUTRAL_LITERAL_INPUT_SUFFIX_PATTERN.test(suffix)) {
    return false
  }

  return DIRECT_LITERAL_INPUT_PREFIX_PATTERNS.some((pattern) => pattern.test(prefix))
}

function isExplicitLiteralTextRequest(text: string, triggerWord = ''): boolean {
  if (EXPLICIT_LITERAL_TEXT_MARKERS.some((marker) => text.includes(marker))) {
    return true
  }

  if (!triggerWord) {
    return false
  }

  return hasDirectLiteralInputPrefix(text, triggerWord)
}

function buildCurrentTurnShortcutDirective(
  currentTurnUserText = '',
  keyboardShortcuts: KeyboardShortcut[] = []
): string {
  const normalizedText = currentTurnUserText.trim()
  if (!normalizedText) {
    return ''
  }

  const enabledShortcuts = keyboardShortcuts.filter((shortcut) => shortcut.enabled)
  const matchedEntries = enabledShortcuts.flatMap((shortcut) =>
    shortcut.triggerWords
      .filter((triggerWord) => triggerWord && normalizedText.includes(triggerWord))
      .map((triggerWord) => ({
        shortcut,
        triggerWord,
      }))
  )

  if (matchedEntries.length === 0) {
    return ''
  }

  matchedEntries.sort((left, right) => right.triggerWord.length - left.triggerWord.length)
  const { shortcut, triggerWord } = matchedEntries[0]
  if (isExplicitLiteralTextRequest(normalizedText, triggerWord)) {
    return ''
  }

  return `## Current Turn Shortcut Directive

Current turn matched configured trigger word: \`${triggerWord}\`
Current utterance: \`${normalizedText}\`
For this turn, prefer \`mcp__system-control__keyboard_control\` over \`mcp__system-control__type_text\`.
Do not type the matched trigger word as literal text unless the user explicitly asks to input the literal text itself.
Matched recordedKeys: ${shortcut.recordedKeys?.length ? `\`${JSON.stringify(shortcut.recordedKeys)}\`` : '`[]`'}
Matched keyCodes fallback: \`${JSON.stringify(shortcut.keyCodes)}\``
}

function buildKeyboardShortcutOverrides(keyboardShortcuts: KeyboardShortcut[] = []): string {
  const enabledShortcuts = keyboardShortcuts.filter((shortcut) => shortcut.enabled)
  if (enabledShortcuts.length === 0) {
    return ''
  }

  const rows = enabledShortcuts
    .map((shortcut) => {
      const triggerWords = escapeTableCell(shortcut.triggerWords.join(' / '))
      const recordedKeys = escapeTableCell(shortcut.recordedKeys?.length ? JSON.stringify(shortcut.recordedKeys) : '')
      const keyCodes = escapeTableCell(JSON.stringify(shortcut.keyCodes))
      return `| ${triggerWords} | ${recordedKeys} | ${keyCodes} |`
    })
    .join('\n')

  return `## User Configured Shortcut Mapping

以下是用户在应用内配置的键盘快捷键映射，优先级高于上文 Default Shortcut Mapping。

| Trigger words | recordedKeys | keyCodes |
| --- | --- | --- |
${rows}

使用规则：
- 当用户语句命中上表 trigger words 时，优先参考 recordedKeys。
- 即使 trigger word 出现在更长的句子中，也应视为命中；只要句子包含某个已配置 trigger word，就应优先执行对应快捷键，而不是把该 trigger word 当作普通文本输出。
- 只有用户明确要求输入文字本身时，才调用 \`mcp__system-control__type_text\`；如果用户是在要求“输入这几个字”，才应把对应词语按文本输入。
- 若用户直接说“输入 / 打 / 写 / 键入 <trigger word>”，表示要把该 trigger word 当作文本输入，不要执行快捷键。
- 若 recordedKeys 对应的键在 HID reference 中可找到稳定映射，则生成 keyCodes 后调用 \`mcp__system-control__keyboard_control\`。
- 若 recordedKeys 只包含非修饰键，则按 recordedKeys 当前顺序依次生成按下/抬起序列，例如 \`["Digit1","Digit2","Digit3"]\` 应执行成 \`123\`。
- 若 recordedKeys 为空，则回退到表中已有 keyCodes。
- 若 reference 中没有稳定映射，不要伪造高风险键码。
- 如果上表未命中，再回退到上文 skill bundle 自带的默认快捷键映射。
- 工具执行成功后保持简短确认，不要重复解释 keyCodes。`
}

function buildHidReferenceBlock(hidReference = ''): string {
  if (!hidReference.trim()) {
    return ''
  }

  return `## HID Reference Usage Rules

- 对明确的键盘动作，可根据 recordedKeys 和下方 HID reference 生成 keyCodes。
- 组合键顺序应遵循：修饰键先按下，普通键按下并抬起，最后修饰键逆序抬起。
- 若 reference 中没有稳定映射，不要伪造高风险键码。

${hidReference.trim()}`
}

export function buildAngrymiaoAgentSkillPrompt(
  platformType: string,
  template: string = DEFAULT_PROMPT_TEMPLATE,
  keyboardShortcuts: KeyboardShortcut[] = [],
  hidReference = '',
  currentTurnUserText = ''
): string {
  const platformLabel = getPlatformLabel(platformType)
  const keyboardShortcutOverrides = buildKeyboardShortcutOverrides(keyboardShortcuts)
  const hidReferenceBlock = buildHidReferenceBlock(hidReference)
  const currentTurnShortcutDirective = buildCurrentTurnShortcutDirective(currentTurnUserText, keyboardShortcuts)

  return `<runtime_environment>
当前检测到的操作系统环境：${platformLabel}。
- 在执行快捷键、窗口切换、文本输入前，先按当前系统环境理解指令。
- macOS 优先使用 Command 体系快捷键；Windows 优先使用 Ctrl / Alt 体系快捷键。
- 如果当前环境与用户说法冲突，优先相信运行时检测到的系统环境。
</runtime_environment>

${CURRENT_TURN_PRIORITY_BLOCK}

${currentTurnShortcutDirective ? `${currentTurnShortcutDirective}\n\n` : ''}${template}${keyboardShortcutOverrides ? `\n\n${keyboardShortcutOverrides}` : ''}${hidReferenceBlock ? `\n\n${hidReferenceBlock}` : ''}`
}

export async function resolveAgentSkillPrompt(
  skill?: AgentSkillReference | null,
  voiceSettings?: Pick<VoiceSettings, 'keyboardShortcuts'> | null,
  currentTurnUserText = ''
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
      const hidReference = await readSkillBundleTextFile(manifest.id, 'docs/keyboard-hid-reference.md')
      return buildAngrymiaoAgentSkillPrompt(
        platformType,
        promptTemplate,
        voiceSettings?.keyboardShortcuts || [],
        hidReference,
        currentTurnUserText
      )
    }
    default:
      return ''
  }
}
