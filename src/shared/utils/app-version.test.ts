import { describe, expect, it } from 'vitest'
import { shouldUseHostedReleaseServices } from './app-version'

describe('shouldUseHostedReleaseServices', () => {
  it('skips hosted release services for reset 0.x versions', () => {
    expect(shouldUseHostedReleaseServices('0.1.0')).toBe(false)
    expect(shouldUseHostedReleaseServices('v0.9.3')).toBe(false)
  })

  it('keeps hosted release services for 1.x and above', () => {
    expect(shouldUseHostedReleaseServices('1.0.0')).toBe(true)
    expect(shouldUseHostedReleaseServices('2.3.4')).toBe(true)
  })

  it('falls back to hosted release services for unknown formats', () => {
    expect(shouldUseHostedReleaseServices('dev-build')).toBe(true)
  })
})
