import { useMemo } from 'react'
import { KeyboardShortcutRecorder } from './KeyboardShortcutRecorder'
import {
  defaultHotkeyToRecordedKeys,
  formatDefaultHotkeyRecordedKeys,
  recordedKeysToDefaultHotkey,
} from './defaultHotkey'

type DefaultHotkeyRecorderProps = {
  value: string
  onChange: (value: string) => void
  inputClassName?: string
  inputAriaInvalid?: boolean
}

export function DefaultHotkeyRecorder({
  value,
  onChange,
  inputClassName,
  inputAriaInvalid,
}: DefaultHotkeyRecorderProps) {
  const recordedKeys = useMemo(() => defaultHotkeyToRecordedKeys(value), [value])

  return (
    <KeyboardShortcutRecorder
      value={recordedKeys}
      onChange={(nextRecordedKeys) =>
        onChange(recordedKeysToDefaultHotkey(nextRecordedKeys))
      }
      formatValue={formatDefaultHotkeyRecordedKeys}
      buttonLabel="录制默认热键"
      placeholder="RightAlt"
      recordingPlaceholder="请按住默认热键..."
      inputClassName={inputClassName}
      inputAriaInvalid={inputAriaInvalid}
    />
  )
}
