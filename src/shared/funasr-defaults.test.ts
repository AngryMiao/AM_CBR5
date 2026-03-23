import { describe, expect, it } from 'vitest'
import { getDefaultFunASRLaunchCommand } from './types/voice'

describe('getDefaultFunASRLaunchCommand', () => {
  it('uses python on Windows', () => {
    expect(getDefaultFunASRLaunchCommand('win32')).toBe('python')
  })

  it('uses python3 on non-Windows platforms', () => {
    expect(getDefaultFunASRLaunchCommand('darwin')).toBe('python3')
    expect(getDefaultFunASRLaunchCommand('linux')).toBe('python3')
  })
})
