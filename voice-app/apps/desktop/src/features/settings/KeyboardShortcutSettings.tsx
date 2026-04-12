import { useState } from 'react'
import type { KeyboardShortcut } from '../../lib/tauri'
import { pickFile } from '../../lib/tauri'
import { KeyboardShortcutRecorder } from './KeyboardShortcutRecorder'
import {
  buildKeyCodes,
  createCustomShortcut,
  formatRecordedKeys,
  getDefaultKeyboardShortcuts,
  hasStableHidMapping,
  parseTriggerWords,
} from './keyboardShortcuts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Trash2,
  AlertCircle,
  FolderOpen,
} from 'lucide-react'

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
    <>
      {/* Keyboard Driver Path */}
      <div className="settings-input-card">
        <span className="settings-input-title">键盘驱动路径</span>
        <div className="settings-path-input-row">
          <Input
            aria-label="键盘驱动路径"
            className="settings-path-input"
            placeholder="可选，自定义 AIKeyBoardDriver.exe 绝对路径"
            value={keyboardDriverPath}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => onKeyboardDriverPathChange(event.target.value)}
          />
          <Button
            variant="outline"
            type="button"
            className="settings-path-btn"
            onClick={() => {
              void pickFile('选择键盘驱动程序', [{ name: '可执行文件', extensions: ['exe', 'app'] }]).then((path) => {
                if (path) {
                  onKeyboardDriverPathChange(path)
                }
              })
            }}
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Keyboard Shortcuts Section */}
      <div className="settings-shortcuts-section">
        {/* Section Header */}
        <div className="settings-shortcuts-header">
          <span className="settings-shortcuts-title">快捷键映射</span>
          <div className="settings-shortcuts-actions">
            <Button
              variant="outline"
              type="button"
              className="settings-shortcuts-btn"
              onClick={() => setAddingNew(true)}
            >
              <Plus className="h-4 w-4" />
              添加
            </Button>
            <Button
              variant="outline"
              type="button"
              className="settings-shortcuts-btn"
              onClick={() => onKeyboardShortcutsChange(getDefaultKeyboardShortcuts())}
            >
              <RotateCcw className="h-4 w-4" />
              默认
            </Button>
          </div>
        </div>

        {/* Shortcut List */}
        <div className="settings-shortcuts-list">
          {keyboardShortcuts.map((shortcut) => {
            const displayKeys = formatRecordedKeys(shortcut.recorded_keys)
            const showWarning =
              shortcut.recorded_keys.length > 0 &&
              !hasStableHidMapping(shortcut.recorded_keys)

            return (
              <div key={shortcut.id} className="settings-shortcut-item">
                <button
                  className="settings-shortcut-summary"
                  type="button"
                  onClick={() =>
                    setExpandedId(expandedId === shortcut.id ? null : shortcut.id)
                  }
                >
                  <div className="settings-shortcut-main">
                    <label className="settings-shortcut-enabled">
                      <input
                        checked={shortcut.enabled}
                        type="checkbox"
                        onChange={(event) => {
                          event.stopPropagation()
                          updateShortcut(shortcut.id, { enabled: event.target.checked })
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <span className="settings-shortcut-words">{shortcut.trigger_words.join(' / ')}</span>
                    </label>
                    <span className="settings-shortcut-keys">{displayKeys || '未录制'}</span>
                    {showWarning ? (
                      <span className="settings-shortcut-warning">
                        <AlertCircle className="h-3 w-3" />
                      </span>
                    ) : null}
                  </div>
                  {expandedId === shortcut.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>

                {expandedId === shortcut.id ? (
                  <div className="settings-shortcut-editor">
                    <div className="settings-shortcut-row">
                      <span className="settings-shortcut-label">触发词</span>
                      <Input
                        className="settings-shortcut-input"
                        type="text"
                        value={shortcut.trigger_words.join(', ')}
                        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                          updateShortcut(shortcut.id, {
                            trigger_words: parseTriggerWords(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="settings-shortcut-row">
                      <span className="settings-shortcut-label">按键组合</span>
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
                      <Button
                        variant="outline"
                        type="button"
                        className="settings-shortcut-delete"
                        onClick={() => removeShortcut(shortcut.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Add New Shortcut */}
        {addingNew ? (
          <div className="settings-shortcut-create">
            <div className="settings-shortcut-row">
              <span className="settings-shortcut-label">触发词</span>
              <Input
                className="settings-shortcut-input"
                placeholder="如：截图，截屏"
                type="text"
                value={newTriggerWords}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setNewTriggerWords(event.target.value)}
              />
            </div>
            <div className="settings-shortcut-row">
              <span className="settings-shortcut-label">按键组合</span>
              <KeyboardShortcutRecorder
                value={newRecordedKeys}
                onChange={setNewRecordedKeys}
              />
            </div>
            {newRecordedKeys.length > 0 && !hasStableHidMapping(newRecordedKeys) ? (
              <div className="settings-shortcut-warning-row">
                <AlertCircle className="h-3 w-3" />
                <span>{UNSTABLE_HID_MESSAGE}</span>
              </div>
            ) : null}
            <div className="settings-shortcut-create-actions">
              <Button
                type="button"
                className="settings-shortcut-confirm"
                disabled={
                  parseTriggerWords(newTriggerWords).length === 0 ||
                  newRecordedKeys.length === 0
                }
                onClick={addShortcut}
              >
                确认添加
              </Button>
              <Button
                variant="outline"
                type="button"
                onClick={() => setAddingNew(false)}
              >
                取消
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}
