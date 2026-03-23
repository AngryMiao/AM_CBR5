import { describe, expect, it } from 'vitest'
import { resolveBrowserLaunchTarget as resolveMarketplaceBrowserLaunchTarget } from '../../claude-code-angrymiao-marketplace/runtime/system-control-mcp/src/tools/system'
import { resolveBrowserLaunchTarget as resolveBundleBrowserLaunchTarget } from '../../skill-bundles/angrymiao-voice-control/runtime/system-control-mcp/src/tools/system'

describe('Angrymiao system-control browser mapping', () => {
  it('maps Edge to msedge on Windows in both runtimes', () => {
    const expected = {
      appName: 'msedge',
      displayName: 'Edge',
    }

    expect(resolveBundleBrowserLaunchTarget('edge', 'win32')).toEqual(expected)
    expect(resolveMarketplaceBrowserLaunchTarget('edge', 'win32')).toEqual(expected)
  })

  it('rejects Safari on Windows in both runtimes', () => {
    const expected = {
      error: 'safari 在 Windows 上不受支持',
    }

    expect(resolveBundleBrowserLaunchTarget('safari', 'win32')).toEqual(expected)
    expect(resolveMarketplaceBrowserLaunchTarget('safari', 'win32')).toEqual(expected)
  })

  it('keeps Safari available on macOS in both runtimes', () => {
    const expected = {
      appName: 'Safari',
      displayName: 'Safari',
    }

    expect(resolveBundleBrowserLaunchTarget('safari', 'darwin')).toEqual(expected)
    expect(resolveMarketplaceBrowserLaunchTarget('safari', 'darwin')).toEqual(expected)
  })
})
