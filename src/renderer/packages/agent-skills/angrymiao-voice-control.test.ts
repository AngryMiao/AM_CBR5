import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAngrymiaoAgentSkillPrompt } from './angrymiao-voice-control'

describe('buildAngrymiaoAgentSkillPrompt', () => {
  it('uses macOS defaults when running on darwin', () => {
    const prompt = buildAngrymiaoAgentSkillPrompt('darwin')

    expect(prompt).toContain('当前检测到的操作系统环境：macOS')
    expect(prompt).toContain('["110700E3","11070006","10070006","100700E3"]')
    expect(prompt).toContain('["110700E3","1107002B","1007002B","100700E3"]')
  })

  it('uses Windows defaults when running on win32', () => {
    const prompt = buildAngrymiaoAgentSkillPrompt('win32')

    expect(prompt).toContain('当前检测到的操作系统环境：Windows')
    expect(prompt).toContain('["110700E0","11070006","10070006","100700E0"]')
    expect(prompt).toContain('["110700E2","1107002B","1007002B","100700E2"]')
    expect(prompt).not.toContain('Keyboard HID Reference')
  })

  it('injects user configured keyboard shortcuts after the default mapping', () => {
    const prompt = buildAngrymiaoAgentSkillPrompt('win32', undefined, [
      {
        id: 'ks_custom_copy_link',
        name: '复制链接',
        triggerWords: ['复制链接', '复制地址'],
        keyCodes: ['110700E0', '11070006', '10070006', '100700E0'],
        enabled: true,
      },
    ])

    expect(prompt).toContain('User Configured Shortcut Mapping')
    expect(prompt).toContain('优先级高于上文 Default Shortcut Mapping')
    expect(prompt).toContain('复制链接 / 复制地址')
    expect(prompt).toContain('["110700E0","11070006","10070006","100700E0"]')
  })

  it('injects recordedKeys alongside legacy keyCodes for user shortcuts', () => {
    const prompt = buildAngrymiaoAgentSkillPrompt(
      'win32',
      undefined,
      [
        {
          id: 'ks_custom_paste',
          name: '粘贴',
          triggerWords: ['粘贴'],
          recordedKeys: ['ControlLeft', 'KeyV'],
          keyCodes: [],
          enabled: true,
        },
      ],
      '## Keyboard HID Reference\n\n| Key | HID |\n| --- | --- |\n| KeyV | 070019 |'
    )

    expect(prompt).toContain('User Configured Shortcut Mapping')
    expect(prompt).toContain('| Trigger words | recordedKeys | keyCodes |')
    expect(prompt).toContain('["ControlLeft","KeyV"]')
  })

  it('treats a longer utterance containing a user trigger word as shortcut intent instead of literal text input', () => {
    const prompt = buildAngrymiaoAgentSkillPrompt(
      'win32',
      undefined,
      [
        {
          id: 'ks_custom_trigger',
          name: '自定义触发',
          triggerWords: ['咒语触发词'],
          recordedKeys: ['Digit1', 'Digit2', 'Digit3'],
          keyCodes: [],
          enabled: true,
        },
      ],
      '## Keyboard HID Reference\n\n| KeyboardEvent.code | HID |\n| --- | --- |\n| Digit1 | 07001E |\n| Digit2 | 07001F |\n| Digit3 | 070020 |',
      '帮我输出咒语触发词吧'
    )

    expect(prompt).toContain('即使 trigger word 出现在更长的句子中，也应视为命中')
    expect(prompt).toContain('只要句子包含某个已配置 trigger word，就应优先执行对应快捷键')
    expect(prompt).toContain('只有用户明确要求输入文字本身时，才调用 `mcp__system-control__type_text`')
    expect(prompt).toContain('Current turn matched configured trigger word: `咒语触发词`')
    expect(prompt).toContain(
      'For this turn, prefer `mcp__system-control__keyboard_control` over `mcp__system-control__type_text`'
    )
    expect(prompt).not.toContain('魔法')
  })

  it('does not force shortcut execution when the user directly asks to input the trigger word as text', () => {
    const prompt = buildAngrymiaoAgentSkillPrompt(
      'win32',
      undefined,
      [
        {
          id: 'ks_custom_literal',
          name: '触发词',
          triggerWords: ['触发词'],
          recordedKeys: ['Digit1', 'Digit2', 'Digit3'],
          keyCodes: [],
          enabled: true,
        },
      ],
      '## Keyboard HID Reference\n\n| KeyboardEvent.code | HID |\n| --- | --- |\n| Digit1 | 07001E |\n| Digit2 | 07001F |\n| Digit3 | 070020 |',
      '输入触发词'
    )

    expect(prompt).not.toContain('Current turn matched configured trigger word')
  })

  it('does not force shortcut execution when the user politely asks to type the trigger word as text', () => {
    const prompt = buildAngrymiaoAgentSkillPrompt(
      'win32',
      undefined,
      [
        {
          id: 'ks_custom_literal_polite',
          name: '触发词',
          triggerWords: ['触发词'],
          recordedKeys: ['Digit1', 'Digit2', 'Digit3'],
          keyCodes: [],
          enabled: true,
        },
      ],
      '## Keyboard HID Reference\n\n| KeyboardEvent.code | HID |\n| --- | --- |\n| Digit1 | 07001E |\n| Digit2 | 07001F |\n| Digit3 | 070020 |',
      '帮我输入触发词'
    )

    expect(prompt).not.toContain('Current turn matched configured trigger word')
  })

  it('appends HID reference guidance to the final prompt', () => {
    const prompt = buildAngrymiaoAgentSkillPrompt(
      'win32',
      undefined,
      [],
      '## Keyboard HID Reference\n\n| Key | HID |\n| --- | --- |\n| KeyA | 070004 |'
    )

    expect(prompt).toContain('Keyboard HID Reference')
    expect(prompt).toContain('KeyA | 070004')
    expect(prompt).toContain('若 reference 中没有稳定映射，不要伪造高风险键码')
  })

  it('keeps the full HID table inside the skill bundle doc instead of generating it from shared app code', () => {
    const hidReferencePath = path.resolve(
      __dirname,
      '../../../../skill-bundles/angrymiao-voice-control/docs/keyboard-hid-reference.md'
    )
    const markdown = readFileSync(hidReferencePath, 'utf8')

    expect(markdown).toContain('| KeyB | 070005 |')
    expect(markdown).toContain('| Digit0 | 070027 |')
    expect(markdown).toContain('| F12 | 070045 |')
    expect(markdown).toContain('| ArrowLeft | 070050 |')
    expect(markdown).toContain('| Quote | 070034 |')
    expect(markdown).toContain('| MetaLeft | 0700E3 |')
    expect(markdown).not.toContain('generated from `src/shared/defaults/keyboard-shortcuts.ts`')
  })

  it('documents that user-configured trigger words override generic text-input heuristics', () => {
    const skillPath = path.resolve(__dirname, '../../../../skill-bundles/angrymiao-voice-control/SKILL.md')
    const markdown = readFileSync(skillPath, 'utf8')

    expect(markdown).toContain(
      'If a user-configured trigger word is present anywhere in the utterance, prefer shortcut execution'
    )
    expect(markdown).toContain(
      'Only use `mcp__system-control__type_text` when the user clearly wants to input literal text'
    )
    expect(markdown).toContain(
      'Patterns like `输入 <trigger word>`、`打 <trigger word>`、`写 <trigger word>`、`键入 <trigger word>` mean the trigger word itself should be typed as literal text'
    )
    expect(markdown).not.toContain('1. Text input\n2. Shortcut execution')
  })
})
