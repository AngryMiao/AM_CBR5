export type TypelessChatResultPayload = {
  userMessageId: string
  asrText: string
  replyText: string
}

export type DoubaoASRSessionConfig = {
  apiKey?: string
  appId: string
  accessKey: string
  resourceId?: string
  model: string
  baseURL?: string
}

export type DoubaoASRSessionHandle = {
  sessionId: string
}

export type DoubaoASRSessionEvent = {
  sessionId: string
  type: 'partial' | 'final' | 'completed' | 'error'
  text?: string
  message?: string
}

export type TypelessChatResultClosedPayload = {
  userMessageId: string
}

export interface ElectronIPC {
  invoke: (channel: string, ...args: any[]) => Promise<any>
  createDoubaoASRSession: (config: DoubaoASRSessionConfig) => Promise<DoubaoASRSessionHandle>
  appendDoubaoASRAudio: (sessionId: string, chunk: Uint8Array) => Promise<boolean>
  commitDoubaoASRSession: (sessionId: string) => Promise<boolean>
  closeDoubaoASRSession: (sessionId: string) => Promise<boolean>
  onDoubaoASREvent: (callback: (event: DoubaoASRSessionEvent) => void) => () => void
  showTypelessChatResult: (payload: TypelessChatResultPayload) => Promise<any>
  hideTypelessChatResult: () => Promise<any>
  onTypelessChatResultClosed: (callback: (payload: TypelessChatResultClosedPayload) => void) => () => void
  onSystemThemeChange: (callback: () => void) => () => void
  onWindowMaximizedChanged: (callback: (_: Electron.IpcRendererEvent, windowMaximized: boolean) => void) => () => void
  onWindowShow: (callback: () => void) => () => void
  onWindowFocused: (callback: () => void) => () => void
  addMcpStdioTransportEventListener: (transportId: string, event: string, callback?: (...args: any[]) => void) => void
  onNavigate: (callback: (path: string) => void) => () => void
  onVoiceToggle: (callback: () => void) => () => void
  // 全局键盘钩子（用于 Typeless 模式长按录音）
  onHotkeyDown: (callback: () => void) => () => void
  onHotkeyUp: (callback: () => void) => () => void
}
