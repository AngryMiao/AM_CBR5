import type { MCPServerConfig, Settings, SkillBundleManifest } from '@shared/types'

const manifestCache = new Map<string, SkillBundleManifest>()
const textFileCache = new Map<string, string>()

export async function listInstalledSkillBundles(): Promise<SkillBundleManifest[]> {
  const manifests = await window.electronAPI.invoke('listInstalledSkillBundles')
  return manifests as SkillBundleManifest[]
}

export async function getInstalledSkillBundle(bundleId: string): Promise<SkillBundleManifest | null> {
  const cached = manifestCache.get(bundleId)
  if (cached) {
    return cached
  }

  const manifests = await listInstalledSkillBundles()
  const manifest = manifests.find((item) => item.id === bundleId) || null
  if (manifest) {
    manifestCache.set(bundleId, manifest)
  }
  return manifest
}

export async function readSkillBundleTextFile(bundleId: string, relativePath: string): Promise<string> {
  const cacheKey = `${bundleId}:${relativePath}`
  const cached = textFileCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const content = await window.electronAPI.invoke('readSkillBundleTextFile', bundleId, relativePath)
  textFileCache.set(cacheKey, content as string)
  return content as string
}

export async function resolveSkillBundleRuntimeServerConfig(
  bundleId: string,
  runtimeId: string,
  settings?: Partial<Settings>
): Promise<MCPServerConfig | null> {
  const config = await window.electronAPI.invoke('resolveSkillBundleRuntimeServerConfig', bundleId, runtimeId, settings)
  return (config as MCPServerConfig | null) || null
}
