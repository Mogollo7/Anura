import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdClose, MdFavorite } from 'react-icons/md'
import { FaGoogle } from 'react-icons/fa6'
import { API_BASE } from '../services/api'
import './GuestLoginModal.css'

/**
 * "Inicia sesión para continuar" para cualquier acción de escritura de un
 * invitado (favorito, seguir, comentar). Reemplaza los alert() que quedaban.
 */
export default function GuestLoginModal({
  onClose,
  title = 'Guarda tus favoritos',
  description = 'Para guardar observaciones en favoritos necesitas iniciar sesión. Después de entrar, continuarás aquí automáticamente.',
  Icon = MdFavorite,
  showCancel = true,
}) {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="po-modal-overlay" onClick={onClose}>
      <div
        className="po-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="po-modal-close" onClick={onClose} aria-label="Cerrar">
          <MdClose aria-hidden />
        </button>
        <Icon aria-hidden className="po-modal-icon" />
        <h2 id="guest-modal-title">{title}</h2>
        <p>{description}</p>
        <button
          className="btn-primary po-modal-login"
          onClick={() => { window.location.href = `${API_BASE}/api/auth/google` }}
        >
          <FaGoogle aria-hidden /> Continuar con Google
        </button>
        <button className="btn-secondary po-modal-skip" onClick={() => navigate('/login')}>
          Entrar con correo
        </button>
        {showCancel && (
          <button className="po-modal-cancel" onClick={onClose}>
            Ahora no
          </button>
        )}
      </div>
    </div>
  )
}
