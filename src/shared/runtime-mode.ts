export const VOICE_RUNTIME_SEARCH = 'voice-runtime=1'

export function isVoiceRuntimeModeSearch(search: string): boolean {
  const normalizedSearch = search.startsWith('?') ? search.slice(1) : search
  if (!normalizedSearch) {
    return false
  }

  return new URLSearchParams(normalizedSearch).get('voice-runtime') === '1'
}
