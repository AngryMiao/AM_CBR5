import { render } from '@testing-library/react'
import { Waveform } from '../Waveform'

describe('Waveform', () => {
  it('renders a compact 8-bar waveform while active', () => {
    const { container } = render(<Waveform active />)

    expect(container.querySelectorAll('.voice-bar')).toHaveLength(8)
  })

  it('does not render waveform bars while inactive', () => {
    const { container } = render(<Waveform active={false} />)

    expect(container.querySelectorAll('.voice-bar')).toHaveLength(0)
  })

  it('renders live waveform heights without synthetic animation timing', () => {
    const bars = [0, 8, 16, 32, 48, 72, 54, 100]
    const { container } = render(<Waveform active {...({ bars } as never)} />)
    const waveform = container.firstElementChild
    const renderedBars = Array.from(
      container.querySelectorAll<HTMLElement>('.voice-bar'),
    )

    expect(waveform?.className).toContain('items-center')
    expect(waveform?.className).not.toContain('items-end')
    expect(renderedBars).toHaveLength(8)
    expect(renderedBars[0]?.style.height).toBe('3px')
    expect(renderedBars[7]?.style.height).toBe('20px')

    for (const bar of renderedBars) {
      expect(bar.style.animation).toBe('none')
      expect(bar.style.animationDelay).toBe('')
      expect(bar.style.animationDuration).toBe('')
      expect(bar.style.transformOrigin).toBe('center center')
    }
  })

  it('keeps a shaped silhouette when loud input saturates every bar', () => {
    const bars = Array.from({ length: 8 }, () => 100)
    const { container } = render(<Waveform active {...({ bars } as never)} />)
    const renderedBars = Array.from(
      container.querySelectorAll<HTMLElement>('.voice-bar'),
    )
    const heights = renderedBars.map((bar) => Number.parseFloat(bar.style.height))

    expect(renderedBars).toHaveLength(8)
    expect(heights[0]).toBeLessThan(heights[3] ?? 0)
    expect(heights[7]).toBeLessThan(heights[4] ?? 0)
    expect(new Set(heights).size).toBeGreaterThan(2)
  })
})
