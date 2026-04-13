const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveKeyboardRequest } = require('./shortcut-mapping.cjs')

test('resolves F5 into recordedKeys and keyCodes', () => {
  assert.deepEqual(resolveKeyboardRequest({ shortcut: 'F5' }), {
    recordedKeys: ['F5'],
    keyCodes: ['1107003E', '1007003E'],
  })
})

test('resolves Ctrl+S into recordedKeys and keyCodes', () => {
  assert.deepEqual(resolveKeyboardRequest({ shortcut: 'Ctrl+S' }), {
    recordedKeys: ['ControlLeft', 'KeyS'],
    keyCodes: ['110700E0', '11070016', '10070016', '100700E0'],
  })
})

test('rejects unknown shortcut tokens', () => {
  assert.throws(
    () => resolveKeyboardRequest({ shortcut: '刷新一下' }),
    /无法解析快捷键表达/
  )
})
