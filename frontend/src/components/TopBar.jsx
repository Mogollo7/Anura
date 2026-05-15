import { useNavigate, useLocation } from 'react-router-dom'
import {
  FaCamera,
  FaFrog,
  FaGear,
  FaMapLocationDot,
  FaMoon,
  FaRightFromBracket,
  FaUser,
} from 'react-icons/fa6'
import { FiSun } from 'react-icons/fi'
import { usePreferencesStore } from '../store/preferencesStore'
import './TopBar.css'

export default function TopBar({ onLogout, isGuest = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { preferences, updateAllPreferences } = usePreferencesStore()

  const isActive = (path) => location.pathname === path
  const toggleTheme = () => {
    const next = preferences.theme === 'dark' ? 'light' : 'dark'
    updateAllPreferences({ ...preferences, theme: next })
  }

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar-inner">
        <button
          type="button"
          className="top-bar-brand"
          onClick={() => navigate('/home/camara')}
          aria-label="Ir a inicio"
        >
          <span className="top-bar-logo" aria-hidden><FaFrog /></span>
          <span className="top-bar-title">Anura</span>
          {isGuest && <span className="top-bar-guest-badge" title="Solo lectura">Invitado</span>}
        </button>

        <nav className="top-bar-nav-pc" aria-label="Navegación principal">
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/home/camara') ? 'active' : ''}`}
            onClick={() => navigate('/home/camara')}
          >
            <FaCamera aria-hidden /> Cámara
          </button>
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/explorer') ? 'active' : ''}`}
            onClick={() => navigate('/explorer')}
          >
            <FaMapLocationDot aria-hidden /> Explorar
          </button>
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/home/profile') ? 'active' : ''}`}
            onClick={() => navigate('/home/profile')}
          >
            <FaUser aria-hidden /> Perfil
          </button>
        </nav>

        <nav className="top-bar-actions" aria-label="Acciones rápidas">
          {!isGuest && (
          <button
            type="button"
            className="top-bar-icon-btn"
            onClick={() => navigate('/preferences')}
            title="Preferencias"
            aria-label="Preferencias"
          >
            <FaGear aria-hidden />
          </button>
          )}
          <button
            type="button"
            className="top-bar-icon-btn theme-toggle"
            onClick={toggleTheme}
            title={preferences.theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}
            aria-label={preferences.theme === 'dark' ? 'Activar tema claro' : 'Activar tema oscuro'}
          >
            {preferences.theme === 'dark' ? <FiSun aria-hidden /> : <FaMoon aria-hidden />}
          </button>
          <button
            type="button"
            className="top-bar-icon-btn top-bar-logout"
            onClick={onLogout}
            title={isGuest ? 'Salir del modo invitado' : 'Cerrar sesión'}
            aria-label={isGuest ? 'Salir del modo invitado' : 'Cerrar sesión'}
          >
            <FaRightFromBracket aria-hidden />
          </button>
        </nav>
      </div>
    </header>
  )
}
