import { act, render, screen, waitFor } from '@testing-library/react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from '../../../App'
import {
  emitAudioWaveformForTest,
  setRuntimeSnapshotForTest,
} from '../../../test/setup'

describe('OverlayWindow waveform stream', () => {
  it('renders streamed audio bars from the runtime channel', async () => {
    vi.mocked(getCurrentWindow).mockImplementation(() => ({ label: 'overlay' } as never))
    setRuntimeSnapshotForTest({
      phase: '正在聆听',
      transcript: '',
      result: '',
      detail: '正在接收语音输入。',
      input_mode: 'agent',
      result_window_mode: 'auto',
    })

    const { container } = render(<App />)

    expect(await screen.findByRole('status')).toBeInTheDocument()

    act(() => {
      emitAudioWaveformForTest({
        bars: [0, 0, 0, 0, 100, 0, 0, 0],
        active: true,
      })
    })

    await waitFor(() => {
      const renderedBars = Array.from(
        container.querySelectorAll<HTMLElement>('.voice-bar'),
      )

      expect(renderedBars).toHaveLength(8)
      expect(renderedBars[4]?.style.height).toBe('20px')
      expect(renderedBars[3]?.style.height).toBe('3px')
      expect(renderedBars[5]?.style.height).toBe('3px')
    })
  })
})
