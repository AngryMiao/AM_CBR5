function uniqueKeys(keys) {
  const normalized = Array.isArray(keys)
    ? keys.map((key) => String(key || '').trim()).filter(Boolean)
    : []

  return normalized.filter((key, index) => normalized.indexOf(key) === index)
}

function mergeHeldKeys(currentKeys, nextKeys) {
  return [...uniqueKeys(currentKeys), ...uniqueKeys(nextKeys)].filter(
    (key, index, list) => list.indexOf(key) === index
  )
}

function removeHeldKeys(currentKeys, keysToRemove) {
  const removalSet = new Set(uniqueKeys(keysToRemove))
  return uniqueKeys(currentKeys).filter((key) => !removalSet.has(key))
}

function planManagedKeyboardAction({ action = 'tap', recordedKeys = [], heldKeys = [] }) {
  const requestedKeys = uniqueKeys(recordedKeys)
  const activeHeldKeys = uniqueKeys(heldKeys)

  switch (action) {
    case 'hold': {
      const effectiveRecordedKeys = requestedKeys.filter(
        (key) => !activeHeldKeys.includes(key)
      )
      return {
        effectiveAction: 'down',
        effectiveRecordedKeys,
        nextHeldKeys: mergeHeldKeys(activeHeldKeys, requestedKeys),
        noop: effectiveRecordedKeys.length === 0,
      }
    }
    case 'up':
      return {
        effectiveAction: 'up',
        effectiveRecordedKeys: requestedKeys,
        nextHeldKeys: removeHeldKeys(activeHeldKeys, requestedKeys),
        noop: requestedKeys.length === 0,
      }
    case 'reset':
      return {
        effectiveAction: 'up',
        effectiveRecordedKeys: activeHeldKeys,
        nextHeldKeys: [],
        noop: activeHeldKeys.length === 0,
      }
    default:
      return {
        effectiveAction: action,
        effectiveRecordedKeys: requestedKeys,
        nextHeldKeys: activeHeldKeys,
        noop: requestedKeys.length === 0,
      }
  }
}

module.exports = {
  planManagedKeyboardAction,
}
