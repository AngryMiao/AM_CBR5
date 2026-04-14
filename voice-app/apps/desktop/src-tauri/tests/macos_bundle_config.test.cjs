const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const srcTauriDir = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(srcTauriDir, '../../..')
const macosConfigPath = path.join(srcTauriDir, 'tauri.macos.conf.json')
const infoPlistPath = path.join(srcTauriDir, 'Info.plist')
const packageJsonPath = path.join(workspaceRoot, 'package.json')

test('macOS bundle config enables native packaging and entitlements', () => {
  const config = JSON.parse(fs.readFileSync(macosConfigPath, 'utf8'))

  assert.equal(config.bundle?.active, true)
  assert.deepEqual(config.bundle?.targets, ['app', 'dmg'])
  assert.equal(config.bundle?.macOS?.entitlements, './Entitlements.plist')
})

test('macOS Info.plist declares microphone and automation usage strings', () => {
  const infoPlist = fs.readFileSync(infoPlistPath, 'utf8')

  assert.match(infoPlist, /<key>NSMicrophoneUsageDescription<\/key>/)
  assert.match(infoPlist, /<key>NSAppleEventsUsageDescription<\/key>/)
})

test('workspace exposes a mac packaging command', () => {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  assert.equal(
    packageJson.scripts?.['build:mac'],
    'pnpm --dir apps/desktop exec tauri build --bundles app,dmg --target universal-apple-darwin --ci --no-sign'
  )
})
