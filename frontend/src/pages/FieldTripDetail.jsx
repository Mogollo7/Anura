import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MdCalendarToday, MdSchedule, MdPerson, MdWarning, MdVisibilityOff } from 'react-icons/md'
import BackButton from '../components/BackButton'
import LoadingSpinner from '../components/LoadingSpinner'
import Thumb from '../components/Thumb'
import './FieldTripDetail.css'
import { apiGet, ApiError, getThumbUrl } from '../services/api'
import { isAudioOnly } from '../lib/format'
import { fmtTripDate, fmtTripTime, fmtTripDuration, tripTitle, plural } from '../lib/fieldTrips'

const registerIcon = L.divIcon({
  className: 'field-trip-register-icon',
  html: '<div></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
})

const speciesName = (obs) => obs.common_name || obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar'
const scientificName = (obs) => (obs.genus && obs.species ? `${obs.genus} ${obs.species}` : obs.ai_class?.replace(/_/g, ' ') || '')
const thumbOf = (obs) => (obs.thumbnail_key ? getThumbUrl(String(obs.thumbnail_key).split('/').pop(), 'small') : '')

/**
 * Detalle de una salida de campo: quién la hizo, cuándo, y sus observaciones en orden
 * cronológico sobre el mapa. Las posiciones son las de cada observación (la app no registra la
 * ruta GPS), así que el mapa marca puntos, no un recorrido. Una persona ajena solo ve las
 * observaciones públicas; la autora ve también las privadas.
 */
export default function FieldTripDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [trip, setTrip] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ok | notfound | error

  useEffect(() => {
    setStatus('loading')
    apiGet(`/api/explorer/field-trips/${encodeURIComponent(id)}`)
      .then((data) => { setTrip(data); setStatus('ok') })
      .catch((e) => setStatus(e instanceof ApiError && e.status === 404 ? 'notfound' : 'error'))
  }, [id])

  if (status === 'loading') return <LoadingSpinner text="Cargando salida…" />

  if (status !== 'ok') {
    return (
      <div className="field-trip-error" role="alert">
        <MdWarning aria-hidden />
        <p>
          {status === 'notfound'
            ? 'No se encontró esta salida de campo. Puede que se haya eliminado o que aún no tenga observaciones públicas.'
            : 'No se pudo cargar la salida. Revisa tu conexión e inténtalo de nuevo.'}
        </p>
        <button className="btn-primary" onClick={() => navigate('/salidas-de-campo')}>Ver salidas de campo</button>
      </div>
    )
  }

  const observations = trip.observations || []
  const located = observations.filter((o) => o.lat != null && o.lon != null)
  const bounds = located.length > 1 ? L.latLngBounds(located.map((o) => [o.lat, o.lon])) : null
  const duration = fmtTripDuration(trip.started_at, trip.ended_at)
  const hasPrivate = trip.is_mine && observations.some((o) => o.is_private)

  return (
    <div className="field-trip-detail-view theme-aware">
      <header className="field-trip-detail-header">
        <div className="container field-trip-detail-header-inner">
          <BackButton to="/salidas-de-campo" noWrapper />
          <h1>{tripTitle(trip)}</h1>
        </div>
      </header>

      <div className="container field-trip-detail-content">
        <div className="field-trip-meta-row">
          <span><MdPerson aria-hidden /> <Link to={`/people/${trip.username}`} className="text-link">{trip.username}</Link></span>
          <span><MdCalendarToday aria-hidden /> {fmtTripDate(trip.started_at)}</span>
          <span><MdSchedule aria-hidden /> {fmtTripTime(trip.started_at)}{duration ? ` · ${duration}` : ''}</span>
          {!trip.ended_at && <span className="field-trip-badge-active">En curso</span>}
        </div>
        <div className="field-trip-meta-row">
          <span>{plural(trip.observation_count, 'observación', 'observaciones')}</span>
          <span>{plural(trip.species_count, 'especie', 'especies')}</span>
          {hasPrivate && <span><MdVisibilityOff aria-hidden /> Solo tú ves las observaciones privadas</span>}
        </div>

        <section className="field-trip-section">
          <h2>Mapa</h2>
          {located.length === 0 ? (
            <p className="field-trip-empty-hint">Las observaciones de esta salida no tienen ubicación, así que no hay nada que marcar en el mapa.</p>
          ) : (
            <>
              <div className="field-trip-map-wrapper card">
                <MapContainer
                  {...(bounds
                    ? { bounds, boundsOptions: { padding: [32, 32] } }
                    : { center: [located[0].lat, located[0].lon], zoom: 15 })}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                  {located.map((obs) => (
                    <Marker key={obs.id} position={[obs.lat, obs.lon]} icon={registerIcon}>
                      <Popup>
                        <strong>{speciesName(obs)}</strong><br />
                        <i>{scientificName(obs)}</i><br />
                        <span>{fmtTripTime(obs.recorded_at || obs.created_at)}</span><br />
                        <Link to={`/explorer/${obs.id}`}>Ver observación</Link>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
              <p className="field-trip-map-hint">Cada punto es una observación de la salida. La app no guarda la ruta que se caminó.</p>
            </>
          )}
        </section>

        <section className="field-trip-section">
          <div className="field-trip-section-header">
            <h2>Observaciones de esta salida</h2>
            <span>{observations.length}</span>
          </div>
          {observations.length === 0 ? (
            <p className="field-trip-empty-hint">Esta salida aún no tiene observaciones que puedas ver.</p>
          ) : (
            <div className="field-trip-registers-list">
              {observations.map((obs) => (
                <div
                  key={obs.id}
                  className="field-trip-register-row"
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/explorer/${obs.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/explorer/${obs.id}`) }}
                >
                  <div className="field-trip-register-thumb">
                    <Thumb src={thumbOf(obs)} alt={speciesName(obs)} audioOnly={isAudioOnly(obs)} />
                  </div>
                  <div className="field-trip-register-info">
                    <strong>{speciesName(obs)}</strong>
                    <i>{scientificName(obs)}</i>
                  </div>
                  {obs.is_private && <span className="field-trip-register-private">Privada</span>}
                  <span className="field-trip-register-time">{fmtTripTime(obs.recorded_at || obs.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
