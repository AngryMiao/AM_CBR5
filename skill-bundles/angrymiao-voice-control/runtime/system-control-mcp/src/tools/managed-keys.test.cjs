const test = require('node:test')
const assert = require('node:assert/strict')

const { planManagedKeyboardAction } = require('./managed-keys.cjs')

test('hold only presses keys that are not already held', () => {
  assert.deepEqual(
    planManagedKeyboardAction({
      action: 'hold',
      recordedKeys: ['ShiftLeft', 'KeyA'],
      heldKeys: ['ShiftLeft'],
    }),
    {
      effectiveAction: 'down',
      effectiveRecordedKeys: ['KeyA'],
      nextHeldKeys: ['ShiftLeft', 'KeyA'],
      noop: false,
    }
  )
})

test('up releases requested keys and removes them from held state', () => {
  assert.deepEqual(
    planManagedKeyboardAction({
      action: 'up',
      recordedKeys: ['ShiftLeft'],
      heldKeys: ['ShiftLeft', 'KeyA'],
    }),
    {
      effectiveAction: 'up',
      effectiveRecordedKeys: ['ShiftLeft'],
      nextHeldKeys: ['KeyA'],
      noop: false,
    }
  )
})

test('reset releases all held keys and clears managed state', () => {
  assert.deepEqual(
    planManagedKeyboardAction({
      action: 'reset',
      recordedKeys: [],
      heldKeys: ['ShiftLeft', 'KeyA'],
    }),
    {
      effectiveAction: 'up',
      effectiveRecordedKeys: ['ShiftLeft', 'KeyA'],
      nextHeldKeys: [],
      noop: false,
    }
  )
})

test('reset becomes a no-op when no managed keys are active', () => {
  assert.deepEqual(
    planManagedKeyboardAction({
      action: 'reset',
      recordedKeys: [],
      heldKeys: [],
    }),
    {
      effectiveAction: 'up',
      effectiveRecordedKeys: [],
      nextHeldKeys: [],
      noop: true,
    }
  )
})
