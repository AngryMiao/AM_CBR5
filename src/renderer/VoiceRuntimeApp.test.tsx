/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useVoiceController: vi.fn(),
}))

vi.mock('@/hooks/useVoiceController', () => ({
  useVoiceController: mocks.useVoiceController,
}))

import { VoiceRuntimeApp } from './VoiceRuntimeApp'

describe('VoiceRuntimeApp', () => {
  it('mounts the voice controller without rendering the full chat UI', () => {
    const { container } = render(<VoiceRuntimeApp />)

    expect(mocks.useVoiceController).toHaveBeenCalledTimes(1)
    expect(container.innerHTML).toBe('')
  })
})
