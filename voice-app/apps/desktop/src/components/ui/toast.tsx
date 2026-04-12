import { useEffect, useState } from 'react'
import { CheckCircle, AlertCircle, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

type ToastProps = {
  message: string
  type: ToastType
  duration?: number
  onClose: () => void
}

export function Toast({ message, type, duration = 3000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300) // Wait for fade out animation
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  return (
    <div className={`toast-container ${visible ? 'toast-visible' : 'toast-hidden'}`}>
      <div className={`toast-content toast-${type}`}>
        {type === 'success' ? (
          <CheckCircle className="toast-icon" />
        ) : type === 'error' ? (
          <AlertCircle className="toast-icon" />
        ) : null}
        <span className="toast-message">{message}</span>
        <button
          className="toast-close"
          onClick={handleClose}
          aria-label="关闭提示"
        >
          <X className="h-4 w-4" />
        </button>
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