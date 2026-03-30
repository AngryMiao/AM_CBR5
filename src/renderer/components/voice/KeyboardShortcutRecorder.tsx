import { getRecordedKeyDisplayLabel, orderRecordedKeys } from '@shared/voice-key-reference'
import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_RECORDED_KEYS = 6

function formatRecordedKeys(keys: string[]): string {
  return orderRecordedKeys(keys)
    .map((code) => getRecordedKeyDisplayLabel(code))
    .join(' + ')
}

type KeyboardShortcutRecorderProps = {
  value?: string[]
  onChange: (recordedKeys: string[]) => void
}

export function KeyboardShortcutRecorder(props: KeyboardShortcutRecorderProps) {
  const { value = [], onChange } = props
  const [isRecording, setIsRecording] = useState(false)
  const [displayValue, setDisplayValue] = useState(() => formatRecordedKeys(value))
  const [error, setError] = useState('')
  const pressedCodesRef = useRef(new Set<string>())
  const previousValueRef = useRef<string[]>(value)
  const recordingRef = useRef(false)

  const stopRecording = useCallback((nextKeys?: string[], nextError = '') => {
    recordingRef.current = false
    pressedCodesRef.current.clear()
    setIsRecording(false)
    setError(nextError)
    setDisplayValue(formatRecordedKeys(nextKeys ?? previousValueRef.current))
  }, [])

  useEffect(() => {
    previousValueRef.current = value
    if (!recordingRef.current) {
      setDisplayValue(formatRecordedKeys(value))
    }
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
        stopRecording(previousValueRef.current)
        return
      }

      if (event.code === 'Backspace') {
        onChange([])
        stopRecording([])
        return
      }

      if (!pressedCodesRef.current.has(event.code) && pressedCodesRef.current.size >= MAX_RECORDED_KEYS) {
        setError('最多录制 6 个键')
        return
      }

      pressedCodesRef.current.add(event.code)
      setError('')
      setDisplayValue(formatRecordedKeys([...pressedCodesRef.current]))
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!recordingRef.current || !pressedCodesRef.current.has(event.code)) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      // 任意一个已录制键抬起时，按当前组合直接提交并结束录制。
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
  }, [isRecording, onChange, stopRecording])

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          readOnly
          value={displayValue}
          placeholder="CtrlLeft + V"
          className="flex-1 rounded-lg border p-2 dark:border-gray-700 dark:bg-gray-800"
        />
        <button
          type="button"
          onClick={() => {
            previousValueRef.current = value
            recordingRef.current = true
            pressedCodesRef.current.clear()
            setError('')
            setIsRecording(true)
            setDisplayValue('请按下快捷键...')
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          录制
        </button>
      </div>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {!error ? <p className="text-xs text-gray-500 dark:text-gray-400">支持最多 6 个键的组合录制。</p> : null}
    </div>
  )
}
