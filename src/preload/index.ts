// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge, ipcRenderer } from 'electron'
import type { DoubaoASRSessionEvent, ElectronIPC } from 'src/shared/electron-types'

// export type Channels = 'ipc-example';

const electronHandler: ElectronIPC = {
  // ipcRenderer: {
  //     sendMessage(channel: Channels, ...args: unknown[]) {
  //         ipcRenderer.send(channel, ...args);
  //     },
  //     on(channel: Channels, func: (...args: unknown[]) => void) {
  //         const subscription = (
  //             _event: IpcRendererEvent,
  //             ...args: unknown[]
  //         ) => func(...args);
  //         ipcRenderer.on(channel, subscription);

  //         return () => {
  //             ipcRenderer.removeListener(channel, subscription);
  //         };
  //     },
  //     once(channel: Channels, func: (...args: unknown[]) => void) {
  //         ipcRenderer.once(channel, (_event, ...args) => func(...args));
  //     },
  // },
  invoke: ipcRenderer.invoke,
  createDoubaoASRSession: (config) => ipcRenderer.invoke('doubaoASR:createSession', config),
  appendDoubaoASRAudio: (sessionId, chunk) => ipcRenderer.invoke('doubaoASR:appendAudio', sessionId, chunk),
  commitDoubaoASRSession: (sessionId) => ipcRenderer.invoke('doubaoASR:commitSession', sessionId),
  closeDoubaoASRSession: (sessionId) => ipcRenderer.invoke('doubaoASR:closeSession', sessionId),
  onDoubaoASREvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DoubaoASRSessionEvent) => {
      callback(payload)
    }
    ipcRenderer.on('doubaoASR:event', listener)
    return () => ipcRenderer.off('doubaoASR:event', listener)
  },
  showTypelessChatResult: (payload) => ipcRenderer.invoke('typelessChatResult:show', payload),
  hideTypelessChatResult: () => ipcRenderer.invoke('typelessChatResult:hide'),
  closeTypelessChatResult: () => ipcRenderer.invoke('typelessChatResult:close'),
  onTypelessChatResultClosed: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { userMessageId: string }) => {
      callback(payload)
    }
    ipcRenderer.on('typelessChatResult:closed', listener)
    return () => ipcRenderer.off('typelessChatResult:closed', listener)
  },
  onSystemThemeChange: (callback: () => void) => {
    ipcRenderer.on('system-theme-updated', callback)
    return () => ipcRenderer.off('system-theme-updated', callback)
  },
  onWindowMaximizedChanged: (callback: (_: Electron.IpcRendererEvent, windowMaximized: boolean) => void) => {
    ipcRenderer.on('window:maximized-changed', callback)
    return () => ipcRenderer.off('window:maximized-changed', callback)
  },
  onWindowFocused: (callback: (_: Electron.IpcRendererEvent) => void) => {
    ipcRenderer.on('window:focused', callback)
    return () => ipcRenderer.off('window:focused', callback)
  },
  onWindowShow: (callback: () => void) => {
    ipcRenderer.on('window-show', callback)
    return () => ipcRenderer.off('window-show', callback)
  },
  addMcpStdioTransportEventListener: (transportId: string, event: string, callback?: (...args: any[]) => void) => {
    ipcRenderer.on(`mcp:stdio-transport:${transportId}:${event}`, (_event, ...args) => {
      callback?.(...args)
    })
  },
  onNavigate: (callback: (path: string) => void) => {
    const listener = (_event: unknown, path: string) => {
      callback(path)
    }
    ipcRenderer.on('navigate-to', listener)
    return () => ipcRenderer.off('navigate-to', listener)
  },
  onVoiceToggle: (callback: () => void) => {
    ipcRenderer.on('voice:toggle', callback)
    return () => ipcRenderer.off('voice:toggle', callback)
  },
  onHotkeyDown: (callback: () => void) => {
    ipcRenderer.on('hotkey:down', callback)
    return () => ipcRenderer.off('hotkey:down', callback)
  },
  onHotkeyUp: (callback: () => void) => {
    ipcRenderer.on('hotkey:up', callback)
    return () => ipcRenderer.off('hotkey:up', callback)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronHandler)
