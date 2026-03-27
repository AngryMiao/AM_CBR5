export interface ElectronIPC {
  invoke: (channel: string, ...args: any[]) => Promise<any>
  onSystemThemeChange: (callback: () => void) => () => void
  onWindowMaximizedChanged: (callback: (_: Electron.IpcRendererEvent, windowMaximized: boolean) => void) => () => void
  onWindowShow: (callback: () => void) => () => void
  onWindowFocused: (callback: () => void) => () => void
  addMcpStdioTransportEventListener: (transportId: string, event: string, callback?: (...args: any[]) => void) => void
  onNavigate: (callback: (path: string) => void) => () => void
  onVoiceToggle: (callback: () => void) => () => void
  // 文字插入相关
  insertText: (text: string) => Promise<{ success: boolean; error?: string }>
  isTextInsertionSupported: () => Promise<boolean>
  // 全局键盘钩子（用于 Typeless 模式长按录音）
  onHotkeyDown: (callback: () => void) => () => void
  onHotkeyUp: (callback: () => void) => () => void
}
