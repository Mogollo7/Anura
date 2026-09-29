import { useNavigate, useLocation } from 'react-router-dom'
import { MdHome, MdExplore, MdFormatListBulleted, MdSettings, MdAdminPanelSettings } from 'react-icons/md'
import { adminLoginUrl } from '../lib/adminAccess'
import './Navbar.css'

// Barra inferior = .a-tabbar del design system (cápsula flotante, material
// translúcido). Mismas 4 pestañas que AnuraRoute.kt (Home, Explore,
// Observations, Settings). Explorar abre observaciones; Observaciones abre
// especies (Listado en Android). Sin el FAB de captura de la app: la web es
// para navegar, no para registrar ni identificar. Admin es un extra de la web.
export default function Navbar({ isAdmin = false, token = null }) {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => {
    // Explorar → observaciones; Observaciones → especies/taxones.
    if (path === '/explorar') {
      return location.pathname === '/explorar' || location.pathname.startsWith('/explorer/')
    }
    if (path === '/observaciones') {
      return location.pathname === '/observaciones' || location.pathname.startsWith('/taxa') || location.pathname.startsWith('/search')
    }
    if (path === '/ajustes') {
      return location.pathname.startsWith('/ajustes') || location.pathname.startsWith('/perfil')
    }
    return location.pathname === path
  }

  const tabs = [
    { path: '/inicio', label: 'Inicio', Icon: MdHome },
    { path: '/explorar', label: 'Explorar', Icon: MdExplore },
    { path: '/observaciones', label: 'Observaciones', Icon: MdFormatListBulleted },
    { path: '/ajustes', label: 'Ajustes', Icon: MdSettings },
    // Sin path interno: abre el Admin real en una pestaña nueva, no una ruta de esta app.
    ...(isAdmin ? [{ path: null, label: 'Admin', Icon: MdAdminPanelSettings }] : []),
  ]

  return (
    <nav className="a-tabbar" aria-label="Navegación principal">
      {tabs.map(({ path, label, Icon }) => (
        <button
          key={path ?? 'admin'}
          type="button"
          className="a-tab"
          aria-selected={path ? isActive(path) : false}
          aria-current={path && isActive(path) ? 'page' : undefined}
          onClick={() => (path ? navigate(path) : window.open(adminLoginUrl(token), '_blank', 'noopener'))}
        >
          <Icon aria-hidden size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
