import { getBuiltinServerConfig } from '@/packages/mcp/builtin'
import { mcpController } from '@/packages/mcp/controller'
import type { MCPServerConfig } from '@/packages/mcp/types'
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

async function getSystemControlServerConfig(
  keyboardDriverPath?: string
): Promise<MCPServerConfig | null> {
  if (platform.type !== 'desktop') return null
  try {
    const mcpPath = await window.electronAPI.invoke('getSystemControlMCPPath')
    const mcpCommand = await window.electronAPI.invoke('getSystemControlMCPCommand')
    const env: Record<string, string> = {}
    if (keyboardDriverPath) {
      env.KEYBOARD_DRIVER_PATH = keyboardDriverPath
    }
    if (mcpCommand !== 'node') {
      env.ELECTRON_RUN_AS_NODE = '1'
    }
    return {
      id: 'system-control',
      name: 'system-control',
      enabled: true,
      transport: {
        type: 'stdio' as const,
        command: mcpCommand,
        args: [mcpPath],
        env,
      },
    }
  } catch (err) {
    console.error('Failed to get system-control-mcp path:', err)
    return null
  }
}

platform
  .getSettings()
  .then(async ({ mcp, licenseKey, voice }) => {
    const servers = [
      ...(mcp.enabledBuiltinServers || []).map((id) => getBuiltinServerConfig(id, licenseKey)).filter((s) => !!s),
      ...(mcp.servers || []), // user defined servers
    ]

    // Auto-register system-control-mcp for voice control
    if (voice?.enabled) {
      const systemControlConfig = await getSystemControlServerConfig(voice.keyboardDriverPath)
      if (systemControlConfig) {
        servers.push(systemControlConfig)
      }
    }

    console.info(`mcp bootstrap ${servers.length} servers, with license key: ${!!licenseKey}`)
    mcpController.bootstrap(servers)
    if (NODE_ENV === 'development') {
      monitorServerStatus()
    }
  })
  .catch((err) => {
    console.error('mcp bootstrap error', err)
  })
