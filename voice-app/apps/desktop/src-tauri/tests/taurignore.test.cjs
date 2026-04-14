const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const taurignorePath = path.resolve(__dirname, '../.taurignore')

test('tauri dev ignores generated logs under src-tauri', () => {
  const taurignore = fs.readFileSync(taurignorePath, 'utf-8')

  assert.match(taurignore, /^logs\/$/m)
})
