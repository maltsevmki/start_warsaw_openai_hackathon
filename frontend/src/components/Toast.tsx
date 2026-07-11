import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { useEffect } from 'react'

export interface ToastMessage {
  id: number
  text: string
  tone?: 'success' | 'info' | 'error'
}

export default function Toast({ message, onDismiss }: { message: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(onDismiss, 3600)
    return () => window.clearTimeout(timeout)
  }, [message, onDismiss])

  if (!message) return null
  const Icon = message.tone === 'error' ? CircleAlert : message.tone === 'info' ? Info : CheckCircle2
  return (
    <div className={`toast toast-${message.tone ?? 'success'}`} role="status" aria-live="polite">
      <Icon size={18} aria-hidden="true" />
      <span>{message.text}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification"><X size={15} /></button>
    </div>
  )
}
