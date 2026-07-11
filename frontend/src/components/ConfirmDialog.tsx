import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  confirmLabel: string
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description">
        <button className="dialog-close" type="button" onClick={onClose} disabled={busy} aria-label="Close dialog"><X size={18} /></button>
        <span className="dialog-icon"><AlertTriangle size={22} /></span>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description">{description}</p>
        <div className="button-row">
          <button ref={cancelRef} className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="button button-danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? 'Clearing…' : confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
