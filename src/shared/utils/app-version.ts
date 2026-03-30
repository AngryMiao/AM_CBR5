function getMajorVersion(version: string): number | null {
  const match = version.trim().match(/^v?(\d+)(?:\.|$)/)
  if (!match) {
    return null
  }

  return Number.parseInt(match[1], 10)
}

export function shouldUseHostedReleaseServices(version: string): boolean {
  const majorVersion = getMajorVersion(version)
  if (majorVersion === null) {
    return true
  }

  return majorVersion >= 1
}
