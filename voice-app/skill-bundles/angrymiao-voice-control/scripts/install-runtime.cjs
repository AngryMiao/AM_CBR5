const path = require('node:path')
const { spawnSync } = require('node:child_process')

const bundleDir = path.resolve(__dirname, '..')

const build = spawnSync('node', [path.join(bundleDir, 'scripts', 'build-runtime.cjs')], {
  cwd: path.resolve(bundleDir, '..', '..'),
  stdio: 'inherit',
})

if (build.status !== 0) {
  process.exit(build.status || 1)
}

const check = spawnSync('node', [path.join(bundleDir, 'scripts', 'check-runtime.cjs')], {
  cwd: path.resolve(bundleDir, '..', '..'),
  stdio: 'inherit',
})

process.exit(check.status || 0)
