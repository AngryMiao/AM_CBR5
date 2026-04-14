const path = require('node:path')
const { spawnSync } = require('node:child_process')

const rootDir = path.resolve(__dirname, '../../..')
const runtimeDir = path.join(rootDir, 'skill-bundles', 'angrymiao-voice-control', 'runtime', 'system-control-mcp')
const packageJsonPath = path.join(runtimeDir, 'package.json')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
  })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

run('node', [path.join(rootDir, 'scripts', 'ensure-skill-runtime-deps.cjs'), packageJsonPath])
run('node', [
  path.join(rootDir, 'scripts', 'run-local-bin.cjs'),
  'esbuild',
  path.join(runtimeDir, 'src', 'index.ts'),
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--target=node20',
  `--outfile=${path.join(runtimeDir, 'dist', 'index.js')}`,
])
