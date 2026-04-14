const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function resolveDefaultRuntimeBaseDir() {
  if (process.platform === 'win32') {
    const appDataRoot = process.env.APPDATA || process.env.LOCALAPPDATA
    if (appDataRoot) {
      return appDataRoot
    }
  }

  return os.tmpdir()
}

function resolveKeyboardDriverWorkingDirectory(baseDir = resolveDefaultRuntimeBaseDir()) {
  return path.join(baseDir, 'angrymiao-voice-control', 'driver-runtime')
}

function ensureKeyboardDriverWorkingDirectory(baseDir = resolveDefaultRuntimeBaseDir()) {
  const workingDirectory = resolveKeyboardDriverWorkingDirectory(baseDir)
  fs.mkdirSync(workingDirectory, { recursive: true })
  return workingDirectory
}

function resolveKeyboardHeldKeysPath(baseDir = resolveDefaultRuntimeBaseDir()) {
  return path.join(resolveKeyboardDriverWorkingDirectory(baseDir), 'held-keys.json')
}

function loadKeyboardHeldKeys(baseDir = resolveDefaultRuntimeBaseDir()) {
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

function saveKeyboardHeldKeys(keys, baseDir = resolveDefaultRuntimeBaseDir()) {
  const workingDirectory = ensureKeyboardDriverWorkingDirectory(baseDir)
  const statePath = resolveKeyboardHeldKeysPath(baseDir)
  const normalizedKeys = Array.isArray(keys)
    ? keys.map((key) => String(key || '').trim()).filter(Boolean)
    : []

  fs.mkdirSync(workingDirectory, { recursive: true })
  fs.writeFileSync(statePath, JSON.stringify(normalizedKeys, null, 2), 'utf-8')
}

function clearKeyboardHeldKeys(baseDir = resolveDefaultRuntimeBaseDir()) {
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
