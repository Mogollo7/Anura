import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom'
import './App.css'
// La web es para navegar lo que se registra en la app móvil (observaciones,
// especies, perfiles, salidas de campo); no identifica especies.
import Home from './pages/Home'
import Explorer from './pages/Explorer'
import ObservationDetail from './pages/ObservationDetail'
import People from './pages/People'
import PeopleObservations from './pages/PeopleObservations'
import PeopleFavorites from './pages/PeopleFavorites'
import Settings from './pages/Settings'
import EditProfile from './pages/EditProfile'
import Packages from './pages/Packages'
import FieldTrips from './pages/FieldTrips'
import FieldTripDetail from './pages/FieldTripDetail'
import Search from './pages/Search'
import TaxonDetail from './pages/TaxonDetail'
import TaxonPhotoBrowse from './pages/TaxonPhotoBrowse'
import AuthenticatedLayout from './layouts/AuthenticatedLayout'
import { usePreferencesStore } from './store/preferencesStore'
import { API_BASE, apiGet, apiPost } from './services/api'
import LoadingSpinner from './components/LoadingSpinner'

// ── Protected route ──────────────────────────────────────────────
function ProtectedRoute({ children, token }) {
  const { loadPreferences, fetchPreferences } = usePreferencesStore()

  useEffect(() => {
    loadPreferences()
    if (token) fetchPreferences()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!token) return <Navigate to="/login" />
  return children
}

// ── Redirección a mi propio perfil ──────────────────────────────────
// People.jsx (Profile(userId) en Android) es la única vista de perfil real;
// esto solo resuelve "quién soy" y reenvía, para no duplicar esa pantalla.
function OwnProfileRedirect() {
  const [target, setTarget] = useState(null)
  useEffect(() => {
    apiGet('/api/auth/me')
      .then((data) => setTarget(`/people/${data.user.username}`))
      .catch(() => setTarget('/ajustes'))
  }, [])
  if (!target) return <LoadingSpinner text="Cargando tu perfil..." />
  return <Navigate to={target} replace />
}

// ── Login ────────────────────────────────────────────────────────
function Login({ setToken }) {
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(false)
  const navigate = useNavigate()
  const { initializeFromBackend } = usePreferencesStore()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await apiPost('/api/auth/login', { email, password, rememberMe }, { auth: false })

      localStorage.setItem('anura_token', data.token)
      setToken(data.token)

      if (data.preferences) initializeFromBackend(data.preferences)

      const prefsCompleted = localStorage.getItem('anura_preferencesCompleted') === 'true'
      navigate(prefsCompleted ? '/inicio' : '/ajustes')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-view">
      <div className="auth-card card">
        <h1>🐸 Bienvenido</h1>
        <p className="subtitle">Inicia sesión en Anura</p>

        <button onClick={() => { window.location.href = `${API_BASE}/api/auth/google` }} className="btn-google">
          <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google" className="google-icon" />
          Continuar con Google
        </button>

        <div className="divider"><span>o usa tu email</span></div>

        <form onSubmit={handleLogin} className="auth-form">
          <input type="email"    placeholder="Correo electrónico" required value={email}    onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Contraseña"         required value={password} onChange={e => setPassword(e.target.value)} />

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

        {error && <div className="error-box">⚠️ {error}</div>}

        <p className="auth-footer">
          ¿No tienes cuenta? <Link to="/register" className="text-link font-bold">Regístrate</Link>
        </p>
      </div>
    </div>
  )
}

// ── Register ─────────────────────────────────────────────────────
function Register({ setToken }) {
  const [username, setUsername] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  const handleRegister = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await apiPost('/api/auth/register', { username, email, password }, { auth: false })

      // Auto-login
      try {
        const loginData = await apiPost('/api/auth/login', { email, password }, { auth: false })
        localStorage.setItem('anura_token', loginData.token)
        localStorage.removeItem('anura_preferencesCompleted')
        setToken(loginData.token)
        navigate('/ajustes')
      } catch {
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
        <h1>🐸 Únete a Anura</h1>
        <p className="subtitle">Crea tu cuenta de explorador</p>

        <button onClick={() => { window.location.href = `${API_BASE}/api/auth/google` }} className="btn-google">
          <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google" className="google-icon" />
          Registrarse con Google
        </button>

        <div className="divider"><span>o usa tu email</span></div>

        <form onSubmit={handleRegister} className="auth-form">
          <input type="text"     placeholder="Nombre de usuario (opcional)" value={username} onChange={e => setUsername(e.target.value)} />
          <input type="email"    placeholder="Correo electrónico" required   value={email}    onChange={e => setEmail(e.target.value)} />
          <input type="password" placeholder="Contraseña"         required   value={password} onChange={e => setPassword(e.target.value)} />

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
          </button>
        </form>

        {error && <div className="error-box">⚠️ {error}</div>}

        <p className="auth-footer">
          ¿Ya tienes cuenta? <Link to="/login" className="text-link font-bold">Inicia Sesión</Link>
        </p>
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
      localStorage.removeItem('anura_preferencesCompleted')
      setToken(token)
      navigate('/ajustes')
    } else {
      navigate('/login')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="auth-view">
      <div className="auth-card card" style={{ textAlign: 'center' }}>
        <p>⏳ Procesando autenticación...</p>
      </div>
    </div>
  )
}

// ── Root App ─────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem('anura_token'))

  const handleLogout = () => {
    localStorage.removeItem('anura_token')
    localStorage.removeItem('anura_preferencesCompleted')
    setToken(null)
  }

  return (
    <Router>
      <main className="app">
        <Routes>
          {/* Root — Inicio es el punto de entrada real (equivalente a la app),
              no la lista de observaciones. */}
          <Route path="/" element={<Navigate to="/inicio" />} />

          {/* Auth */}
          <Route path="/login"         element={!token ? <Login    setToken={setToken} /> : <Navigate to="/" />} />
          <Route path="/register"      element={!token ? <Register setToken={setToken} /> : <Navigate to="/" />} />
          <Route path="/auth/callback" element={<AuthCallback setToken={setToken} />} />

          {/* Aplicación autenticada — navegación/social. `guest` se pasa
              siempre para que Home/Explorer/People/Search/Taxon* muestren su
              propio UI de invitado con la chrome (TopBar/Navbar) puesta;
              antes la chrome desaparecía sin querer para visitantes. */}
          <Route element={<AuthenticatedLayout token={token} guest onLogout={handleLogout} />}>
            <Route path="/inicio" element={<Home token={token} />} />
            {/* Explorar = observaciones; Observaciones (Listado en app) = especies.
                Los rótulos de Navbar no se tocan — solo el contenido de cada ruta. */}
            <Route path="/explorar" element={<Explorer scope="observations" />} />
            <Route path="/observaciones" element={<Explorer scope="discover" />} />
            <Route path="/explorer/:id" element={<ObservationDetail />} />
            <Route path="/paquetes" element={<Packages />} />
            {/* Salidas de campo: las sube la app móvil; la web solo las navega. */}
            <Route path="/salidas-de-campo" element={<FieldTrips />} />
            <Route path="/salidas-de-campo/:id" element={<FieldTripDetail />} />
            <Route
              path="/ajustes"
              element={
                <ProtectedRoute token={token}>
                  <Settings onLogout={handleLogout} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/perfil"
              element={
                <ProtectedRoute token={token}>
                  <OwnProfileRedirect />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ajustes/perfil/editar"
              element={
                <ProtectedRoute token={token}>
                  <EditProfile />
                </ProtectedRoute>
              }
            />
            <Route path="/people/:username" element={<People />} />
            <Route path="/people/:username/observaciones" element={<PeopleObservations />} />
            <Route path="/people/:username/favoritos" element={<PeopleFavorites />} />
            <Route path="/search" element={<Search />} />
            <Route path="/taxa/:taxonIdSlug" element={<TaxonDetail />} />
            <Route path="/taxa/:taxonIdSlug/fotos" element={<TaxonPhotoBrowse />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </Router>
  )
}