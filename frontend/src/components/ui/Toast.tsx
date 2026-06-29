import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { X, AlertCircle, CheckCircle2 } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'error') => {
    const id = ++toastId
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const dismiss = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const iconMap: Record<ToastType, typeof AlertCircle> = {
    success: CheckCircle2,
    error: AlertCircle,
    info: AlertCircle,
  }

  const colorMap: Record<ToastType, string> = {
    success: 'border-emerald-200 bg-emerald-50',
    error: 'border-red-200 bg-red-50',
    info: 'border-amber-200 bg-amber-50',
  }

  const iconColorMap: Record<ToastType, string> = {
    success: 'text-emerald-500',
    error: 'text-red-500',
    info: 'text-amber-500',
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => {
          const Icon = iconMap[t.type]
          return (
            <div
              key={t.id}
              className={`animate-slideUp pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-lg border text-sm max-w-sm shadow-lg ${colorMap[t.type]}`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${iconColorMap[t.type]}`} />
              <span className="text-gray-700">{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="ml-auto p-0.5 text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}
