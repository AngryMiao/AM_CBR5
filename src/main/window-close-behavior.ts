type MainWindowCloseBehavior = {
  isQuitting: boolean
  voiceEnabled?: boolean
}

// 语音热键依赖主 renderer 常驻；启用语音时关闭主窗口仅隐藏到托盘。
export function shouldHideMainWindowOnClose(args: MainWindowCloseBehavior) {
  return !args.isQuitting && args.voiceEnabled === true
}
