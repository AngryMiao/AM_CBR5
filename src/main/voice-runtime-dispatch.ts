import type { VoiceWorkMode } from '@shared/types/voice'

type DispatchWindowLike = {
  isDestroyed(): boolean
}

type VoiceRuntimeDispatchArgs<TWindow extends DispatchWindowLike> = {
  isQuitting?: boolean
  voiceEnabled?: boolean
  workMode?: VoiceWorkMode
  mainWindow: TWindow | null
  ensureVoiceRuntimeWindow: () => TWindow
  destroyVoiceRuntimeWindow: () => void
  setHotkeyDispatchWindow: (window: TWindow | null) => void
}

export function shouldUseVoiceRuntimeDispatch(args: { voiceEnabled?: boolean; workMode?: VoiceWorkMode }) {
  return !!args.voiceEnabled && args.workMode === 'typeless'
}

function resolveDispatchWindow<TWindow extends DispatchWindowLike>(window: TWindow | null) {
  if (!window || window.isDestroyed()) {
    return null
  }
  return window
}

export function syncVoiceRuntimeDispatch<TWindow extends DispatchWindowLike>(
  args: VoiceRuntimeDispatchArgs<TWindow>
) {
  if (args.isQuitting) {
    args.destroyVoiceRuntimeWindow()
    args.setHotkeyDispatchWindow(null)
    return null
  }

  if (shouldUseVoiceRuntimeDispatch(args)) {
    const voiceRuntimeWindow = args.ensureVoiceRuntimeWindow()
    args.setHotkeyDispatchWindow(voiceRuntimeWindow)
    return voiceRuntimeWindow
  }

  args.destroyVoiceRuntimeWindow()
  const dispatchWindow = resolveDispatchWindow(args.mainWindow)
  args.setHotkeyDispatchWindow(dispatchWindow)
  return dispatchWindow
}
