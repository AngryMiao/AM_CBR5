import { useCallback, useEffect, useRef, useState } from 'react'

export type DefaultMicrophoneSelectProps = {
  value?: string
  onChange: (deviceId?: string) => void
}

// 用内部编码隔离系统默认项和真实设备，允许空 deviceId 被单独保存与回显。
const DEFAULT_OPTION_VALUE = JSON.stringify({ type: 'default' as const })

function encodeOptionValue(deviceId?: string): string {
  if (deviceId === undefined) {
    return DEFAULT_OPTION_VALUE
  }

  return JSON.stringify({ type: 'device' as const, deviceId })
}

function decodeOptionValue(optionValue: string): string | undefined {
  try {
    const parsed = JSON.parse(optionValue) as { type?: string; deviceId?: string }
    if (parsed.type === 'device' && typeof parsed.deviceId === 'string') {
      return parsed.deviceId
    }
  } catch {
    return undefined
  }

  return undefined
}

export function DefaultMicrophoneSelect(props: DefaultMicrophoneSelectProps) {
  const { value, onChange } = props
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [hasLoadedDevices, setHasLoadedDevices] = useState(false)
  const requestIdRef = useRef(0)
  const hasLoadedDevicesRef = useRef(false)

  const refreshDevices = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    try {
      const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices
      if (!mediaDevices?.enumerateDevices) {
        if (requestIdRef.current !== requestId) {
          return
        }
        if (!hasLoadedDevicesRef.current) {
          setDevices([])
          setHasLoadedDevices(false)
        }
        return
      }

      const allDevices = await mediaDevices.enumerateDevices()
      if (requestIdRef.current !== requestId) {
        return
      }
      setDevices(allDevices.filter((device) => device.kind === 'audioinput'))
      hasLoadedDevicesRef.current = true
      setHasLoadedDevices(true)
    } catch {
      if (requestIdRef.current !== requestId) {
        return
      }
      if (!hasLoadedDevicesRef.current) {
        setDevices([])
        setHasLoadedDevices(false)
      }
    }
  }, [])

  useEffect(() => {
    void refreshDevices()
  }, [refreshDevices])

  const currentValue = encodeOptionValue(value)
  const isSavedDeviceUnavailable =
    value !== undefined && hasLoadedDevices && !devices.some((device) => device.deviceId === value)

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          value={currentValue}
          onChange={(event) => onChange(decodeOptionValue(event.target.value))}
          className="flex-1 p-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
        >
          {isSavedDeviceUnavailable ? <option value={encodeOptionValue(value)}>已保存设备不可用</option> : null}
          <option value={DEFAULT_OPTION_VALUE}>系统默认麦克风</option>
          {devices.map((device, index) => (
            <option key={device.deviceId || `microphone-${index + 1}`} value={encodeOptionValue(device.deviceId)}>
              {device.label || `麦克风 ${index + 1}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            void refreshDevices()
          }}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          刷新设备列表
        </button>
      </div>
    </div>
  )
}
