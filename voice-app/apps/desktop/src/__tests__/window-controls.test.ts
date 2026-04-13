import { getCurrentWindow } from '@tauri-apps/api/window'
import { toggleCurrentWindowMaximize } from '../lib/tauri'

describe('window controls', () => {
  it('maximizes the current window explicitly when it is not maximized', async () => {
    const windowMock = {
      label: 'main',
      isMaximized: vi.fn().mockResolvedValue(false),
      maximize: vi.fn().mockResolvedValue(undefined),
      unmaximize: vi.fn().mockResolvedValue(undefined),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
    } as never
    vi.mocked(getCurrentWindow).mockImplementation(() => windowMock)

    await toggleCurrentWindowMaximize()

    expect(windowMock.isMaximized).toHaveBeenCalledTimes(1)
    expect(windowMock.maximize).toHaveBeenCalledTimes(1)
    expect(windowMock.unmaximize).not.toHaveBeenCalled()
    expect(windowMock.toggleMaximize).not.toHaveBeenCalled()
  })

  it('unmaximizes the current window explicitly when it is already maximized', async () => {
    const windowMock = {
      label: 'main',
      isMaximized: vi.fn().mockResolvedValue(true),
      maximize: vi.fn().mockResolvedValue(undefined),
      unmaximize: vi.fn().mockResolvedValue(undefined),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
    } as never
    vi.mocked(getCurrentWindow).mockImplementation(() => windowMock)

    await toggleCurrentWindowMaximize()

    expect(windowMock.isMaximized).toHaveBeenCalledTimes(1)
    expect(windowMock.unmaximize).toHaveBeenCalledTimes(1)
    expect(windowMock.maximize).not.toHaveBeenCalled()
    expect(windowMock.toggleMaximize).not.toHaveBeenCalled()
  })
})
