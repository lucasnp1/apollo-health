// Tiny toast system. Used for transient feedback (status / warn / error)
// and for undo-after-delete affordances. Lives outside the main App
// component so any view can fire toasts without prop drilling.
//
// Design choices:
//   * One toast at a time. New toast replaces the current — keeps the
//     screen calm and ensures the user always sees the latest action.
//   * Auto-dismiss after `durationMs` (default 6s). Undo toasts auto-
//     dismiss too — the undo window IS the toast lifetime.
//   * The `action` block lets a toast carry a single optional verb.
//     Used by useUndoableDelete to surface an "Undo" button that, when
//     pressed, restores the deleted record.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export type ToastTone = 'info' | 'warn' | 'error'

export type ToastAction = {
  label: string
  onClick: () => void | Promise<void>
}

export type ToastOptions = {
  message: string
  tone?: ToastTone
  action?: ToastAction
  durationMs?: number
}

type ToastContextValue = {
  showToast: (options: ToastOptions) => void
  dismissToast: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null)
  const counter = useRef(0)

  const dismissToast = useCallback(() => setToast(null), [])

  const showToast = useCallback((options: ToastOptions) => {
    counter.current += 1
    setToast({ ...options, id: counter.current })
  }, [])

  useEffect(() => {
    if (!toast) return
    const duration = toast.durationMs ?? 6000
    const id = setTimeout(() => {
      // Only clear if the visible toast is still this one — guards against
      // dismissing a newer toast that replaced this one mid-timer.
      setToast((current) => (current && current.id === toast.id ? null : current))
    }, duration)
    return () => clearTimeout(id)
  }, [toast])

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          className={toast.tone && toast.tone !== 'info' ? `snackbar ${toast.tone}` : 'snackbar'}
          role={toast.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={async () => {
                const fn = toast.action!.onClick
                dismissToast()
                await fn()
              }}
            >
              {toast.action.label}
            </button>
          ) : (
            <button type="button" onClick={dismissToast}>Dismiss</button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>')
  }
  return ctx
}
