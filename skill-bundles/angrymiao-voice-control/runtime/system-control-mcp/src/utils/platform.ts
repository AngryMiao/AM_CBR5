import * as os from 'os'

export type Platform = 'win32' | 'darwin' | 'linux'

export function getPlatform(): Platform {
  const platform = os.platform()
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
    return platform
  }
  return 'linux'
}

export function isWindows(): boolean {
  return getPlatform() === 'win32'
}

export function isMacOS(): boolean {
  return getPlatform() === 'darwin'
}

export function isLinux(): boolean {
  return getPlatform() === 'linux'
}

export function getShutdownCommand(): string {
  if (isWindows()) return 'shutdown /s /t 0'
  return 'shutdown -h now'
}

export function getRestartCommand(): string {
  if (isWindows()) return 'shutdown /r /t 0'
  return 'shutdown -r now'
}

export function getLockScreenCommand(): string {
  if (isWindows()) return 'rundll32.exe user32.dll,LockWorkStation'
  if (isMacOS()) return '/System/Library/CoreServices/Menu\\ Extras/User.menu/Contents/Resources/CGSession -suspend'
  return 'loginctl lock-session'
}

export function getSleepCommand(): string {
  if (isWindows()) return 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0'
  if (isMacOS()) return 'pmset sleepnow'
  return 'systemctl suspend'
}
