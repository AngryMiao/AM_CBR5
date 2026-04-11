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

      <label className="settings-field settings-field-wide">
        <span>键盘驱动路径</span>
        <input
          aria-label="键盘驱动路径"
          placeholder="可选，自定义 AIKeyBoardDriver.exe 绝对路径"
          value={keyboardDriverPath}
          onChange={(event) => onKeyboardDriverPathChange(event.target.value)}
        />
      </label>

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
                  <label className="settings-field settings-field-wide">
                    <span>触发词（逗号分隔）</span>
                    <input
                      type="text"
                      value={shortcut.trigger_words.join(', ')}
                      onChange={(event) =>
                        updateShortcut(shortcut.id, {
                          trigger_words: parseTriggerWords(event.target.value),
                        })
                      }
                    />
                  </label>
                  <div className="settings-field settings-field-wide">
                    <span>按键组合</span>
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
          <label className="settings-field settings-field-wide">
            <span>触发词（逗号分隔）</span>
            <input
              placeholder="如：截图, 截屏"
              type="text"
              value={newTriggerWords}
              onChange={(event) => setNewTriggerWords(event.target.value)}
            />
          </label>
          <div className="settings-field settings-field-wide">
            <span>按键组合</span>
            <KeyboardShortcutRecorder
              value={newRecordedKeys}
              onChange={setNewRecordedKeys}
            />
          </div>
          {newRecordedKeys.length > 0 && !hasStableHidMapping(newRecordedKeys) ? (
            <p className="shortcut-warning">{UNSTABLE_HID_MESSAGE}</p>
          ) : null}
          <div className="shortcut-card-actions">
            <button
              disabled={
                parseTriggerWords(newTriggerWords).length === 0 ||
                newRecordedKeys.length === 0
              }
              type="button"
              onClick={addShortcut}
            >
              确认添加
            </button>
            <button type="button" onClick={() => setAddingNew(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
