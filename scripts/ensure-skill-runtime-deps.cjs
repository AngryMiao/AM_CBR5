const fs = require('node:fs')
const path = require('node:path')

const packageJsonArg = process.argv[2]
if (!packageJsonArg) {
  throw new Error('Usage: node scripts/ensure-skill-runtime-deps.cjs <runtime-package.json>')
}

const rootDir = path.resolve(__dirname, '..')
const rootNodeModulesDir = path.join(rootDir, 'node_modules')
const pnpmStoreDir = path.join(rootNodeModulesDir, '.pnpm')
const runtimePackageJsonPath = path.resolve(packageJsonArg)

const packageJson = JSON.parse(fs.readFileSync(runtimePackageJsonPath, 'utf8'))
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
    console.log(`[ensure-skill-runtime-deps] Linked ${packageName}`)
    return
  }

  throw new Error(`Unable to locate dependency in pnpm store: ${packageName}`)
}

for (const dependencyName of dependencyNames) {
  ensurePackageLink(dependencyName)
}
