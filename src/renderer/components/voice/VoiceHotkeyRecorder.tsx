import { doesVoiceHotkeyConflict, normalizeRecordedVoiceHotkey, normalizeStoredVoiceHotkey } from '@shared/voice-hotkey'
import { useEffect, useRef, useState } from 'react'

export function VoiceHotkeyRecorder(props: {
  value: string
  onChange: (value: string) => void
  shortcuts?: {
    quickToggle?: string
    inputBoxSendMessage?: string
  }
}) {
  const { value, onChange, shortcuts } = props
  const [isRecording, setIsRecording] = useState(false)
  const [displayValue, setDisplayValue] = useState(() => normalizeStoredVoiceHotkey(value))
  const [error, setError] = useState('')
  const pressedCodesRef = useRef(new Set<string>())
  const recordingRef = useRef(false)

  const stopRecording = (nextValue?: string, nextError?: string) => {
    recordingRef.current = false
    pressedCodesRef.current.clear()
    setIsRecording(false)
    if (nextValue !== undefined) {
      setDisplayValue(nextValue)
    }
    setError(nextError || '')
  }

  useEffect(() => {
    setDisplayValue(normalizeStoredVoiceHotkey(value))
  }, [value])

  useEffect(() => {
    if (!isRecording) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!recordingRef.current) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (event.code === 'Escape') {
        stopRecording(normalizeStoredVoiceHotkey(value))
        return
      }

      if (event.code === 'Backspace') {
        onChange('')
        stopRecording('')
        return
      }

      pressedCodesRef.current.add(event.code)
      const normalized = normalizeRecordedVoiceHotkey([...pressedCodesRef.current])
      if (normalized) {
        setDisplayValue(normalized)
        setError('')
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!recordingRef.current) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (!pressedCodesRef.current.has(event.code)) {
        return
      }

      const normalized = normalizeRecordedVoiceHotkey([...pressedCodesRef.current])

      if (normalized) {
        if (doesVoiceHotkeyConflict(normalized, shortcuts || {})) {
          stopRecording(normalizeStoredVoiceHotkey(value), '该快捷键与现有快捷键冲突')
          return
        }

        onChange(normalized)
        stopRecording(normalized)
        return
      }

      pressedCodesRef.current.delete(event.code)
      if (pressedCodesRef.current.size === 0) {
        stopRecording(normalizeStoredVoiceHotkey(value))
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [isRecording, onChange, shortcuts, value])

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={displayValue}
          className="flex-1 p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
          placeholder="RightAlt"
        />
        <button
          type="button"
          onClick={() => {
            recordingRef.current = true
            pressedCodesRef.current.clear()
            setError('')
            setIsRecording(true)
            setDisplayValue('请按下快捷键...')
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          录制
        </button>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {!error ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">支持单键或组合键，精确区分 Left / Right。</p>
      ) : null}
    </div>
  )
}
