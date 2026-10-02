import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  MdDarkMode,
  MdLightMode,
  MdLogout,
  MdLogin,
  MdPerson,
  MdAdminPanelSettings,
  MdSearch,
  MdClose,
  MdNotifications,
  MdDelete,
} from 'react-icons/md'
import { usePreferencesStore } from '../store/preferencesStore'
import { useNotificationsStore } from '../store/notificationsStore'
import { apiGet } from '../services/api'
import { adminLoginUrl } from '../lib/adminAccess'
import logoApp from '../assets/logo_app.webp'
import './TopBar.css'

/** El teléfono mete «Ver completo: url» al final del body. En la web ese enlace va aparte. */
function cuerpoVisible(body) {
  if (!body) return ''
  return body.replace(/\n*Ver completo\b[\s\S]*$/, '').trim()
}

export default function TopBar({ onLogout, isGuest = false, isAdmin = false, token = null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { preferences, setTheme, savePreferences } = usePreferencesStore()
  const { items: notifItems, unread: notifUnread, fetch: fetchNotifications, markRead: markNotifRead, remove: removeNotif } = useNotificationsStore()

  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  const [isNotifOpen, setIsNotifOpen] = useState(false)
  const [notifFilter, setNotifFilter] = useState('all')
  const notifRef = useRef(null)

  useEffect(() => {
    if (!isGuest) fetchNotifications()
  }, [isGuest, fetchNotifications])

  const visibleNotifs = notifItems.filter((n) => {
    if (notifFilter === 'unread') return !n.is_read
    if (notifFilter === 'read') return n.is_read
    return true
  })

  const isActive = (path) => {
    // Misma asignación que Navbar: Explorar = obs; Observaciones = especies.
    if (path === '/explorar') {
      return location.pathname === '/explorar' || location.pathname.startsWith('/explorer/')
    }
    if (path === '/observaciones') {
      return location.pathname === '/observaciones' || location.pathname.startsWith('/taxa')
    }
    if (path === '/ajustes') {
      return location.pathname.startsWith('/ajustes') || location.pathname.startsWith('/perfil')
    }
    return location.pathname === path
  }
  // Acceso rápido claro/oscuro; "Automático" se elige en Ajustes › Apariencia.
  const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches
  const isDarkNow = preferences.theme === 'dark' || (preferences.theme === 'system' && prefersDark())
  const toggleTheme = () => {
    const next = isDarkNow ? 'light' : 'dark'
    setTheme(next)
    // Sin guardar, fetchPreferences restauraba el tema del servidor al recargar.
    savePreferences().catch(() => {})
  }

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false)
        setIsSearchOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setIsNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchSuggestions = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    setLoading(true)
    try {
      const data = await apiGet(`/api/explorer/suggest?q=${encodeURIComponent(q)}`, { auth: false })
      setSuggestions(data || [])
      setShowSuggestions((data || []).length > 0)
    } catch { /* silent: sugerencias son un realce, no un flujo crítico */ }
    finally { setLoading(false) }
  }, [])

  const handleQueryChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 280)
  }

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (!query.trim()) return
    setShowSuggestions(false)
    // Removed setIsSearchOpen(false) to keep it open
    navigate(`/search?q=${encodeURIComponent(query.trim())}`)
  }

  const handleSuggestionClick = (sug) => {
    setShowSuggestions(false)
    // Removed setIsSearchOpen(false) to keep it open
    if (sug.type === 'user') {
      navigate(`/people/${sug.username}`)
    } else {
      navigate(`/taxa/${sug.slug}`)
    }
  }

  const openSearch = () => {
    setIsSearchOpen(true)
    setTimeout(() => searchRef.current?.querySelector('input')?.focus(), 50)
  }

  const closeSearch = () => {
    setIsSearchOpen(false)
    setQuery('')
    setSuggestions([])
    setShowSuggestions(false)
  }

  return (
    <header className="top-bar" role="banner">
      <div className="top-bar-inner">
        <button
          type="button"
          className="top-bar-brand"
          onClick={() => navigate('/inicio')}
          aria-label="Ir a inicio"
        >
          <img className="top-bar-logo" src={logoApp} alt="" aria-hidden />
          <span className="top-bar-title">Anura</span>
          {isGuest && <span className="top-bar-guest-badge" title="Solo lectura">Invitado</span>}
        </button>

        {/* ── Global Search ────────────────────────────── */}
        <div className={`top-bar-search ${isSearchOpen ? 'is-open' : ''}`} ref={searchRef}>
          {!isSearchOpen ? (
            <button
              type="button"
              className="top-bar-search-toggle"
              onClick={openSearch}
              aria-label="Buscar"
            >
              <MdSearch />
            </button>
          ) : (
            <form className="top-bar-search-field" onSubmit={handleSubmit}>
              <MdSearch className="search-field-icon" aria-hidden />
              <input
                type="text"
                placeholder="Buscar taxón, especie, género..."
                autoFocus
                className="top-bar-search-input"
                value={query}
                onChange={handleQueryChange}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeSearch()
                }}
              />
              {loading && <span className="search-spinner" aria-hidden />}
              <button
                type="button"
                className="top-bar-search-close"
                onClick={closeSearch}
                aria-label="Cerrar búsqueda"
              >
                <MdClose />
              </button>

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="search-suggestions-dropdown" role="listbox">
                  {suggestions.map((sug, i) => (
                    <button
                      key={sug.id || `user-${i}`}
                      type="button"
                      className="search-suggestion-item"
                      role="option"
                      onClick={() => handleSuggestionClick(sug)}
                    >
                      {sug.type === 'user' ? (
                        <>
                          <span className="sug-icon" style={{color: 'var(--muted)'}}><MdPerson aria-hidden /></span>
                          <span className="sug-content">
                            <span className="sug-scientific" style={{fontStyle: 'normal'}}>{sug.username}</span>
                            <span className="sug-common">Usuario</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="sug-icon"><img src={logoApp} alt="" width={16} height={16} style={{borderRadius: 4}} /></span>
                          <span className="sug-content">
                            <span className="sug-scientific">{sug.scientific_name}</span>
                            {sug.common_name && <span className="sug-common">{sug.common_name}</span>}
                          </span>
                          <span className="sug-family">{sug.family}</span>
                        </>
                      )}
                    </button>
                  ))}
                  <button
                    type="submit"
                    className="search-suggestion-see-all"
                    onClick={handleSubmit}
                  >
                    <MdSearch aria-hidden /> Ver todos los resultados de "{query}"
                  </button>
                </div>
              )}
            </form>
          )}
        </div>

        <nav className="top-bar-nav-pc" aria-label="Navegación principal">
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/inicio') ? 'active' : ''}`}
            onClick={() => navigate('/inicio')}
          >
            Inicio
          </button>
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/explorar') ? 'active' : ''}`}
            onClick={() => navigate('/explorar')}
          >
            Explorar
          </button>
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/observaciones') ? 'active' : ''}`}
            onClick={() => navigate('/observaciones')}
          >
            Observaciones
          </button>
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/ajustes') ? 'active' : ''}`}
            onClick={() => navigate('/ajustes')}
          >
            Perfil
          </button>
          {isAdmin && (
            <button
              type="button"
              className="top-bar-nav-link"
              onClick={() => window.open(adminLoginUrl(token), '_blank', 'noopener')}
              title="Abre el panel administrativo en una pestaña nueva"
            >
              <MdAdminPanelSettings aria-hidden /> Modo administrativo
            </button>
          )}
        </nav>

        <nav className="top-bar-actions" aria-label="Acciones rápidas">
          {!isGuest && (
            <div className="top-bar-notif" ref={notifRef}>
              <button
                type="button"
                className="top-bar-icon-btn top-bar-notif-toggle"
                onClick={() => setIsNotifOpen((v) => !v)}
                title="Avisos"
                aria-label="Avisos"
              >
                <MdNotifications aria-hidden />
                {notifUnread > 0 && <span className="top-bar-notif-badge">{notifUnread > 9 ? '9+' : notifUnread}</span>}
              </button>
              {isNotifOpen && (
                <div className="notif-dropdown" role="menu">
                  <div className="notif-dropdown-filters">
                    <button
                      type="button"
                      className={`notif-filter-chip ${notifFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setNotifFilter('all')}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      className={`notif-filter-chip ${notifFilter === 'unread' ? 'active' : ''}`}
                      onClick={() => setNotifFilter('unread')}
                    >
                      No leídos
                    </button>
                    <button
                      type="button"
                      className={`notif-filter-chip ${notifFilter === 'read' ? 'active' : ''}`}
                      onClick={() => setNotifFilter('read')}
                    >
                      Leídos
                    </button>
                  </div>
                  {visibleNotifs.length === 0 ? (
                    <div className="notif-empty">
                      {notifFilter === 'unread' ? 'No tienes avisos sin leer' : notifFilter === 'read' ? 'No tienes avisos leídos' : 'No tienes avisos'}
                    </div>
                  ) : (
                    <ul className="notif-list">
                      {visibleNotifs.map((n) => (
                        <li key={n.id} className={`notif-item ${n.is_read ? '' : 'unread'}`} onClick={() => markNotifRead(n.id)}>
                          <div className="notif-item-content">
                            <span className="notif-item-title">{n.title}</span>
                            {cuerpoVisible(n.body) && <span className="notif-item-body">{cuerpoVisible(n.body)}</span>}
                            {n.enlace && (
                              <a
                                className="notif-item-link"
                                href={n.enlace}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Ver completo
                              </a>
                            )}
                          </div>
                          <button
                            type="button"
                            className="notif-item-delete"
                            aria-label="Eliminar aviso"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeNotif(n.id)
                            }}
                          >
                            <MdDelete aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="top-bar-icon-btn theme-toggle"
            onClick={toggleTheme}
            title={isDarkNow ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            aria-label={isDarkNow ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {isDarkNow ? <MdDarkMode aria-hidden /> : <MdLightMode aria-hidden />}
          </button>
          {isGuest ? (
            <button
              type="button"
              className="top-bar-login-btn"
              onClick={() => navigate('/login')}
            >
              <MdLogin aria-hidden /> <span>Entrar</span>
            </button>
          ) : (
            <button
              type="button"
              className="top-bar-icon-btn top-bar-logout"
              onClick={onLogout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
            >
              <MdLogout aria-hidden />
            </button>
          )}
        </nav>
      </div>
    </header>
  )
}
