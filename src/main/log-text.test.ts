import { describe, expect, it } from 'vitest'
import { repairLikelyMojibake } from './log-text'

describe('repairLikelyMojibake', () => {
  it('repairs mojibake transcript text back to readable chinese', () => {
    expect(repairLikelyMojibake('浠€涔堢帺鎰忥紵')).toBe('什么玩意？')
  })

  it('repairs mojibake request previews without damaging ascii fields', () => {
    const source =
      'llm-stream-text sessionId=session-1 mode=execute preview="鍝堝搱锛屾偍鏄寚浠€涔堝憿锛?**鎮ㄦ槸瀵逛粈涔堟湁鐤戦棶锛?*"'

    const repaired = repairLikelyMojibake(source)

    expect(repaired).toContain('preview="哈哈，您是指什么呢')
    expect(repaired).toContain('**您是对什么有疑问')
    expect(repaired).toContain('sessionId=session-1')
  })

  it('keeps normal chinese text unchanged', () => {
    expect(repairLikelyMojibake('当前检测到的操作系统环境：Windows。')).toBe('当前检测到的操作系统环境：Windows。')
  })
})
