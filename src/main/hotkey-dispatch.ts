export interface HotkeyDispatchWindowLike {
  isDestroyed(): boolean
}

export function resolveHotkeyDispatchWindow<T extends HotkeyDispatchWindowLike>(
  preferredWindow: T | null | undefined,
  windows: T[]
): T | undefined {
  if (preferredWindow && !preferredWindow.isDestroyed()) {
    return preferredWindow
  }

  return windows.find((window) => !window.isDestroyed())
}
