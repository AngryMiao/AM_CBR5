import * as os from 'os'
import * as path from 'path'

export type Platform = 'win32' | 'darwin' | 'linux'

/**
 * 获取当前平台
 */
export function getPlatform(): Platform {
  const platform = os.platform()
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
    return platform
  }
  return 'linux'
}

/**
 * 检查是否是 Windows
 */
export function isWindows(): boolean {
  return getPlatform() === 'win32'
}

/**
 * 检查是否是 macOS
 */
export function isMacOS(): boolean {
  return getPlatform() === 'darwin'
}

/**
 * 检查是否是 Linux
 */
export function isLinux(): boolean {
  return getPlatform() === 'linux'
}

/**
 * 获取关机命令
 */
export function getShutdownCommand(): string {
  if (isWindows()) return 'shutdown /s /t 0'
  return 'shutdown -h now'
}

/**
 * 获取重启命令
 */
export function getRestartCommand(): string {
  if (isWindows()) return 'shutdown /r /t 0'
  return 'shutdown -r now'
}

/**
 * 获取锁屏命令
 */
export function getLockScreenCommand(): string {
  if (isWindows()) return 'rundll32.exe user32.dll,LockWorkStation'
  if (isMacOS()) return '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend'
  return 'loginctl lock-session'
}

/**
 * 获取睡眠命令
 */
export function getSleepCommand(): string {
  if (isWindows()) return 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0'
  if (isMacOS()) return 'pmset sleepnow'
  return 'systemctl suspend'
}
