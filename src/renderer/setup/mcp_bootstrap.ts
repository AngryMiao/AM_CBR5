import { getBuiltinServerConfig } from '@/packages/mcp/builtin'
import { mcpController } from '@/packages/mcp/controller'
import type { MCPServerConfig } from '@/packages/mcp/types'
import type { Settings } from '@shared/types'
import { ANGRYMIAO_SKILL_BUNDLE_ID, ANGRYMIAO_SKILL_RUNTIME_ID } from '@/packages/agent-skills'
import { getInstalledSkillBundle, resolveSkillBundleRuntimeServerConfig } from '@/packages/skill-bundles'
import platform from '@/platform'
import { NODE_ENV } from '@/variables'

function monitorServerStatus() {
  setInterval(() => {
    console.debug(
      'MCP Servers:',
      JSON.stringify(
        Array.from(mcpController.servers.values()).map(({ config, instance: server }) => {
          return {
            id: config.id,
            name: config.name,
            status: server.status,
          }
        }),
        null,
        2
      )
    )
  }, 10000)
}

async function getAngrymiaoSkillRuntimeServerConfig(settings?: Pick<Settings, 'voice'>): Promise<MCPServerConfig | null> {
  if (platform.type !== 'desktop') return null
  try {
    const bundle = await getInstalledSkillBundle(ANGRYMIAO_SKILL_BUNDLE_ID)
    if (!bundle) return null

    const runtimeConfig = await resolveSkillBundleRuntimeServerConfig(bundle.id, ANGRYMIAO_SKILL_RUNTIME_ID, settings)
    if (!runtimeConfig) return null

    return {
      ...runtimeConfig,
      scope: 'skill-bundle',
      skillBundleId: bundle.id,
    }
  } catch (err) {
    console.error('Failed to resolve Angrymiao skill runtime:', err)
    return null
  }
}

platform
  .getSettings()
  .then(async ({ mcp, voice }) => {
    const servers = [
      ...(mcp.enabledBuiltinServers || []).map((id) => getBuiltinServerConfig(id)).filter((s) => !!s),
      ...(mcp.servers || []), // user defined servers
    ]

    // Auto-register installed skill runtime for voice control
    if (voice?.enabled) {
      const systemControlConfig = await getAngrymiaoSkillRuntimeServerConfig({ voice })
      if (systemControlConfig) {
        servers.push(systemControlConfig)
      }
    }

    console.info(`mcp bootstrap ${servers.length} servers`)
    mcpController.bootstrap(servers)
    if (NODE_ENV === 'development') {
      monitorServerStatus()
    }
  })
  .catch((err) => {
    console.error('mcp bootstrap error', err)
  })
