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
})
