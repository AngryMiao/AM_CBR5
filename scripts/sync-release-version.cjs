const fs = require('node:fs')
const path = require('node:path')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function syncReleaseVersion() {
  const rootDir = path.resolve(__dirname, '..')
  const rootPackagePath = path.join(rootDir, 'package.json')
  const releasePackagePath = path.join(rootDir, 'release', 'app', 'package.json')
  const releaseLockPath = path.join(rootDir, 'release', 'app', 'package-lock.json')

  const rootPackage = readJson(rootPackagePath)
  const releasePackage = readJson(releasePackagePath)
  const releaseLock = readJson(releaseLockPath)

  if (!rootPackage.version) {
    throw new Error('Root package.json is missing a version field')
  }

  releasePackage.version = rootPackage.version
  releaseLock.version = rootPackage.version
  if (releaseLock.packages?.['']) {
    releaseLock.packages[''].version = rootPackage.version
  }

  writeJson(releasePackagePath, releasePackage)
  writeJson(releaseLockPath, releaseLock)

  return rootPackage.version
}

if (require.main === module) {
  try {
    const version = syncReleaseVersion()
    console.log(`[sync-release-version] synced release manifests to ${version}`)
  } catch (error) {
    console.error('[sync-release-version] failed to sync release manifests')
    console.error(error)
    process.exit(1)
  }
}

module.exports = {
  syncReleaseVersion,
}
