const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const runtimeBundlePath = path.resolve(__dirname, '../../dist/index.js')

test('built runtime bundle keeps external driver working directory safeguards', () => {
  const bundle = fs.readFileSync(runtimeBundlePath, 'utf-8')

  assert.match(bundle, /ensureKeyboardDriverWorkingDirectory/)
  assert.match(bundle, /cwd:\s*workingDirectory/)
})
