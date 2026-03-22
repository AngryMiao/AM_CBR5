const fs = require('node:fs')
const path = require('node:path')

const bundleDir = path.resolve(__dirname, '..')
const runtimeEntry = path.join(bundleDir, 'runtime', 'system-control-mcp', 'dist', 'index.js')
const manifestPath = path.join(bundleDir, 'manifest.json')

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing bundle manifest: ${manifestPath}`)
}

if (!fs.existsSync(runtimeEntry)) {
  throw new Error(`Missing built runtime entry: ${runtimeEntry}`)
}

console.log('[angrymiao-voice-control] runtime bundle looks ready')
