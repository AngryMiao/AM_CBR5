import { readFileSync } from 'node:fs'
import path from 'node:path'

describe('desktop shell chrome styles', () => {
  const cssPath = path.resolve(__dirname, '../styles.css')
  const css = readFileSync(cssPath, 'utf8')

  it('uses solid background for system shadow (non-transparent window)', () => {
    const bodyMatch = css.match(/body\s*\{([^}]*)\}/s)

    expect(bodyMatch).not.toBeNull()

    const bodyBlock = bodyMatch?.[1] ?? ''
    // Solid background color - system shadow works with non-transparent windows
    expect(bodyBlock).toContain('background: #f5f5f7')
  })

  it('keeps the desktop shell without CSS shadow - system shadow from Windows DWM', () => {
    const shellMatch = css.match(/\.desktop-shell\s*\{([^}]*)\}/s)

    expect(shellMatch).not.toBeNull()

    const shellBlock = shellMatch?.[1] ?? ''
    // No CSS shadow - Windows system provides shadow for non-transparent frameless windows
    expect(shellBlock).not.toContain('box-shadow:')
    expect(shellBlock).not.toContain('border:')
    expect(shellBlock).not.toContain('border-radius:')
  })
})
