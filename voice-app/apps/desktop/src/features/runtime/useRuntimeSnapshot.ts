import { useEffect, useState } from 'react'
import { getRuntimeSnapshot, listenRuntimeSnapshot, type RuntimeSnapshot } from '../../lib/tauri'

const loadingSnapshot: RuntimeSnapshot = {
  phase: '加载中',
  transcript: '',
  result: '',
  detail: '正在加载运行时状态。',
  input_mode: 'none',
  result_window_mode: 'auto',
}

export function useRuntimeSnapshot() {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(loadingSnapshot)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false

    const unlistenPromise = listenRuntimeSnapshot((nextSnapshot) => {
      if (disposed) {
        return
      }

      setError(null)
      setSnapshot(nextSnapshot)
    }).catch(() => () => {})

    void getRuntimeSnapshot()
      .then((nextSnapshot) => {
        if (!disposed) {
          setSnapshot(nextSnapshot)
        }
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : '加载运行状态失败。')
        }
      })

    return () => {
      disposed = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  return {
    snapshot,
    phase: snapshot.phase,
    transcript: snapshot.transcript,
    result: snapshot.result,
    detail: snapshot.detail,
    input_mode: snapshot.input_mode,
    error,
  }
}
