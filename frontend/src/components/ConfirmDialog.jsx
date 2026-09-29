import { useEffect, useRef } from 'react'
import './ConfirmDialog.css'

/**
 * Alerta de confirmación para acciones destructivas (HIG: el botón
 * destructivo va marcado en rojo y "Cancelar" es la opción por defecto).
 * Sustituye a window.confirm(), que no respeta tema ni tipografía.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title">{title}</h2>
        {message && <p id="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="confirm-btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-btn ${destructive ? 'is-destructive' : 'is-default'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Un momento…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
