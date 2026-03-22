const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const rootNodeModulesDir = path.join(rootDir, 'node_modules')
const pnpmStoreDir = path.join(rootNodeModulesDir, '.pnpm')
const workspacePackageJsonPath = path.join(rootDir, 'system-control-mcp', 'package.json')

const packageJson = JSON.parse(fs.readFileSync(workspacePackageJsonPath, 'utf8'))
const dependencyNames = Object.keys(packageJson.dependencies || {})

function ensurePackageLink(packageName) {
  const targetPath = path.join(rootNodeModulesDir, packageName)
  if (fs.existsSync(targetPath)) return

  const storeEntries = fs.readdirSync(pnpmStoreDir)
  for (const entry of storeEntries) {
    const candidate = path.join(pnpmStoreDir, entry, 'node_modules', packageName)
    if (!fs.existsSync(candidate)) continue

    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.symlinkSync(candidate, targetPath)
    console.log(`[ensure-system-control-mcp-deps] Linked ${packageName}`)
    return
  }

  throw new Error(`Unable to locate dependency in pnpm store: ${packageName}`)
}

for (const dependencyName of dependencyNames) {
  ensurePackageLink(dependencyName)
}
