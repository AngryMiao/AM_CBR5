const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')
const { spawn } = require('node:child_process')

const runtimeBundlePath = path.resolve(__dirname, '../../dist/index.js')

test('built runtime bundle keeps external driver working directory safeguards', () => {
  const bundle = fs.readFileSync(runtimeBundlePath, 'utf-8')

  assert.match(bundle, /ensureKeyboardDriverWorkingDirectory/)
  assert.match(bundle, /cwd:\s*workingDirectory/)
})

test('built runtime bundle responds to MCP initialize over stdio', async (t) => {
  const child = spawn(process.execPath, [runtimeBundlePath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stderr = ''

  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  const responsePromise = new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: child.stdout })
    const timeout = setTimeout(() => {
      rl.close()
      reject(new Error(`runtime bundle initialize 响应超时。stderr=${stderr}`))
    }, 3000)

    rl.once('line', (line) => {
      clearTimeout(timeout)
      rl.close()
      resolve(JSON.parse(line))
    })

    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      rl.close()
      reject(
        new Error(
          `runtime bundle 提前退出。code=${code} signal=${signal} stderr=${stderr}`
        )
      )
    })
  })

  t.after(() => {
    if (!child.killed) {
      child.kill()
    }
  })

  child.stdin.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'runtime-bundle-sync-test',
          version: '0.1.0',
        },
      },
    }) + '\n'
  )

  const response = await responsePromise
  assert.equal(response.id, 1)
  assert.ok(response.result)
})
