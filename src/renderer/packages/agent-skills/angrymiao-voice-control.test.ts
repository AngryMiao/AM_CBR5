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
})
