import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  FaCamera,
  FaFrog,
  FaMoon,
  FaRightFromBracket,
  FaUser,
  FaMagnifyingGlass,
  FaXmark,
} from 'react-icons/fa6'
import { FiSun } from 'react-icons/fi'
import { usePreferencesStore } from '../store/preferencesStore'
import './TopBar.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function TopBar({ onLogout, isGuest = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { preferences, updateAllPreferences } = usePreferencesStore()

  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  const isActive = (path) => location.pathname === path
  const toggleTheme = () => {
    const next = preferences.theme === 'dark' ? 'light' : 'dark'
    updateAllPreferences({ ...preferences, theme: next })
  }

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false)
        setIsSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchSuggestions = useCallback(async (q) => {
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/explorer/suggest?q=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data)
        setShowSuggestions(data.length > 0)
      }
    } catch { /* silent */ }
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
          onClick={() => navigate('/home/camara')}
          aria-label="Ir a inicio"
        >
          <span className="top-bar-logo" aria-hidden><FaFrog /></span>
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
              <FaMagnifyingGlass />
            </button>
          ) : (
            <form className="top-bar-search-field" onSubmit={handleSubmit}>
              <FaMagnifyingGlass className="search-field-icon" aria-hidden />
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
                <FaXmark />
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
                          <span className="sug-icon" style={{color: 'var(--muted)'}}><FaUser aria-hidden /></span>
                          <span className="sug-content">
                            <span className="sug-scientific" style={{fontStyle: 'normal'}}>{sug.username}</span>
                            <span className="sug-common">Usuario</span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="sug-icon"><FaFrog aria-hidden /></span>
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
                    <FaMagnifyingGlass aria-hidden /> Ver todos los resultados de "{query}"
                  </button>
                </div>
              )}
            </form>
          )}
        </div>

        <nav className="top-bar-nav-pc" aria-label="Navegación principal">
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/home/camara') ? 'active' : ''}`}
            onClick={() => navigate('/home/camara')}
          >
            Cámara
          </button>
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/explorer') ? 'active' : ''}`}
            onClick={() => navigate('/explorer')}
          >
            Explorar
          </button>
          <button
            type="button"
            className={`top-bar-nav-link ${isActive('/home/profile') ? 'active' : ''}`}
            onClick={() => navigate('/home/profile')}
          >
            Perfil
          </button>
        </nav>

        <nav className="top-bar-actions" aria-label="Acciones rápidas">
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
