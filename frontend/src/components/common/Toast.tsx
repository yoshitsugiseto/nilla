import { useCallback, useEffect, useRef, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'
import { ToastContext, type ToastType } from './toastContext'

interface Toast {
  id: string
  message: string
  type: ToastType
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    clearTimeout(timerRef.current[id])
    delete timerRef.current[id]
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
    timerRef.current[id] = setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  useEffect(() => {
    const timers = timerRef.current
    return () => { Object.values(timers).forEach(clearTimeout) }
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-label="通知"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle size={16} className="text-emerald-500 shrink-0" />,
    error: <AlertCircle size={16} className="text-red-500 shrink-0" />,
    info: <Info size={16} className="text-blue-500 shrink-0" />,
  }
  const borders: Record<ToastType, string> = {
    success: 'border-emerald-200',
    error: 'border-red-200',
    info: 'border-blue-200',
  }

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-center gap-3 bg-white border ${borders[toast.type]} rounded-lg shadow-md px-4 py-3 min-w-[260px] max-w-sm animate-in slide-in-from-right-4 fade-in duration-200`}
    >
      {icons[toast.type]}
      <p className="text-sm text-gray-800 flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="通知を閉じる"
        className="text-gray-400 hover:text-gray-600"
      >
        <X size={14} />
      </button>
    </div>
  )
}
