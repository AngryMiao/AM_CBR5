import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('desktop shell chrome styles', () => {
  const cssPath = path.resolve(__dirname, '../styles.css')
  const css = readFileSync(cssPath, 'utf8')

  it('keeps the desktop shell square without left, right, or bottom borders', () => {
    const match = css.match(/\.desktop-shell\s*\{([^}]*)\}/s)

    expect(match).not.toBeNull()

    const block = match?.[1] ?? ''
    expect(block).toContain('border-radius: 0;')
    expect(block).toContain('border-left: none;')
    expect(block).toContain('border-right: none;')
    expect(block).toContain('border-bottom: none;')
  })
})
