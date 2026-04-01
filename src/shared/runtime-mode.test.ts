import { describe, expect, it } from 'vitest'
import { isVoiceRuntimeModeSearch, VOICE_RUNTIME_SEARCH } from './runtime-mode'

describe('runtime mode helpers', () => {
  it('detects voice runtime mode from the search string', () => {
    expect(isVoiceRuntimeModeSearch(`?${VOICE_RUNTIME_SEARCH}`)).toBe(true)
  })

  it('returns false for normal renderer search strings', () => {
    expect(isVoiceRuntimeModeSearch('')).toBe(false)
    expect(isVoiceRuntimeModeSearch('?foo=bar')).toBe(false)
  })
})
