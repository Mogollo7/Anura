import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdPerson, MdExplore, MdFormatListBulleted, MdCalendarToday, MdLocationOn, MdChevronRight, MdHiking } from 'react-icons/md'
import './Home.css'
import { apiGet, getThumbUrl } from '../services/api'
import { mediaUrl, getRelativeTime, isAudioOnly } from '../lib/format'
import Avatar from '../components/Avatar'
import Thumb from '../components/Thumb'
import LoadingSpinner from '../components/LoadingSpinner'

const getImageUrl = (key, size = 'medium') => {
  if (!key) return ''
  return getThumbUrl(String(key).split('/').pop(), size)
}

/**
 * Pantalla de inicio: accesos a las secciones y la actividad reciente
 * (observaciones sincronizadas desde el celular).
 */
export default function Home({ token }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState(null)
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (token) {
      apiGet('/api/auth/me').then((data) => setUsername(data.user?.username || null)).catch(() => {})
    }
  }, [token])

  useEffect(() => {
    apiGet('/api/explorer/feed', { auth: false })
      .then((data) => setRecent(Array.isArray(data) ? data.slice(0, 8) : []))
      .catch(() => setRecent([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="home-view theme-aware">
      <header className="home-greeting">
        <div className="container home-greeting-inner">
          <div className="home-avatar"><MdPerson aria-hidden /></div>
          <div>
            <p className="home-brand">Bienvenido</p>
            <h1>{username ? `Hola, ${username}` : 'Hola'}</h1>
          </div>
        </div>
      </header>

      <div className="container home-content">
        <section className="home-shortcuts">
          <button type="button" className="home-shortcut-card" onClick={() => navigate('/explorar')}>
            <span className="home-shortcut-icon"><MdExplore aria-hidden /></span>
            <span>
              <strong>Explorar</strong>
              <small>Mapa, cuadrícula y lista de observaciones</small>
            </span>
            <MdChevronRight aria-hidden className="home-shortcut-arrow" />
          </button>
          <button type="button" className="home-shortcut-card" onClick={() => navigate('/observaciones')}>
            <span className="home-shortcut-icon"><MdFormatListBulleted aria-hidden /></span>
            <span>
              <strong>Observaciones</strong>
              <small>Especies y observadores</small>
            </span>
            <MdChevronRight aria-hidden className="home-shortcut-arrow" />
          </button>
          <button type="button" className="home-shortcut-card" onClick={() => navigate('/salidas-de-campo')}>
            <span className="home-shortcut-icon"><MdHiking aria-hidden /></span>
            <span>
              <strong>Salidas de campo</strong>
              <small>Recorridos hechos con la app móvil</small>
            </span>
            <MdChevronRight aria-hidden className="home-shortcut-arrow" />
          </button>
        </section>

        <section className="home-recent-section">
          <div className="home-section-header">
            <h2>Actividad reciente</h2>
            <button type="button" className="home-see-all" onClick={() => navigate('/explorar')}>Ver todas</button>
          </div>

          {loading ? (
            <LoadingSpinner text="Cargando actividad…" />
          ) : recent.length === 0 ? (
            <p className="home-empty-hint">Aún no hay observaciones registradas.</p>
          ) : (
            <div className="home-recent-list">
              {recent.map((obs) => (
                <div key={obs.id} className="home-recent-item" onClick={() => navigate(`/explorer/${obs.id}`)}>
                  <div className="home-recent-thumb">
                    <Thumb src={getImageUrl(obs.thumbnail_key, 'small')} alt={obs.common_name || 'Observación'} audioOnly={isAudioOnly(obs)} />
                  </div>
                  <div className="home-recent-info">
                    <strong>{obs.common_name || obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar'}</strong>
                    <div className="home-recent-meta">
                      <Avatar
                        src={obs.profile_image ? mediaUrl(obs.profile_image) : ''}
                        alt={obs.username}
                        placeholderClassName="avatar-micro"
                      />
                      <span className="home-recent-username">{obs.username}</span>
                      <span className="home-recent-sep">·</span>
                      <span><MdCalendarToday aria-hidden /> {getRelativeTime(obs.recorded_at || obs.created_at)}</span>
                      {obs.place_guess && <span className="home-recent-place"><MdLocationOn aria-hidden /> {obs.place_guess}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
