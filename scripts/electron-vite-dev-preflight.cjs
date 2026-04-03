const path = require('node:path')
const { spawnSync } = require('node:child_process')

const LOOPBACK_NO_PROXY_HOSTS = ['localhost', '127.0.0.1', '::1']

function splitNoProxy(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function buildNoProxyValue(existingValue) {
  const merged = new Set(splitNoProxy(existingValue))
  for (const host of LOOPBACK_NO_PROXY_HOSTS) {
    merged.add(host)
  }
  return Array.from(merged).join(',')
}

function buildDevChildEnv(baseEnv) {
  const nextEnv = { ...baseEnv }
  const nextNoProxy = buildNoProxyValue(baseEnv.NO_PROXY || baseEnv.no_proxy)

  nextEnv.NO_PROXY = nextNoProxy
  nextEnv.no_proxy = nextNoProxy
  delete nextEnv.ELECTRON_RUN_AS_NODE

  return nextEnv
}

function run() {
  const tool = process.argv[2]
  const args = process.argv.slice(3)

  if (!tool) {
    console.error('[electron-vite-dev-preflight] Missing tool name')
    process.exit(1)
  }

  const rootDir = path.resolve(__dirname, '..')
  const runLocalBinPath = path.join(rootDir, 'scripts', 'run-local-bin.cjs')
  const childEnv = buildDevChildEnv(process.env)

  const changedNoProxy = childEnv.NO_PROXY !== (process.env.NO_PROXY || process.env.no_proxy || '')
  if (changedNoProxy) {
    console.info(`[electron-vite-dev-preflight] Using NO_PROXY=${childEnv.NO_PROXY}`)
  }
  if (typeof process.env.ELECTRON_RUN_AS_NODE !== 'undefined') {
    console.info('[electron-vite-dev-preflight] Removing ELECTRON_RUN_AS_NODE from dev child process')
  }

  const result = spawnSync(process.execPath, [runLocalBinPath, tool, ...args], {
    cwd: rootDir,
    env: childEnv,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`[electron-vite-dev-preflight] Failed to execute ${tool}: ${result.error.message}`)
    process.exit(1)
  }

  process.exit(result.status ?? 1)
}

if (require.main === module) {
  run()
}

module.exports = {
  LOOPBACK_NO_PROXY_HOSTS,
  buildDevChildEnv,
  buildNoProxyValue,
}
