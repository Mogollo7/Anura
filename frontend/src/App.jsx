import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import { FaCircleNotch, FaEye, FaEyeSlash, FaFrog, FaGoogle, FaTriangleExclamation } from 'react-icons/fa6'
import { BsIncognito } from 'react-icons/bs'
import './App.css'
import Camera from './pages/Camera'
import Preferences from './pages/Preferences'
import Explorer from './pages/Explorer'
import Profile from './pages/Profile'
import ObservationDetail from './pages/ObservationDetail'
import People from './pages/People'
import PeopleObservations from './pages/PeopleObservations'
import PeopleFavorites from './pages/PeopleFavorites'
import AuthenticatedLayout from './layouts/AuthenticatedLayout'
import { usePreferencesStore } from './store/preferencesStore'
import { obsIdKey } from './lib/observationIds'

const API_BASE = import.meta.env.VITE_API_URL || ''

const GUEST_LS_KEY = 'anura_guest'

// ── Login ────────────────────────────────────────────────────────
function Login({ setToken, onContinueAsGuest }) {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(false)
  const navigate = useNavigate()
  const { initializeFromBackend } = usePreferencesStore()

  const handleGuest = () => {
    onContinueAsGuest?.()
    navigate('/explorer', { replace: true })
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Error de autenticación')

      localStorage.setItem('anura_token', data.token)
      setToken(data.token)

      if (data.preferences) initializeFromBackend(data.preferences)
      
      const prefsCompleted = data.preferences?.preferences_completed ?? false
      navigate(prefsCompleted ? '/home/camara' : '/preferences')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-view">
      <div className="auth-card card">
        <h1 className="auth-title"><FaFrog aria-hidden /> Bienvenido</h1>
        <p className="subtitle">Inicia sesión en Anura</p>

        <div className="auth-oauth-stack">
          <button type="button" onClick={() => { window.location.href = `${API_BASE}/api/auth/google` }} className="btn-google">
            <FaGoogle className="google-icon" aria-hidden />
            Continuar con Google
          </button>

          <button type="button" className="btn-guest" onClick={handleGuest}>
            <BsIncognito className="guest-icon" aria-hidden />
            Empezar como invitado
          </button>
          <p className="guest-hint">Explora observaciones en modo solo lectura. Para publicar observaciones o guardar datos, inicia sesión.</p>
        </div>

        <div className="divider"><span>o usa tu email</span></div>

        <form onSubmit={handleLogin} className="auth-form">
          <input type="email"    placeholder="Correo electrónico" required value={email}    onChange={e => setEmail(e.target.value)} />
          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {showPassword ? <FaEyeSlash aria-hidden /> : <FaEye aria-hidden />}
            </button>
          </div>

          <div className="auth-options">
            <label className="checkbox-label">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
              Recordarme
            </label>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Entrando...' : 'Iniciar Sesión'}
          </button>
        </form>

        {error && <div className="error-box"><FaTriangleExclamation aria-hidden /> {error}</div>}

        <div className="auth-footer" role="note">
          <span>¿No tienes cuenta?</span>{' '}
          <Link to="/register" className="text-link font-bold">Regístrate</Link>
        </div>
      </div>
    </div>
  )
}

// ── Register ─────────────────────────────────────────────────────
function Register({ setToken, onContinueAsGuest }) {
  const [username, setUsername] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  const handleGuest = () => {
    onContinueAsGuest?.()
    navigate('/explorer', { replace: true })
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Error al registrar')

      const loginRes  = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const loginData = await loginRes.json()
      if (loginRes.ok) {
        localStorage.setItem('anura_token', loginData.token)
        localStorage.removeItem('anura_preferencesCompleted')
        setToken(loginData.token)
        navigate('/preferences')
      } else {
        navigate('/login')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-view">
      <div className="auth-card card">
        <h1 className="auth-title"><FaFrog aria-hidden /> Únete a Anura</h1>
        <p className="subtitle">Crea tu cuenta de explorador</p>

        <div className="auth-oauth-stack">
          <button type="button" onClick={() => { window.location.href = `${API_BASE}/api/auth/google` }} className="btn-google">
            <FaGoogle className="google-icon" aria-hidden />
            Registrarse con Google
          </button>

          <button type="button" className="btn-guest" onClick={handleGuest}>
            <BsIncognito className="guest-icon" aria-hidden />
            Empezar como invitado
          </button>
          <p className="guest-hint">Explora observaciones en modo solo lectura. Para publicar observaciones o guardar datos, inicia sesión.</p>
        </div>

        <div className="divider"><span>o usa tu email</span></div>

        <form onSubmit={handleRegister} className="auth-form">
          <input type="text"     placeholder="Nombre de usuario (opcional)" value={username} onChange={e => setUsername(e.target.value)} />
          <input type="email"    placeholder="Correo electrónico" required   value={email}    onChange={e => setEmail(e.target.value)} />
          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Contraseña"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            >
              {showPassword ? <FaEyeSlash aria-hidden /> : <FaEye aria-hidden />}
            </button>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
          </button>
        </form>

        {error && <div className="error-box"><FaTriangleExclamation aria-hidden /> {error}</div>}

        <div className="auth-footer" role="note">
          <span>¿Ya tienes cuenta?</span>{' '}
          <Link to="/login" className="text-link font-bold">Inicia Sesión</Link>
        </div>
      </div>
    </div>
  )
}

// ── OAuth callback handler ───────────────────────────────────────
function AuthCallback({ setToken }) {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token  = params.get('token')
    if (token) {
      localStorage.setItem('anura_token', token)
      localStorage.removeItem(GUEST_LS_KEY)
      setToken(token)

      const checkPrefs = async () => {
        // Execute pending favorite if any
        const pendingFav = localStorage.getItem('anura_pending_favorite')
        if (pendingFav) {
          localStorage.removeItem('anura_pending_favorite')
          const oid = obsIdKey(pendingFav)
          if (oid) {
            try {
              await fetch(`${API_BASE}/api/explorer/favorites/${encodeURIComponent(oid)}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
              })
            } catch { /* silent */ }
          }
        }

        // Determine redirect: pending URL > preferences check
        const pendingUrl = localStorage.getItem('anura_pending_url')
        localStorage.removeItem('anura_pending_url')

        try {
          const res = await fetch(`${API_BASE}/api/preferences`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (res.ok) {
            const data = await res.json()
            usePreferencesStore.getState().initializeFromBackend(data)
            const completed = data.preferences_completed
            if (pendingUrl) {
              navigate(completed ? pendingUrl : '/preferences', { replace: true })
            } else {
              navigate(completed ? '/home/camara' : '/preferences', { replace: true })
            }
          } else {
            navigate(pendingUrl || '/preferences', { replace: true })
          }
        } catch (err) {
          navigate(pendingUrl || '/preferences', { replace: true })
        }
      }
      checkPrefs()
    } else {
      navigate('/login', { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="auth-view">
      <div className="auth-card card" style={{ textAlign: 'center' }}>
        <p className="loading-inline"><FaCircleNotch aria-hidden /> Procesando autenticación...</p>
      </div>
    </div>
  )
}

// ── Root App ─────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem('anura_token'))
  const [guest, setGuest] = useState(() => {
    if (localStorage.getItem('anura_token')) return false
    return localStorage.getItem(GUEST_LS_KEY) === 'true'
  })

  const sessionActive = Boolean(token) || guest

  useEffect(() => {
    if (token) {
      localStorage.removeItem(GUEST_LS_KEY)
      setGuest(false)

      // Reclamar observación pendiente si existe
      const pendingStashId = localStorage.getItem('anura_pending_stash')
      if (pendingStashId) {
        const claimObservation = async () => {
          try {
            const res = await fetch(`${API_BASE}/api/observations/claim`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ stash_id: pendingStashId })
            })
            if (res.ok) {
              console.log('Observación reclamada con éxito')
              localStorage.removeItem('anura_pending_stash')
              alert('¡Tu observación de invitado ha sido guardada en tu cuenta!')
            }
          } catch (err) {
            console.error('Error al reclamar observación:', err)
          }
        }
        claimObservation()
      }
    }
  }, [token])

  const handleContinueAsGuest = () => {
    localStorage.removeItem('anura_token')
    localStorage.setItem(GUEST_LS_KEY, 'true')
    setToken(null)
    setGuest(true)
    usePreferencesStore.getState().loadPreferences()
  }

  const handleLogout = () => {
    localStorage.removeItem('anura_token')
    localStorage.removeItem(GUEST_LS_KEY)
    setToken(null)
    setGuest(false)
    usePreferencesStore.getState().loadPreferences()
    window.location.href = '/login'
  }

  const guestBlock = <Navigate to="/explorer" replace />

  return (
    <Router>
      <main className="app">
        <Routes>
          <Route
            path="/login"
            element={token ? <Navigate to="/" replace /> : <Login setToken={setToken} onContinueAsGuest={handleContinueAsGuest} />}
          />
          <Route
            path="/register"
            element={token ? <Navigate to="/" replace /> : <Register setToken={setToken} onContinueAsGuest={handleContinueAsGuest} />}
          />
          <Route path="/auth/callback" element={<AuthCallback setToken={setToken} />} />

          <Route element={<AuthenticatedLayout token={token} guest={guest} onLogout={handleLogout} />}>
            <Route
              path="/"
              element={
                !sessionActive ? <Navigate to="/login" replace />
                  : guest && !token ? <Navigate to="/explorer" replace />
                  : <Navigate to="/home/camara" replace />
              }
            />
            <Route path="/preferences" element={!sessionActive ? <Navigate to="/login" replace /> : guest && !token ? guestBlock : <Preferences />} />
            <Route path="/home/camara" element={!sessionActive ? <Navigate to="/login" replace /> : <Camera />} />
            <Route path="/home/profile" element={!sessionActive ? <Navigate to="/login" replace /> : <Profile />} />
            <Route path="/explorer" element={!sessionActive ? <Navigate to="/login" replace /> : <Explorer />} />
            <Route path="/explorer/:id" element={<ObservationDetail />} />
            <Route path="/people/:username" element={<People />} />
            <Route path="/people/:username/observaciones" element={<PeopleObservations />} />
            <Route path="/people/:username/favoritos" element={<PeopleFavorites />} />
          </Route>

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </Router>
  )
}
