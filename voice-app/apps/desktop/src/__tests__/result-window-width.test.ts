import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('result window card width styles', () => {
  const cssPath = path.resolve(__dirname, '../styles.css')
  const css = readFileSync(cssPath, 'utf8')

  it('keeps the restored wider result card width from the previous runtime layout', () => {
    const cardMatch = css.match(/\.result-card\s*\{([^}]*)\}/s)

    expect(cardMatch).not.toBeNull()

    const cardBlock = cardMatch?.[1] ?? ''

    expect(cardBlock).toContain('width: min(680px, 100%)')
  })
})
