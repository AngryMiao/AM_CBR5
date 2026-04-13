import { readFileSync } from 'node:fs'
import path from 'node:path'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('desktop content width styles', () => {
  const cssPath = path.resolve(__dirname, '../styles.css')
  const css = readFileSync(cssPath, 'utf8')
  const keySelectors = [
    '.settings-form-shell',
    '.history-header-content',
    '.history-list',
    '.logs-header-content',
    '.logs-list',
    '.runtime-header-content',
    '.runtime-sections',
  ]

  it('uses a shared adaptive max width for expanded desktop panels', () => {
    expect(css).toContain('--desktop-content-max-width: min(1680px, calc(100vw - 320px));')

    for (const selector of keySelectors) {
      const pattern = new RegExp(
        `${escapeRegExp(selector)}\\s*\\{[^}]*width:\\s*100%[^}]*max-width:\\s*var\\(--desktop-content-max-width\\)`,
        's',
      )

      expect(css).toMatch(pattern)
    }
  })
})
