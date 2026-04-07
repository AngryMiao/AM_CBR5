import { useEffect, useRef, useState } from 'react'
import { formatRecordedKeys, orderRecordedKeys } from './keyboardShortcuts'

const MAX_RECORDED_KEYS = 6

type KeyboardShortcutRecorderProps = {
  value?: string[]
  onChange: (recordedKeys: string[]) => void
  formatValue?: (recordedKeys: string[]) => string
  buttonLabel?: string
  placeholder?: string
  recordingPlaceholder?: string
  inputClassName?: string
  inputAriaInvalid?: boolean
}

export function KeyboardShortcutRecorder({
  value = [],
  onChange,
  formatValue = formatRecordedKeys,
  buttonLabel = '录制',
  placeholder = 'CtrlLeft + V',
  recordingPlaceholder = '请按下快捷键...',
  inputClassName,
  inputAriaInvalid,
}: KeyboardShortcutRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [displayValue, setDisplayValue] = useState(() => formatValue(value))
  const [error, setError] = useState('')
  const pressedCodesRef = useRef(new Set<string>())
  const previousValueRef = useRef<string[]>(value)
  const recordingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    previousValueRef.current = value
    if (!recordingRef.current) {
      setDisplayValue(formatValue(value))
    }
  }, [formatValue, value])

  useEffect(() => {
    if (!isRecording) {
      return
    }

    inputRef.current?.focus()

    const stopRecording = (nextKeys?: string[], nextError = '') => {
      recordingRef.current = false
      pressedCodesRef.current.clear()
      setIsRecording(false)
      setError(nextError)
      setDisplayValue(formatValue(nextKeys ?? previousValueRef.current))
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!recordingRef.current) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (event.code === 'Escape') {
        stopRecording(previousValueRef.current)
        return
      }

      if (event.code === 'Backspace') {
        onChange([])
        stopRecording([])
        return
      }

      if (
        !pressedCodesRef.current.has(event.code) &&
        pressedCodesRef.current.size >= MAX_RECORDED_KEYS
      ) {
        setError('最多录制 6 个键')
        return
      }

      pressedCodesRef.current.add(event.code)
      setError('')
      setDisplayValue(formatValue([...pressedCodesRef.current]))
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!recordingRef.current || !pressedCodesRef.current.has(event.code)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const recordedKeys = orderRecordedKeys([...pressedCodesRef.current])
      onChange(recordedKeys)
      stopRecording(recordedKeys)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [formatValue, isRecording, onChange])

  return (
    <div className="shortcut-recorder">
      <div className="shortcut-recorder-row">
        <input
          ref={inputRef}
          readOnly
          aria-invalid={inputAriaInvalid}
          className={`shortcut-recorder-input ${inputClassName ?? ''}`.trim()}
          placeholder={placeholder}
          type="text"
          value={displayValue}
        />
        <button
          className="shortcut-recorder-button"
          type="button"
          onClick={() => {
            previousValueRef.current = value
            recordingRef.current = true
            pressedCodesRef.current.clear()
            setError('')
            setIsRecording(true)
            setDisplayValue(recordingPlaceholder)
          }}
        >
          {buttonLabel}
        </button>
      </div>
      {error ? (
        <p className="shortcut-recorder-error">{error}</p>
      ) : (
        <p className="shortcut-recorder-hint">支持最多 6 个键的组合录制。</p>
      )}
    </div>
  )
}
