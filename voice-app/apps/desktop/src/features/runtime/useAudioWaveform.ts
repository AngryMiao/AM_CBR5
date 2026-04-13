import { useEffect, useState } from 'react'
import {
  getCurrentWindowLabel,
  subscribeAudioWaveform,
  type AudioWaveformFrame,
} from '../../lib/tauri'

const silentWaveform: AudioWaveformFrame = {
  bars: Array.from({ length: 8 }, () => 0),
  active: false,
}

export function useAudioWaveform() {
  const [waveform, setWaveform] = useState<AudioWaveformFrame>(silentWaveform)

  useEffect(() => {
    let disposed = false
    const windowLabel = getCurrentWindowLabel()

    const unsubscribePromise = subscribeAudioWaveform(windowLabel, (nextWaveform) => {
      if (!disposed) {
        setWaveform(nextWaveform)
      }
    }).catch(() => () => {})

    return () => {
      disposed = true
      void unsubscribePromise.then((unsubscribe) => unsubscribe())
    }
  }, [])

  return waveform
}
