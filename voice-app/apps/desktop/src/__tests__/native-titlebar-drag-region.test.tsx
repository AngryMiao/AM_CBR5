import { fireEvent, render, screen } from '@testing-library/react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from '../App'

describe('titlebar drag behavior', () => {
  it('does not start dragging on a plain click', () => {
    const windowMock = {
      label: 'main',
      startDragging: vi.fn().mockResolvedValue(undefined),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
    } as never
    vi.mocked(getCurrentWindow).mockImplementation(() => windowMock)

    render(<App />)

    const dragRegion = screen.getByLabelText('窗口拖拽区')

    expect(dragRegion).not.toHaveAttribute('data-tauri-drag-region')
    fireEvent.mouseDown(dragRegion, {
      button: 0,
      clientX: 40,
      clientY: 16,
    })
    fireEvent.mouseUp(dragRegion, {
      button: 0,
    })

    expect(windowMock.startDragging).not.toHaveBeenCalled()
  })

  it('starts dragging only after pointer movement passes the threshold', () => {
    const windowMock = {
      label: 'main',
      startDragging: vi.fn().mockResolvedValue(undefined),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
    } as never
    vi.mocked(getCurrentWindow).mockImplementation(() => windowMock)

    render(<App />)

    const dragRegion = screen.getByLabelText('窗口拖拽区')

    fireEvent.mouseDown(dragRegion, {
      button: 0,
      clientX: 20,
      clientY: 20,
    })
    fireEvent.mouseMove(dragRegion, {
      clientX: 22,
      clientY: 22,
    })
    expect(windowMock.startDragging).not.toHaveBeenCalled()

    fireEvent.mouseMove(dragRegion, {
      clientX: 26,
      clientY: 26,
    })

    expect(windowMock.startDragging).toHaveBeenCalledTimes(1)
  })

  it('toggles maximize on double click without starting a drag', () => {
    const windowMock = {
      label: 'main',
      startDragging: vi.fn().mockResolvedValue(undefined),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
    } as never
    vi.mocked(getCurrentWindow).mockImplementation(() => windowMock)

    render(<App />)

    const dragRegion = screen.getByLabelText('窗口拖拽区')
    fireEvent.doubleClick(dragRegion, {
      button: 0,
    })

    expect(windowMock.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(windowMock.startDragging).not.toHaveBeenCalled()
  })
})
