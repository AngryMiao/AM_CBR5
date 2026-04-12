import { useState } from 'react'
import type { KeyboardShortcut } from '../../lib/tauri'
import { KeyboardShortcutRecorder } from './KeyboardShortcutRecorder'
import {
  buildKeyCodes,
  createCustomShortcut,
  formatRecordedKeys,
  getDefaultKeyboardShortcuts,
  hasStableHidMapping,
  parseTriggerWords,
} from './keyboardShortcuts'

const UNSTABLE_HID_MESSAGE = '该键当前没有稳定 HID 映射，执行可能失败。'

type KeyboardShortcutSettingsProps = {
  keyboardDriverPath: string
  keyboardShortcuts: KeyboardShortcut[]
  onKeyboardDriverPathChange: (value: string) => void
  onKeyboardShortcutsChange: (value: KeyboardShortcut[]) => void
}

export function KeyboardShortcutSettings({
  keyboardDriverPath,
  keyboardShortcuts,
  onKeyboardDriverPathChange,
  onKeyboardShortcutsChange,
}: KeyboardShortcutSettingsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [newTriggerWords, setNewTriggerWords] = useState('')
  const [newRecordedKeys, setNewRecordedKeys] = useState<string[]>([])

  function updateShortcut(id: string, patch: Partial<KeyboardShortcut>) {
    onKeyboardShortcutsChange(
      keyboardShortcuts.map((shortcut) =>
        shortcut.id === id ? { ...shortcut, ...patch } : shortcut,
      ),
    )
  }

  function removeShortcut(id: string) {
    onKeyboardShortcutsChange(
      keyboardShortcuts.filter((shortcut) => shortcut.id !== id),
    )
    if (expandedId === id) {
      setExpandedId(null)
    }
  }

  function addShortcut() {
    const triggerWords = parseTriggerWords(newTriggerWords)
    if (triggerWords.length === 0 || newRecordedKeys.length === 0) {
      return
    }

    onKeyboardShortcutsChange([
      ...keyboardShortcuts,
      createCustomShortcut(triggerWords, newRecordedKeys),
    ])
    setNewTriggerWords('')
    setNewRecordedKeys([])
    setAddingNew(false)
  }

  return (
    <section className="shortcut-settings">
      <div className="shortcut-settings-header">
        <h3>键盘控制</h3>
        <div className="settings-inline-actions">
          <button type="button" onClick={() => setAddingNew(true)}>
            添加快捷键
          </button>
          <button
            type="button"
            onClick={() => onKeyboardShortcutsChange(getDefaultKeyboardShortcuts())}
          >
            恢复默认
          </button>
        </div>
      </div>

      <div className="settings-field-row">
        <div className="settings-field-row-label">
          <label className="settings-field-title">键盘驱动路径</label>
        </div>
        <div className="settings-field-row-input">
          <input
            aria-label="键盘驱动路径"
            placeholder="可选，自定义 AIKeyBoardDriver.exe 绝对路径"
            value={keyboardDriverPath}
            onChange={(event) => onKeyboardDriverPathChange(event.target.value)}
          />
        </div>
      </div>

      <div className="shortcut-list">
        {keyboardShortcuts.map((shortcut) => {
          const displayKeys = formatRecordedKeys(shortcut.recorded_keys)
          const showWarning =
            shortcut.recorded_keys.length > 0 &&
            !hasStableHidMapping(shortcut.recorded_keys)

          return (
            <article key={shortcut.id} className="shortcut-card">
              <button
                className="shortcut-card-summary"
                type="button"
                onClick={() =>
                  setExpandedId(expandedId === shortcut.id ? null : shortcut.id)
                }
              >
                <div className="shortcut-card-main">
                  <label className="shortcut-enabled">
                    <input
                      checked={shortcut.enabled}
                      type="checkbox"
                      onChange={(event) => {
                        event.stopPropagation()
                        updateShortcut(shortcut.id, { enabled: event.target.checked })
                      }}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <span>{shortcut.trigger_words.join(' / ')}</span>
                  </label>
                  <p>{displayKeys || '未录制快捷键'}</p>
                  {showWarning ? (
                    <small className="shortcut-warning">{UNSTABLE_HID_MESSAGE}</small>
                  ) : null}
                </div>
                <span className="shortcut-expand-indicator">
                  {expandedId === shortcut.id ? '收起' : '展开'}
                </span>
              </button>

              {expandedId === shortcut.id ? (
                <div className="shortcut-card-editor">
                  <div className="settings-field-row">
                    <div className="settings-field-row-label">
                      <label className="settings-field-title">触发词（逗号分隔）</label>
                    </div>
                    <div className="settings-field-row-input">
                      <input
                        type="text"
                        value={shortcut.trigger_words.join(', ')}
                        onChange={(event) =>
                          updateShortcut(shortcut.id, {
                            trigger_words: parseTriggerWords(event.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="settings-field-row">
                    <div className="settings-field-row-label">
                      <label className="settings-field-title">按键组合</label>
                    </div>
                    <div className="settings-field-row-input">
                      <KeyboardShortcutRecorder
                        value={shortcut.recorded_keys}
                        onChange={(recordedKeys) =>
                          updateShortcut(shortcut.id, {
                            recorded_keys: recordedKeys,
                            key_codes: buildKeyCodes(recordedKeys),
                          })
                        }
                      />
                    </div>
                  </div>
                  {shortcut.id.startsWith('ks_custom_') ? (
                    <div className="shortcut-card-actions">
                      <button type="button" onClick={() => removeShortcut(shortcut.id)}>
                        删除
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      {addingNew ? (
        <div className="shortcut-create">
