import { describe, expect, it } from 'vitest'
import { getOverlayHtml } from './typeless-overlay'

describe('typeless overlay html', () => {
  it('matches the original TS overlay structure and copy hierarchy', () => {
    const html = getOverlayHtml()

    expect(html).toContain('overlay-shell')
    expect(html).toContain('overlay-bar')
    expect(html).toContain('overlay-status')
    expect(html).toContain('overlay-eyebrow')
    expect(html).toContain('实时识别')
    expect(html).toContain('等待语音输入')
    expect(html).toContain('按住语音快捷键开始输入')
  })
})
