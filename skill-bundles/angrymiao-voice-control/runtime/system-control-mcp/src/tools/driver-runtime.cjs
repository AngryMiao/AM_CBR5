const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function resolveKeyboardDriverWorkingDirectory(baseDir = os.tmpdir()) {
  return path.join(baseDir, 'angrymiao-voice-control', 'driver-runtime')
}

function ensureKeyboardDriverWorkingDirectory(baseDir = os.tmpdir()) {
  const workingDirectory = resolveKeyboardDriverWorkingDirectory(baseDir)
  fs.mkdirSync(workingDirectory, { recursive: true })
  return workingDirectory
}

function resolveKeyboardHeldKeysPath(baseDir = os.tmpdir()) {
  return path.join(resolveKeyboardDriverWorkingDirectory(baseDir), 'held-keys.json')
}

function loadKeyboardHeldKeys(baseDir = os.tmpdir()) {
  const statePath = resolveKeyboardHeldKeysPath(baseDir)
  if (!fs.existsSync(statePath)) {
    return []
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8'))
    return Array.isArray(parsed)
      ? parsed.map((key) => String(key || '').trim()).filter(Boolean)
      : []
  } catch {
    return []
  }
}

function saveKeyboardHeldKeys(keys, baseDir = os.tmpdir()) {
  const workingDirectory = ensureKeyboardDriverWorkingDirectory(baseDir)
  const statePath = resolveKeyboardHeldKeysPath(baseDir)
  const normalizedKeys = Array.isArray(keys)
    ? keys.map((key) => String(key || '').trim()).filter(Boolean)
    : []

  fs.mkdirSync(workingDirectory, { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(normalizedKeys, null, 2), 'utf-8')
}

function clearKeyboardHeldKeys(baseDir = os.tmpdir()) {
  const statePath = resolveKeyboardHeldKeysPath(baseDir)
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath, { force: true })
  }
}

module.exports = {
  clearKeyboardHeldKeys,
  ensureKeyboardDriverWorkingDirectory,
  loadKeyboardHeldKeys,
  resolveKeyboardDriverWorkingDirectory,
  saveKeyboardHeldKeys,
}
