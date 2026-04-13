import { useEffect, useState } from 'react'

type ToastType = 'success' | 'error' | 'info'

type ToastProps = {
  message: string
  type: ToastType
  duration?: number
  onClose: () => void
}

export function Toast({ message, type, duration = 3000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const role = type === 'error' ? 'alert' : 'status'
  const liveRegion = type === 'error' ? 'assertive' : 'polite'

  return (
    <div className="toast-container" aria-live={liveRegion}>
      <div className={`toast-content toast-${type}`}>
        <span className="toast-message" role={role}>{message}</span>
      </div>
    </div>
  )
}

type ToastState = {
  visible: boolean
  message: string
  type: ToastType
}

export function useToast() {
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'success',
  })

  const showToast = (message: string, type: ToastType = 'success') => {
    setToast({ visible: true, message, type })
  }

  const hideToast = () => {
    setToast({ visible: false, message: '', type: 'success' })
  }

  const showSuccess = (message: string) => showToast(message, 'success')
  const showError = (message: string) => showToast(message, 'error')
  const showInfo = (message: string) => showToast(message, 'info')

  return {
    toast,
    showToast,
    hideToast,
    showSuccess,
    showError,
    showInfo,
  }
}

export function ToastContainer({
  toast,
  hideToast
}: {
  toast: ToastState
  hideToast: () => void
}) {
  if (!toast.visible) return null

  return (
    <Toast
      message={toast.message}
      type={toast.type}
      onClose={hideToast}
    />
  )
}
