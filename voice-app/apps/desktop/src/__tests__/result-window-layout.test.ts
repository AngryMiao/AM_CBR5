import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('result window shell layout styles', () => {
  const cssPath = path.resolve(__dirname, '../styles.css')
  const css = readFileSync(cssPath, 'utf8')

  it('keeps the result shell as a flex centering container', () => {
    const shellMatches = Array.from(css.matchAll(/\.result-shell\s*\{([^}]*)\}/gs))

    expect(shellMatches.length).toBeGreaterThan(0)

    const shellBlock = shellMatches.at(-1)?.[1] ?? ''

    expect(shellBlock).toContain('display: flex')
    expect(shellBlock).toContain('justify-content: center')
    expect(shellBlock).toContain('align-items: center')
  })
})
