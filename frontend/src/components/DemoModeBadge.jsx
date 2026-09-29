import { useNavigate, useLocation } from 'react-router-dom'
import { MdScience, MdClose } from 'react-icons/md'
import { getDemoConfig, disableDemoMode, DEMO_SCENARIOS, DEMO_SESSIONS } from '../lib/demoMode'
import './DemoModeBadge.css'

/**
 * Acceso al asistente de datos de prueba (solo desarrollo). Cuando está
 * activo, deja claro en todo momento que lo que se ve es simulado.
 */
export default function DemoModeBadge() {
  const navigate = useNavigate()
  const location = useLocation()
  const cfg = getDemoConfig()

  if (!import.meta.env.DEV || location.pathname === '/datos-de-prueba') return null

  if (!cfg) {
    return (
      <button
        type="button"
        className="demo-badge demo-badge--idle"
        onClick={() => navigate('/datos-de-prueba')}
        aria-label="Datos de prueba"
        title="Datos de prueba"
      >
        <MdScience aria-hidden />
      </button>
    )
  }

  return (
    <div className="demo-badge demo-badge--active" role="status">
      <button type="button" className="demo-badge-main" onClick={() => navigate('/datos-de-prueba')}>
        <MdScience aria-hidden />
        <span>Datos de prueba: {DEMO_SCENARIOS[cfg.scenario]?.label} · {DEMO_SESSIONS[cfg.session]?.label}</span>
      </button>
      <button
        type="button"
        className="demo-badge-close"
        onClick={() => { disableDemoMode(); window.location.reload() }}
        aria-label="Desactivar datos de prueba"
        title="Desactivar"
      >
        <MdClose aria-hidden />
      </button>
    </div>
  )
}
