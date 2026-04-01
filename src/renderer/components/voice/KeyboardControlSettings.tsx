import { getDefaultKeyboardShortcuts } from '@shared/defaults/keyboard-shortcuts'
import type { KeyboardShortcut } from '@shared/types/voice'
import { getRecordedKeyDisplayLabel, hasStableHidMapping, orderRecordedKeys } from '@shared/voice-key-reference'
import { useCallback, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import platform from '@/platform'
import { KeyboardShortcutRecorder } from './KeyboardShortcutRecorder'

const UNSTABLE_HID_MESSAGE = '该键当前没有稳定 HID 映射，执行可能失败'

function parseTriggerWords(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatRecordedKeys(keys?: string[]): string {
  return orderRecordedKeys(keys || [])
    .map((code) => getRecordedKeyDisplayLabel(code))
    .join(' + ')
}

function hasUnstableRecordedKeys(shortcut: KeyboardShortcut): boolean {
  return !!shortcut.recordedKeys?.length && !hasStableHidMapping(shortcut.recordedKeys)
}

type KeyboardControlSettingsProps = {
  keyboardDriverPath?: string
  keyboardShortcuts?: KeyboardShortcut[]
  onKeyboardDriverPathChange: (keyboardDriverPath?: string) => void
  onKeyboardShortcutsChange: (keyboardShortcuts: KeyboardShortcut[]) => void
}

export function KeyboardControlSettings(props: KeyboardControlSettingsProps) {
  const { keyboardDriverPath, keyboardShortcuts = [], onKeyboardDriverPathChange, onKeyboardShortcutsChange } = props
  const { t } = useTranslation()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [newTriggerWords, setNewTriggerWords] = useState('')
  const [newRecordedKeys, setNewRecordedKeys] = useState<string[]>([])
  const newShortcutTriggerWordsId = useId()

  const handleDriverPathSelect = useCallback(async () => {
    const result = (await window.electronAPI?.invoke('dialog:openFile', {
      filters: [{ name: 'Executable', extensions: ['exe'] }],
      properties: ['openFile'],
    })) as { canceled?: boolean; filePaths?: string[] } | undefined

    if (!result?.canceled && result?.filePaths?.[0]) {
      onKeyboardDriverPathChange(result.filePaths[0])
    }
  }, [onKeyboardDriverPathChange])

  const updateShortcut = useCallback(
    (id: string, patch: Partial<KeyboardShortcut>) => {
      onKeyboardShortcutsChange(
        keyboardShortcuts.map((shortcut) => (shortcut.id === id ? { ...shortcut, ...patch } : shortcut))
      )
    },
    [keyboardShortcuts, onKeyboardShortcutsChange]
  )

  const removeShortcut = useCallback(
    (id: string) => {
      onKeyboardShortcutsChange(keyboardShortcuts.filter((shortcut) => shortcut.id !== id))
      if (expandedId === id) {
        setExpandedId(null)
      }
    },
    [expandedId, keyboardShortcuts, onKeyboardShortcutsChange]
  )

  const addShortcut = useCallback(() => {
    if (!newTriggerWords.trim() || newRecordedKeys.length === 0) {
      return
    }

    const entry: KeyboardShortcut = {
      id: `ks_custom_${Date.now()}`,
      triggerWords: parseTriggerWords(newTriggerWords),
      recordedKeys: orderRecordedKeys(newRecordedKeys),
      keyCodes: [],
      enabled: true,
    }

    onKeyboardShortcutsChange([...keyboardShortcuts, entry])
    setNewTriggerWords('')
    setNewRecordedKeys([])
    setAddingNew(false)
  }, [keyboardShortcuts, newRecordedKeys, newTriggerWords, onKeyboardShortcutsChange])

  const resetDefaults = useCallback(async () => {
    const platformType = await platform.getPlatform()
    onKeyboardShortcutsChange(getDefaultKeyboardShortcuts(platformType))
  }, [onKeyboardShortcutsChange])

  return (
    <>
      <div className="space-y-3">
        <label className="font-medium">{t('键盘控制驱动')}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={keyboardDriverPath || ''}
            readOnly
            placeholder={t('选择 driver.exe 文件') || ''}
            className="flex-1 rounded-lg border p-2 dark:border-gray-700 dark:bg-gray-800"
          />
          <button
            onClick={handleDriverPathSelect}
            className="rounded-lg bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
          >
            {t('浏览...')}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="font-medium">{t('键盘快捷键')}</label>
          <div className="flex gap-2">
            <button
              onClick={() => setAddingNew(true)}
              className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              {t('添加快捷键')}
            </button>
            <button
              onClick={resetDefaults}
              className="rounded-lg bg-gray-500 px-3 py-1 text-sm text-white hover:bg-gray-600"
            >
              {t('恢复默认')}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {keyboardShortcuts.map((shortcut) => {
            const unstableShortcut = hasUnstableRecordedKeys(shortcut)
            const displayKeys = shortcut.recordedKeys?.length ? formatRecordedKeys(shortcut.recordedKeys) : ''

            return (
              <div key={shortcut.id} className="rounded-lg border dark:border-gray-700">
                <div
                  className="flex cursor-pointer items-start justify-between gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setExpandedId(expandedId === shortcut.id ? null : shortcut.id)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={shortcut.enabled}
                      onChange={(event) => {
                        event.stopPropagation()
                        updateShortcut(shortcut.id, { enabled: event.target.checked })
                      }}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-1 h-4 w-4"
                    />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{shortcut.triggerWords.join(' / ')}</div>
                      {displayKeys ? <div className="text-xs text-gray-400">{displayKeys}</div> : null}
                      {unstableShortcut ? <div className="text-xs text-amber-600">{UNSTABLE_HID_MESSAGE}</div> : null}
                    </div>
                  </div>
                  <span className="pt-1 text-xs text-gray-400">{expandedId === shortcut.id ? '▲' : '▼'}</span>
                </div>

                {expandedId === shortcut.id && (
                  <div className="space-y-3 border-t p-3 dark:border-gray-700">
                    <div>
                      <label htmlFor={`${shortcut.id}-triggerWords`} className="text-xs text-gray-500">
                        {t('触发词（逗号分隔）')}
                      </label>
                      <input
                        id={`${shortcut.id}-triggerWords`}
                        type="text"
                        value={shortcut.triggerWords.join(', ')}
                        onChange={(event) =>
                          updateShortcut(shortcut.id, {
                            triggerWords: parseTriggerWords(event.target.value),
                          })
                        }
                        className="w-full rounded border p-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">{t('按键组合')}</label>
                      <div className="mt-1">
                        <KeyboardShortcutRecorder
                          value={shortcut.recordedKeys || []}
                          onChange={(recordedKeys) =>
                            updateShortcut(shortcut.id, {
                              recordedKeys,
                              keyCodes: [],
                            })
                          }
                        />
                      </div>
                      {unstableShortcut ? <p className="mt-1 text-xs text-amber-600">{UNSTABLE_HID_MESSAGE}</p> : null}
                    </div>
                    {shortcut.id.startsWith('ks_custom_') ? (
                      <button
                        onClick={() => removeShortcut(shortcut.id)}
                        className="rounded bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
                      >
                        {t('删除')}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {addingNew && (
          <div className="space-y-3 rounded-lg border p-3 dark:border-gray-700">
            <div>
              <label htmlFor={newShortcutTriggerWordsId} className="text-xs text-gray-500">
                {t('触发词（逗号分隔）')}
              </label>
              <input
                id={newShortcutTriggerWordsId}
                type="text"
                value={newTriggerWords}
                onChange={(event) => setNewTriggerWords(event.target.value)}
                placeholder={t('如：截图, 截屏') || ''}
                className="w-full rounded border p-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('按键组合')}</label>
              <div className="mt-1">
                <KeyboardShortcutRecorder value={newRecordedKeys} onChange={setNewRecordedKeys} />
              </div>
              {newRecordedKeys.length > 0 && !hasStableHidMapping(newRecordedKeys) ? (
                <p className="mt-1 text-xs text-amber-600">{UNSTABLE_HID_MESSAGE}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                onClick={addShortcut}
                disabled={!newTriggerWords.trim() || newRecordedKeys.length === 0}
                className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('确认添加')}
              </button>
              <button
                onClick={() => setAddingNew(false)}
                className="rounded-lg bg-gray-500 px-3 py-1 text-sm text-white hover:bg-gray-600"
              >
                {t('取消')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
