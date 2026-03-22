const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const tool = process.argv[2]
const args = process.argv.slice(3)

if (!tool) {
  console.error('[run-local-bin] Missing tool name')
  process.exit(1)
}

const rootDir = path.resolve(__dirname, '..')
const pnpmStoreDir = path.join(rootDir, 'node_modules', '.pnpm')

const toolConfigs = {
  esbuild: {
    directPath: path.join(rootDir, 'node_modules', '.bin', 'esbuild'),
    pnpmSuffixes: ['node_modules/esbuild/bin/esbuild'],
    useNode: false,
  },
  'electron-vite': {
    directPath: path.join(rootDir, 'node_modules', '.bin', 'electron-vite'),
    pnpmSuffixes: ['node_modules/electron-vite/bin/electron-vite.js'],
    useNode: true,
  },
  'electron-builder': {
    directPath: path.join(rootDir, 'node_modules', '.bin', 'electron-builder'),
    pnpmSuffixes: [
      'node_modules/electron-builder/cli.js',
      'node_modules/electron-builder/out/cli/cli.js',
    ],
    useNode: true,
  },
  'ts-node': {
    directPath: path.join(rootDir, 'node_modules', '.bin', 'ts-node'),
    pnpmSuffixes: ['node_modules/ts-node/dist/bin.js'],
    useNode: true,
  },
}

const config = toolConfigs[tool]
if (!config) {
  console.error(`[run-local-bin] Unsupported tool: ${tool}`)
  process.exit(1)
}

function canUseDirectPath(filePath) {
  return fs.existsSync(filePath)
}

function findInPnpmStore() {
  if (!fs.existsSync(pnpmStoreDir)) return null

  for (const entry of fs.readdirSync(pnpmStoreDir)) {
    const entryDir = path.join(pnpmStoreDir, entry)
    for (const suffix of config.pnpmSuffixes) {
      const candidate = path.join(entryDir, suffix)
      if (fs.existsSync(candidate)) {
        return candidate
      }
    }
  }

  return null
}

const usingDirectPath = canUseDirectPath(config.directPath)
const resolvedPath = usingDirectPath ? config.directPath : findInPnpmStore()

if (!resolvedPath) {
  console.error(`[run-local-bin] Unable to resolve binary for ${tool}`)
  process.exit(1)
}

const command = config.useNode && !usingDirectPath ? process.execPath : resolvedPath
const commandArgs = config.useNode && !usingDirectPath ? [resolvedPath, ...args] : args

const result = spawnSync(command, commandArgs, {
  cwd: rootDir,
  stdio: 'inherit',
})

if (result.error) {
  console.error(`[run-local-bin] Failed to execute ${tool}: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
