import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { MCPServerConfig, Settings, SkillBundleManifest, SkillBundleRuntime } from '@shared/types'
import { SkillBundleManifestSchema } from '@shared/types'

function getSkillBundlesBaseDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'skill-bundles')
    : path.join(__dirname, '../../skill-bundles')
}

function resolvePathInside(baseDir: string, relativePath: string) {
  const resolved = path.resolve(baseDir, relativePath)
  const normalizedBase = `${path.resolve(baseDir)}${path.sep}`
  if (resolved !== path.resolve(baseDir) && !resolved.startsWith(normalizedBase)) {
    throw new Error(`Path escapes bundle root: ${relativePath}`)
  }
  return resolved
}

function getBundleDir(bundleId: string) {
  return path.join(getSkillBundlesBaseDir(), bundleId)
}

function getManifestPath(bundleId: string) {
  return path.join(getBundleDir(bundleId), 'manifest.json')
}

function getValueByPath(source: unknown, valuePath?: string) {
  if (!valuePath) {
    return undefined
  }

  return valuePath.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined
    }
    return (current as Record<string, unknown>)[key]
  }, source)
}

function resolveRuntimeEnv(runtime: SkillBundleRuntime, settings?: Partial<Settings>) {
  const env: Record<string, string> = {}

  for (const binding of runtime.env) {
    let value = ''
    if (binding.source === 'literal') {
      value = binding.value || ''
    } else if (binding.source === 'settings-path') {
      const resolved = getValueByPath(settings, binding.settingPath)
      value = typeof resolved === 'string' ? resolved : ''
    }

    if (!value) {
      if (binding.required) {
        throw new Error(`Missing required runtime setting for ${binding.name}`)
      }
      continue
    }

    env[binding.name] = value
  }

  return Object.keys(env).length > 0 ? env : undefined
}

export function listInstalledSkillBundles(): SkillBundleManifest[] {
  const baseDir = getSkillBundlesBaseDir()
  if (!fs.existsSync(baseDir)) {
    return []
  }

  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const raw = fs.readFileSync(path.join(baseDir, entry.name, 'manifest.json'), 'utf8')
      return SkillBundleManifestSchema.parse(JSON.parse(raw))
    })
}

export function getSkillBundleManifest(bundleId: string): SkillBundleManifest {
  const manifestPath = getManifestPath(bundleId)
  const raw = fs.readFileSync(manifestPath, 'utf8')
  return SkillBundleManifestSchema.parse(JSON.parse(raw))
}

export function readSkillBundleTextFile(bundleId: string, relativePath: string): string {
  const bundleDir = getBundleDir(bundleId)
  const filePath = resolvePathInside(bundleDir, relativePath)
  return fs.readFileSync(filePath, 'utf8')
}

export function resolveSkillBundleRuntimeServerConfig(
  bundleId: string,
  runtimeId: string,
  settings?: Partial<Settings>
): MCPServerConfig | null {
  const manifest = getSkillBundleManifest(bundleId)
  if (!manifest.platforms.includes(process.platform as SkillBundleManifest['platforms'][number])) {
    return null
  }

  const runtime = manifest.runtimes.find((item) => item.id === runtimeId)
  if (!runtime) {
    throw new Error(`Runtime ${runtimeId} not found in bundle ${bundleId}`)
  }

  if (!runtime.platforms.includes(process.platform as SkillBundleManifest['platforms'][number])) {
    return null
  }

  const entryPath = resolvePathInside(getBundleDir(bundleId), runtime.entry)
  const env = resolveRuntimeEnv(runtime, settings)
  const command = app.isPackaged ? process.execPath : 'node'
  const runtimeEnv = app.isPackaged ? { ...(env || {}), ELECTRON_RUN_AS_NODE: '1' } : env

  return {
    id: runtime.server.id,
    name: runtime.server.name,
    enabled: true,
    transport: {
      type: 'stdio',
      command,
      args: [entryPath],
      env: runtimeEnv,
    },
  }
}
