const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const releaseAppDir = path.join(rootDir, 'release', 'app')
const releaseAppNodeModulesDir = path.join(releaseAppDir, 'node_modules')
const srcNodeModulesPath = path.join(rootDir, 'src', 'node_modules')

const installEnv = { ...process.env, CI: process.env.CI || 'true' }
const shell = process.platform === 'win32'

let installResult = spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts'], {
  cwd: releaseAppDir,
  stdio: 'inherit',
  env: installEnv,
  shell,
})

if (installResult.error?.code === 'ENOENT') {
  console.warn('[prepare-release-app-deps] npm not found, using pnpm install --prod')
  installResult = spawnSync('pnpm', ['install', '--prod', '--ignore-scripts'], {
    cwd: releaseAppDir,
    stdio: 'inherit',
    env: installEnv,
    shell,
  })
}

if (installResult.error) {
  console.error(`[prepare-release-app-deps] Failed to install release/app dependencies: ${installResult.error.message}`)
  process.exit(1)
}

if (installResult.status !== 0) {
  process.exit(installResult.status)
}

try {
  const existing = fs.lstatSync(srcNodeModulesPath)
  if (existing.isSymbolicLink()) {
    const target = fs.readlinkSync(srcNodeModulesPath)
    if (target === releaseAppNodeModulesDir) {
      process.exit(0)
    }
  }
  fs.rmSync(srcNodeModulesPath, { recursive: true, force: true })
} catch {
  // Missing path is fine.
}

fs.symlinkSync(releaseAppNodeModulesDir, srcNodeModulesPath, 'junction')
