import { buildKeyCodes, getDefaultKeyboardShortcuts, KEY_CATEGORIES } from '@shared/defaults/keyboard-shortcuts'
import type { KeyboardShortcut } from '@shared/types/voice'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import platform from '@/platform'

const HID_KEY_DISPLAY: Record<string, string> = {
  CtrlLeft: 'Ctrl',
  CmdLeft: 'Cmd/Win',
  ShiftLeft: 'Shift',
  AltLeft: 'Alt',
  Num0: '0',
  Num1: '1',
  Num2: '2',
  Num3: '3',
  Num4: '4',
  Num5: '5',
  Num6: '6',
  Num7: '7',
  Num8: '8',
  Num9: '9',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  PrintScreen: 'PrtScr',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Apostrophe: "'",
  Grave: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Minus: '-',
  Equal: '=',
}

const HID_CATEGORY_NAMES: Record<string, string> = {
  modifiers: '修饰键',
  letters: '字母',
  numbers: '数字',
  function: 'F键',
  arrows: '方向',
  special: '特殊',
  punctuation: '标点',
}

const MAX_COMBO_KEYS = 7

function getHIDKeyLabel(key: string): string {
  return HID_KEY_DISPLAY[key] || key
}

function KeyComboBuilder({ slots, onChange }: { slots: string[]; onChange: (slots: string[]) => void }) {
  const [showPicker, setShowPicker] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('modifiers')
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPicker) {
      return
    }
    const handler = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showPicker])

  const toggleKey = (key: string) => {
    if (slots.includes(key)) {
      onChange(slots.filter((item) => item !== key))
      return
    }
    if (slots.length < MAX_COMBO_KEYS) {
      onChange([...slots, key])
    }
  }

  return (
    <div className="relative space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {slots.map((key) => (
          <span
            key={key}
            className="inline-flex items-center gap-0.5 rounded border border-blue-300 bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:border-blue-700 dark:bg-blue-900 dark:text-blue-200"
          >
            {getHIDKeyLabel(key)}
            <button type="button" onClick={() => onChange(slots.filter((_, itemIndex) => itemIndex !== index))}>
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={slots.length >= MAX_COMBO_KEYS}
          onClick={() => setShowPicker(!showPicker)}
          className="rounded border px-2 py-0.5 text-xs hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-gray-700"
        >
          + 添加键
        </button>
      </div>

      {slots.length > 0 && <p className="text-xs text-gray-400">{buildKeyCodes(slots).join(', ')}</p>}

      {showPicker && (
        <div
          ref={pickerRef}
          className="absolute left-0 top-full z-50 mt-1 min-w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-600 dark:bg-gray-800"
        >
          <div className="mb-2 flex flex-wrap gap-1">
            {(Object.keys(KEY_CATEGORIES) as Array<keyof typeof KEY_CATEGORIES>).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded px-2 py-0.5 text-xs ${
                  activeCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600'
                }`}
              >
                {HID_CATEGORY_NAMES[category] || category}
              </button>
            ))}
          </div>
          <div className="flex max-w-72 flex-wrap gap-1">
            {KEY_CATEGORIES[activeCategory as keyof typeof KEY_CATEGORIES]?.map((key) => (
              <button
                key={key}
                type="button"
                disabled={slots.length >= MAX_COMBO_KEYS && !slots.includes(key)}
                onClick={() => toggleKey(key)}
                className={`min-w-8 rounded border px-2 py-1 text-xs ${
                  slots.includes(key)
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-200 dark:border-gray-500 dark:bg-gray-700 dark:hover:bg-gray-600'
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {getHIDKeyLabel(key)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
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
  const [newName, setNewName] = useState('')
  const [newTriggerWords, setNewTriggerWords] = useState('')
  const [newSlots, setNewSlots] = useState<string[]>([])

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
    if (!newName.trim() || !newTriggerWords.trim() || newSlots.length === 0) {
      return
    }
    const entry: KeyboardShortcut = {
      id: `ks_custom_${Date.now()}`,
      name: newName.trim(),
      triggerWords: newTriggerWords
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      keyCodes: buildKeyCodes(newSlots),
      enabled: true,
    }
    onKeyboardShortcutsChange([...keyboardShortcuts, entry])
    setNewName('')
    setNewTriggerWords('')
    setNewSlots([])
    setAddingNew(false)
  }, [keyboardShortcuts, newName, newSlots, newTriggerWords, onKeyboardShortcutsChange])

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

        <div className="space-y-1">
          {keyboardShortcuts.map((shortcut) => (
            <div key={shortcut.id} className="rounded-lg border dark:border-gray-700">
              <div
                className="flex cursor-pointer items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => setExpandedId(expandedId === shortcut.id ? null : shortcut.id)}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={shortcut.enabled}
                    onChange={(event) => {
                      event.stopPropagation()
                      updateShortcut(shortcut.id, { enabled: event.target.checked })
                    }}
                    onClick={(event) => event.stopPropagation()}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-medium">{shortcut.name}</span>
                  <span className="text-xs text-gray-500">{shortcut.triggerWords.join(' / ')}</span>
                </div>
                <span className="text-xs text-gray-400">{expandedId === shortcut.id ? '▲' : '▼'}</span>
              </div>

              {expandedId === shortcut.id && (
                <div className="space-y-2 border-t p-3 dark:border-gray-700">
                  <div>
                    <label className="text-xs text-gray-500">{t('名称')}</label>
                    <input
                      type="text"
                      value={shortcut.name}
                      onChange={(event) => updateShortcut(shortcut.id, { name: event.target.value })}
                      className="w-full rounded border p-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">{t('触发词（逗号分隔）')}</label>
                    <input
                      type="text"
                      value={shortcut.triggerWords.join(', ')}
                      onChange={(event) =>
                        updateShortcut(shortcut.id, {
                          triggerWords: event.target.value
                            .split(/[,，]/)
                            .map((item) => item.trim())
                            .filter(Boolean),
                        })
                      }
                      className="w-full rounded border p-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">{t('Key Codes')}</label>
                    <input
                      type="text"
                      value={shortcut.keyCodes.join(', ')}
                      readOnly
                      className="w-full rounded border bg-gray-50 p-1.5 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900"
                    />
                  </div>
                  {shortcut.id.startsWith('ks_custom_') && (
                    <button
                      onClick={() => removeShortcut(shortcut.id)}
                      className="rounded bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
                    >
                      {t('删除')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {addingNew && (
          <div className="space-y-2 rounded-lg border p-3 dark:border-gray-700">
            <div>
              <label className="text-xs text-gray-500">{t('名称')}</label>
              <input
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={t('如：截图') || ''}
                className="w-full rounded border p-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('触发词（逗号分隔）')}</label>
              <input
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
                <KeyComboBuilder slots={newSlots} onChange={setNewSlots} />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addShortcut}
                disabled={!newName.trim() || !newTriggerWords.trim() || newSlots.length === 0}
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
