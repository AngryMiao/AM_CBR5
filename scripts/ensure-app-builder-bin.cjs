const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const appBuilderBinDir = path.join(rootDir, 'node_modules', 'app-builder-bin')
const libsqlScopeDir = path.join(rootDir, 'node_modules', '@libsql')
const neonScopeDir = path.join(rootDir, 'node_modules', '@neon-rs')
const compatNodeModulesDir = path.join(rootDir, 'node_modules', 'builder-util', 'node_modules')
const compatLinkPath = path.join(compatNodeModulesDir, 'app-builder-bin')
const libsqlCompatDir = path.join(rootDir, 'node_modules', 'libsql', 'node_modules')
const libsqlCompatLinkPath = path.join(libsqlCompatDir, '@libsql')
const neonCompatLinkPath = path.join(libsqlCompatDir, '@neon-rs')
const binaryDirs = ['mac', 'linux', 'win']

function recreateSymlink(linkPath, target) {
  try {
    fs.rmSync(linkPath, { recursive: true, force: true })
  } catch {
    // Missing path is fine.
  }
  fs.symlinkSync(target, linkPath)
}

if (!fs.existsSync(appBuilderBinDir)) {
  console.error(`[ensure-app-builder-bin] Missing source directory: ${appBuilderBinDir}`)
  process.exit(1)
}

fs.mkdirSync(compatNodeModulesDir, { recursive: true })

recreateSymlink(compatLinkPath, appBuilderBinDir)

fs.mkdirSync(libsqlCompatDir, { recursive: true })
recreateSymlink(libsqlCompatLinkPath, libsqlScopeDir)
recreateSymlink(neonCompatLinkPath, neonScopeDir)

if (fs.existsSync(libsqlScopeDir)) {
  for (const packageName of fs.readdirSync(libsqlScopeDir)) {
    const packageDir = path.join(libsqlScopeDir, packageName)
    if (!fs.statSync(packageDir).isDirectory()) continue

    const nestedNodeModulesDir = path.join(packageDir, 'node_modules')
    fs.mkdirSync(nestedNodeModulesDir, { recursive: true })
    recreateSymlink(path.join(nestedNodeModulesDir, '@libsql'), libsqlScopeDir)
  }
}

for (const dirName of binaryDirs) {
  const dirPath = path.join(appBuilderBinDir, dirName)
  if (!fs.existsSync(dirPath)) continue

  for (const entry of fs.readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry)
    const stat = fs.statSync(entryPath)
    if (!stat.isFile()) continue
    fs.chmodSync(entryPath, 0o755)
  }
}

console.log('[ensure-app-builder-bin] Created compatibility symlinks and fixed binary permissions')
