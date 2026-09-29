import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MdHiking, MdLocationOn, MdCalendarToday, MdPerson, MdChevronRight, MdCloudOff } from 'react-icons/md'
import './FieldTrips.css'
import { apiGet } from '../services/api'
import { fmtTripDate, tripTitle, plural } from '../lib/fieldTrips'
import LoadingSpinner from '../components/LoadingSpinner'

/**
 * Listado de salidas de campo: recorridos que la gente cierra en la app móvil y que suben con
 * sus observaciones. La web solo las navega. Una salida aparece aquí cuando tiene al menos una
 * observación pública (la autora siempre ve las suyas).
 */
export default function FieldTrips() {
  const navigate = useNavigate()
  const [trips, setTrips] = useState(null)
  const [error, setError] = useState(false)

  const load = () => {
    setError(false)
    setTrips(null)
    apiGet('/api/explorer/field-trips')
      .then((data) => setTrips(Array.isArray(data) ? data : []))
      .catch(() => setError(true))
  }
  useEffect(load, [])

  return (
    <div className="field-trips-view theme-aware">
      <header className="field-trips-header">
        <div className="container">
          <h1><MdHiking aria-hidden /> Salidas de campo</h1>
          <p className="field-trips-subtitle">Recorridos registrados desde la app móvil, con las observaciones de cada salida.</p>
        </div>
      </header>

      <div className="container field-trips-content">
        {error ? (
          <div className="field-trips-state" role="alert">
            <MdCloudOff aria-hidden />
            <p><strong>No se pudieron cargar las salidas.</strong><br />Revisa tu conexión e inténtalo de nuevo.</p>
            <button type="button" className="btn-secondary" onClick={load}>Reintentar</button>
          </div>
        ) : trips === null ? (
          <LoadingSpinner text="Cargando salidas…" />
        ) : trips.length === 0 ? (
          <div className="field-trips-state">
            <MdHiking aria-hidden />
            <p>
              <strong>Aún no hay salidas de campo.</strong><br />
              Se crean en la app móvil: inicia una salida, registra tus observaciones y ciérrala.
              Aparecerá aquí cuando tenga al menos una observación pública.
            </p>
          </div>
        ) : (
          trips.map((trip) => (
            <div
              key={trip.id}
              className="field-trip-card card"
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/salidas-de-campo/${trip.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/salidas-de-campo/${trip.id}`) }}
            >
              <div className="field-trip-card-main">
                <div className="field-trip-card-icon"><MdLocationOn aria-hidden /></div>
                <div className="field-trip-card-body">
                  <strong>{tripTitle(trip)}</strong>
                  <div className="field-trip-card-meta">
                    <span><MdCalendarToday aria-hidden /> {fmtTripDate(trip.started_at)}</span>
                    <span><MdPerson aria-hidden /> {trip.username}</span>
                  </div>
                  <div className="field-trip-card-stats">
                    <span>{plural(trip.observation_count, 'observación', 'observaciones')}</span>
                    <span>{plural(trip.species_count, 'especie', 'especies')}</span>
                    {!trip.ended_at && <span className="field-trip-badge-active">En curso</span>}
                  </div>
                </div>
                <MdChevronRight aria-hidden className="field-trip-card-arrow" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
