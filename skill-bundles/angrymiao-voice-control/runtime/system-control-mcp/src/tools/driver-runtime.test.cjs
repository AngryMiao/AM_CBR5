const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  clearKeyboardHeldKeys,
  ensureKeyboardDriverWorkingDirectory,
  loadKeyboardHeldKeys,
  resolveKeyboardDriverWorkingDirectory,
  saveKeyboardHeldKeys,
} = require('./driver-runtime.cjs')

test('resolves keyboard driver working directory under temp root', () => {
  const workingDirectory = resolveKeyboardDriverWorkingDirectory()

  assert.ok(
    workingDirectory.startsWith(path.join(os.tmpdir(), path.sep)) ||
      workingDirectory === os.tmpdir() ||
      workingDirectory.startsWith(os.tmpdir()),
    `expected ${workingDirectory} to be inside ${os.tmpdir()}`
  )
  assert.doesNotMatch(workingDirectory, /src-tauri[\\/]+logs/i)
  assert.doesNotMatch(workingDirectory, /skill-bundles[\\/]+angrymiao-voice-control/i)
})

test('creates keyboard driver working directory when ensuring it', async (t) => {
  const tempRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'voice-app-driver-runtime-test-')
  )
  t.after(() => fs.promises.rm(tempRoot, { recursive: true, force: true }))

  const workingDirectory = ensureKeyboardDriverWorkingDirectory(tempRoot)

  assert.ok(fs.existsSync(workingDirectory))
  assert.ok(fs.statSync(workingDirectory).isDirectory())
  assert.equal(
    workingDirectory,
    path.join(tempRoot, 'angrymiao-voice-control', 'driver-runtime')
  )
})

test('persists and clears managed held keys inside driver runtime directory', async (t) => {
  const tempRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'voice-app-held-keys-test-')
  )
  t.after(() => fs.promises.rm(tempRoot, { recursive: true, force: true }))

  assert.deepEqual(loadKeyboardHeldKeys(tempRoot), [])

  saveKeyboardHeldKeys(['ShiftLeft', 'KeyA'], tempRoot)
  assert.deepEqual(loadKeyboardHeldKeys(tempRoot), ['ShiftLeft', 'KeyA'])

  clearKeyboardHeldKeys(tempRoot)
  assert.deepEqual(loadKeyboardHeldKeys(tempRoot), [])
})
