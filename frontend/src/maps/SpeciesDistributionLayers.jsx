/**
 * Capas de distribución de una especie sobre Leaflet: mapa de calor y
 * cuadrícula de densidad adaptativa. Extraído de TaxonDetail.jsx (antes
 * vivía embebido ahí) porque es la pieza técnica más elaborada del
 * frontend y vale la pena preservarla/documentarla como módulo aparte,
 * reutilizable y — sobre todo — portable a la app Android si algún día se
 * decide construir un mapa de distribución nativo allí.
 *
 * ── Algoritmo de GridDensityLayer (independiente de Leaflet) ──────────────
 * El problema: pintar cientos/miles de puntos (observaciones propias +
 * registros científicos GBIF) sin saturar el mapa ni degradar el
 * rendimiento, y sin depender de una librería externa de clustering
 * (leaflet.markercluster agrupa por distancia en píxeles de pantalla; esto
 * agrupa por coordenadas geográficas reales, así que el agrupamiento no
 * "salta" al hacer pan/zoom de forma tan brusca).
 *
 * 1. A cada nivel de zoom le corresponde un tamaño de celda en grados
 *    (más zoom → celda más chica → menos agrupación):
 *
 *      zoom <= 3   → 4.0°      zoom 8  → 0.1°
 *      zoom 4      → 2.0°      zoom 9  → 0.05°
 *      zoom 5      → 1.0°      zoom 10 → 0.02°
 *      zoom 6      → 0.5°      zoom 11 → 0.01°
 *      zoom 7      → 0.25°     zoom 12 → 0.005°
 *                              zoom 13 → 0.002°
 *      zoom >= 14  → sin agrupar (se listan los puntos individuales)
 *
 * 2. Con celdas: cada punto se asigna a una celda con
 *    `Math.floor(lat / cellSize) * cellSize` (mismo cálculo para lon).
 *    Se cuenta cuántos puntos caen en cada celda, separando "propios"
 *    (observaciones Anura) de "científicos" (GBIF).
 * 3. Cada celda se dibuja como un rectángulo cuya opacidad es
 *    proporcional a su densidad relativa: `0.3 + (count / maxCount) * 0.55`.
 *    El color depende de qué tipo de punto predomina en la celda (o de la
 *    latitud, en modo altitudinal).
 * 4. Sin celdas (zoom >= 14): se listan los puntos individuales como
 *    marcadores cuadrados, coloreados igual (verde propio / rojo GBIF /
 *    naranja-morado por latitud en modo altitudinal).
 * 5. Los colores se leen en runtime desde las variables CSS del design
 *    system (`--accent-tint`, `--danger`, etc.) para que el mapa respete
 *    el tema activo (claro/oscuro/luz roja) sin lógica propia de temas.
 *
 * Para portar esto a Android: la tabla zoom→cellSize y el binado por
 * `floor(lat/cellSize)` no dependen de Leaflet ni de React — son la parte
 * reutilizable. Solo cambiaría la capa de dibujo (Canvas/Compose en vez de
 * L.Rectangle/L.divIcon).
 */
import { useState, useEffect } from 'react'
import L from 'leaflet'
import 'leaflet.heat'
import { Rectangle, Popup, Tooltip, CircleMarker, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { MdCalendarToday } from 'react-icons/md'
import Avatar from '../components/Avatar'
import { mediaUrl, getRelativeTime, isAudioOnly } from '../lib/format'
import Thumb from '../components/Thumb'

export function HeatmapLayer({ data }) {
  const map = useMap()
  useEffect(() => {
    if (!data || data.length === 0) return
    const points = data.map((pt) => [pt.decimalLatitude, pt.decimalLongitude, 1])
    const heat = L.heatLayer(points, {
      radius: 20,
      blur: 15,
      maxZoom: 10,
      gradient: { 0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red' },
    }).addTo(map)

    return () => {
      map.removeLayer(heat)
    }
  }, [data, map])
  return null
}

export function GridDensityLayer({ data, mapMode, getImageUrl, accentColor = '#FF7A1A' }) {
  const map = useMap()
  const navigate = useNavigate()
  const [zoom, setZoom] = useState(map.getZoom())
  const [hoveredId, setHoveredId] = useState(null)

  useEffect(() => {
    const handleZoom = () => setZoom(map.getZoom())
    map.on('zoomend', handleZoom)
    return () => map.off('zoomend', handleZoom)
  }, [map])

  // Resolución de cuadrícula según nivel de zoom — organizada como en Actividad geográfica de Admin:
  // zoom <= 4  : celda amplia regional (2.0°)
  // zoom 5-6  : celda subregional (0.5°)
  // zoom 7-8  : celda grande (0.28° ~ 31 km)
  // zoom 9-11 : celda media (0.07° ~ 8 km)
  // zoom >= 12: puntos individuales con CircleMarker (avistamientos)
  let cellSize = 0.28
  if (zoom <= 4) cellSize = 2.0
  else if (zoom <= 6) cellSize = 0.5
  else if (zoom <= 8) cellSize = 0.28
  else if (zoom <= 11) cellSize = 0.07
  else cellSize = 0 // zoom >= 12: avistamientos individuales

  const rootStyles = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const mapColors = {
    user: accentColor || rootStyles?.getPropertyValue('--accent-tint')?.trim() || '#FF7A1A',
    scientific: rootStyles?.getPropertyValue('--danger')?.trim() || '#D70015',
    warning: rootStyles?.getPropertyValue('--warning')?.trim() || '#FF9500',
    info: rootStyles?.getPropertyValue('--sys-purple')?.trim() || '#AF52DE',
  }

  // Zoom >= 12: puntos individuales con CircleMarker (como en ANURA Admin Actividad geográfica)
  if (cellSize === 0) {
    return (
      <>
        {data.map((pt, i) => {
          let color = pt.isUserSubmitted ? mapColors.user : mapColors.scientific
          if (mapMode === 'altitudinal') {
            color = pt.isUserSubmitted ? mapColors.user : (pt.decimalLatitude > 8 ? mapColors.warning : mapColors.info)
          }
          if (accentColor) color = accentColor

          return (
            <CircleMarker
              key={pt.id || i}
              center={[pt.decimalLatitude, pt.decimalLongitude]}
              radius={7}
              pathOptions={{
                color: color,
                weight: 2,
                fillColor: '#FFA85C',
                fillOpacity: 0.9,
              }}
            >
              <Tooltip>
                {pt.common_name || pt.ai_class?.replace(/_/g, ' ') || 'Avistamiento'} · {pt.decimalLatitude.toFixed(4)}, {pt.decimalLongitude.toFixed(4)}
              </Tooltip>

              {pt.isUserSubmitted ? (
                <Popup className="inat-popup-wrapper">
                  <div className="inat-popup" onClick={() => navigate(`/explorer/${pt.id}`)}>
                    <div className="popup-image">
                      <Thumb src={getImageUrl(pt.thumbnail_key, 'small')} alt={pt.ai_class || 'Rana'} audioOnly={isAudioOnly(pt)} />
                    </div>
                    <div className="popup-col-center">
                      <h4 className="common-name">{pt.common_name || pt.ai_class?.replace(/_/g, ' ') || 'Sin identificar'}</h4>
                      <span className="scientific-name">({pt.ai_class ? pt.ai_class.replace(/_/g, ' ') : 'Sin identificar'})</span>
                      <span className="date-full">{new Date(pt.recorded_at || pt.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>
                    <div className="popup-col-right">
                      <div className="avatar-top-right" onClick={(e) => { e.stopPropagation(); navigate(`/people/${pt.username}`) }} style={{ cursor: 'pointer' }}>
                        <Avatar src={pt.profile_image ? mediaUrl(pt.profile_image) : ''} alt="u" placeholderClassName="avatar-micro" />
                      </div>
                      <div className="time-bottom-right">
                        <MdCalendarToday aria-hidden /> {getRelativeTime(pt.created_at)}
                      </div>
                    </div>
                  </div>
                </Popup>
              ) : (
                <Popup>
                  <div style={{ fontSize: '13px' }}>
                    <strong>Registro Científico (GBIF)</strong><br />
                    <span className="a-caption a-secondary">
                      Lat: {pt.decimalLatitude.toFixed(5)}, Lon: {pt.decimalLongitude.toFixed(5)}
                    </span>
                  </div>
                </Popup>
              )}
            </CircleMarker>
          )
        })}
      </>
    )
  }

  // Binado adaptativo en celdas de cuadrícula sin cortes ni insets
  const bins = {}
  data.forEach((pt) => {
    const cellLat = Math.floor(pt.decimalLatitude / cellSize) * cellSize
    const cellLon = Math.floor(pt.decimalLongitude / cellSize) * cellSize
    const key = `${cellLat.toFixed(4)},${cellLon.toFixed(4)}`

    if (!bins[key]) {
      bins[key] = { key, lat: cellLat, lon: cellLon, points: [], userCount: 0, scientificCount: 0 }
    }
    bins[key].points.push(pt)
    if (pt.isUserSubmitted) bins[key].userCount++
    else bins[key].scientificCount++
  })

  const cells = Object.values(bins)
  const maxPoints = Math.max(...cells.map((c) => c.points.length), 1)

  return (
    <>
      {cells.map((cell) => {
        const count = cell.points.length
        const ratio = count / maxPoints
        const alpha = 0.18 + ratio * 0.72
        const isHovered = hoveredId === cell.key

        let color = mapColors.scientific
        if (mapMode === 'altitudinal') color = mapColors.info
        else if (cell.userCount > 0) color = mapColors.user
        if (accentColor) color = accentColor

        return (
          <Rectangle
            key={cell.key}
            bounds={[
              [cell.lat, cell.lon],
              [cell.lat + cellSize, cell.lon + cellSize],
            ]}
            pathOptions={{
              color: isHovered ? color : 'transparent',
              weight: isHovered ? 2 : 0,
              fillColor: color,
              fillOpacity: alpha,
            }}
            eventHandlers={{
              mouseover: () => setHoveredId(cell.key),
              mouseout: () => setHoveredId(null),
            }}
          >
            <Tooltip sticky>
              {count} {count === 1 ? 'observación' : 'observaciones'}
              {cell.userCount > 0 ? ` · ${cell.userCount} en Anura` : ''}
            </Tooltip>
            <Popup>
              <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
                <strong style={{ color }}>Cuadrícula de Densidad</strong><br />
                <span>Total observaciones: <strong>{count}</strong></span><br />
                {cell.userCount > 0 && <span>• Observaciones Anura: {cell.userCount}<br /></span>}
                {cell.scientificCount > 0 && <span>• Registros GBIF: {cell.scientificCount}<br /></span>}
                <span className="a-caption a-secondary">
                  Área: {cell.lat.toFixed(3)}° a {(cell.lat + cellSize).toFixed(3)}° Lat<br />
                  {cell.lon.toFixed(3)}° a {(cell.lon + cellSize).toFixed(3)}° Lon
                </span>
              </div>
            </Popup>
          </Rectangle>
        )
      })}
    </>
  )
}
