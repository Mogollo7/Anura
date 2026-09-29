import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer } from 'react-leaflet'
import { MdFormatListBulleted, MdSearch, MdMap, MdGridView, MdCalendarToday, MdVisibility, MdLocationOn, MdCloudOff } from 'react-icons/md'
import { FaFrog } from 'react-icons/fa6'
import 'leaflet/dist/leaflet.css'
import '../styles/species-card.css'
import './Explorer.css'
import { obsIdKey } from '../lib/observationIds'
import { mediaUrl, getRelativeTime, getTaxonSlug, isAudioOnly, formatAiProbPercent } from '../lib/format'
import LoadingSpinner from '../components/LoadingSpinner'
import Avatar from '../components/Avatar'
import GuestLoginModal from '../components/GuestLoginModal'
import FavoriteHeartButton from '../components/FavoriteHeartButton'
import { apiGet, apiPost, getThumbUrl } from '../services/api'
import Thumb from '../components/Thumb'
import { GridDensityLayer } from '../maps/SpeciesDistributionLayers'

// Mismo naranja de acento que usa el grid de densidad en Android
// (`GridDensityOverlay.kt` → `MapDensityAccentColor`, #FF7A1A).
const MAP_DENSITY_ACCENT = '#FF7A1A'

const getImageUrl = (key, size = 'medium') => {
  if (!key) return '';
  const filename = key.split('/').pop();
  return getThumbUrl(filename, size);
};

// `scope="observations"` (ruta /explorar) = feed Mapa/Cuadrícula/Lista.
// `scope="discover"` (ruta /observaciones, Listado en Android) = Especies/Observadores.
export default function Explorer({ scope = 'observations' }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const allowedViews = scope === 'discover' ? ['species', 'observers'] : ['observations'];
  const requestedView = searchParams.get('view');
  const view = allowedViews.includes(requestedView) ? requestedView : allowedViews[0];
  const subview = searchParams.get('subview') || 'map'; // map, grid, list

  const [observations, setObservations] = useState([])
  const [species, setSpecies] = useState([])
  const [observers, setObservers] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  
  // Filtro local — vivo, sin botón "Buscar" (ver switcher-bar más abajo)
  const [search, setSearch] = useState('')
  const [filteredObservers, setFilteredObservers] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef(null)

  const isLoggedIn = (() => {
    const t = localStorage.getItem('anura_token');
    return !!t && t !== 'null' && t !== 'undefined';
  })();
  const [likedIds, setLikedIds] = useState(new Set());
  const [likeLoading, setLikeLoading] = useState(new Set());
  const [guestModal, setGuestModal] = useState(false);

  useEffect(() => {
    fetchStats();
    if (isLoggedIn) fetchLikedIds();
  }, [view, isLoggedIn]);

  useEffect(() => {
    const q = search.trim();
    // Un carácter se filtra en el cliente. Desde dos, se pide al servidor para
    // alcanzar observaciones que no caben en la primera página del feed.
    if (q.length === 1) return undefined;
    const serverQ = view === 'observations' && q.length >= 2 ? q : '';
    const timer = setTimeout(() => fetchData(serverQ), q.length >= 2 ? 280 : 0);
    return () => clearTimeout(timer);
  }, [view, search]);

  const fetchStats = async () => {
    try {
      const data = await apiGet('/api/explorer/stats', { auth: false });
      setStats(data);
    } catch { setStats(null); }
  };

  const fetchData = async (q = '') => {
    setLoading(true);
    setLoadError(false);
    try {
      let endpoint = '/api/explorer/feed';
      if (q) endpoint += `?q=${encodeURIComponent(q)}`;
      if (view === 'species') endpoint = '/api/explorer/species';
      if (view === 'observers') endpoint = '/api/explorer/observers';

      const data = await apiGet(endpoint, { auth: false });
      if (view === 'observations') setObservations(data);
      if (view === 'species') setSpecies(data);
      if (view === 'observers') setObservers(data);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // Vacío por filtro ≠ vacío de verdad: antes decía 'coincidan con ""' aun
  // sin haber escrito nada.
  const noResults = (plural, singular, feminine = true) => (search.trim()
    ? `${feminine ? 'Ninguna' : 'Ningún'} ${singular} coincide con «${search.trim()}».`
    : `Todavía no hay ${plural}.`)

  const fetchLikedIds = async () => {
    try {
      const raw = await apiGet('/api/explorer/favorites');
      setLikedIds(new Set(Array.isArray(raw) ? raw.map(obsIdKey) : []));
    } catch (err) {
      if (err.status === 401) localStorage.removeItem('anura_token');
    }
  };

  const handleHeart = async (e, obsId) => {
    e.stopPropagation();
    if (!isLoggedIn) {
      localStorage.setItem('anura_pending_favorite', obsIdKey(obsId));
      localStorage.setItem('anura_pending_url', window.location.pathname + window.location.search);
      setGuestModal(true);
      return;
    }
    const oid = obsIdKey(obsId);
    setLikeLoading(prev => new Set(prev).add(oid));
    try {
      const { liked } = await apiPost(`/api/explorer/favorites/${encodeURIComponent(oid)}`, {})
      setLikedIds(prev => {
        const next = new Set(prev);
        liked ? next.add(oid) : next.delete(oid);
        return next;
      });
    } catch (err) {
      if (err.status === 401) {
        localStorage.removeItem('anura_token');
        setGuestModal(true);
      }
    } finally {
      setLikeLoading(prev => { const n = new Set(prev); n.delete(oid); return n; });
    }
  };

  const HeartBtn = ({ obs }) => {
    const oid = obsIdKey(obs.id);
    const liked = likedIds.has(oid);
    return (
      <FavoriteHeartButton
        liked={liked}
        disabled={likeLoading.has(oid)}
        onClick={e => handleHeart(e, oid)}
        title={liked ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      />
    );
  };

  const setView = (v) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('view', v);
    setSearchParams(newParams);
  };

  const setSubview = (sv) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('subview', sv);
    setSearchParams(newParams);
  };

  // ── FILTERING LOGIC ──────────────────────────────────────────────────
  
  const filteredObservations = observations.filter(obs => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (obs.common_name && obs.common_name.toLowerCase().includes(q)) ||
      (obs.ai_class && obs.ai_class.toLowerCase().includes(q)) ||
      (obs.genus && obs.genus.toLowerCase().includes(q)) ||
      (obs.species && obs.species.toLowerCase().includes(q)) ||
      (obs.family && obs.family.toLowerCase().includes(q)) ||
      (obs.order_name && obs.order_name.toLowerCase().includes(q)) ||
      (obs.class_name && obs.class_name.toLowerCase().includes(q)) ||
      (obs.username && obs.username.toLowerCase().includes(q))
    );
  });

  const filteredSpecies = species.filter(s => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (s.common_name && s.common_name.toLowerCase().includes(q)) ||
      (s.scientific_name && s.scientific_name.toLowerCase().includes(q)) ||
      (s.family && s.family.toLowerCase().includes(q)) ||
      (s.order_name && s.order_name.toLowerCase().includes(q)) ||
      (s.class_name && s.class_name.toLowerCase().includes(q))
    );
  });

  // Observers filter logic with backend fetch for species ranking
  useEffect(() => {
    if (view === 'observers' && search.trim()) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setSearchLoading(true);
        try {
          const data = await apiGet(`/api/explorer/observers/by-species?q=${encodeURIComponent(search.trim())}`, { auth: false });
          if (data.length > 0) {
            setFilteredObservers(data);
          } else {
            // Fallback to basic username search if no species match
            setFilteredObservers(observers.filter(u => u.username.toLowerCase().includes(search.toLowerCase())));
          }
        } catch (e) {
          console.error(e);
        } finally {
          setSearchLoading(false);
        }
      }, 300);
    } else {
      setFilteredObservers(observers);
    }
  }, [search, view, observers]);

  return (
    <div className="explorer-view theme-aware">
      {guestModal && (
        <GuestLoginModal
          onClose={() => setGuestModal(false)}
          description="Para guardar observaciones en favoritos necesitas iniciar sesión."
          showCancel={false}
        />
      )}
      {/* Header */}
      <header className="explorer-header">
        <div className="container header-flex">
          <h1 className="logo-text">{scope === 'discover' ? 'Observaciones' : 'Explorar'}</h1>
          {stats && (
            <span className="explorer-count">
              {scope === 'discover'
                ? `${(stats.species || 0).toLocaleString()} especies · ${(stats.observers || 0).toLocaleString()} observadores`
                : `${(stats.observations || 0).toLocaleString()} registradas`}
            </span>
          )}
        </div>
      </header>

      {/* Switcher: subvista (observaciones) o Especies/Observadores (explorar) + filtro local */}
      <div className="view-switcher-bar">
        <div className="container switcher-flex">
          <div className="tabs">
            {scope === 'discover' ? (
              <>
                <button className={view === 'species' ? 'active' : ''} onClick={() => setView('species')}>Especies</button>
                <button className={view === 'observers' ? 'active' : ''} onClick={() => setView('observers')}>Observadores</button>
              </>
            ) : (
              <>
                <button className={subview === 'map' ? 'active' : ''} onClick={() => setSubview('map')}><MdMap aria-hidden /> Mapa</button>
                <button className={subview === 'grid' ? 'active' : ''} onClick={() => setSubview('grid')}><MdGridView aria-hidden /> Cuadrícula</button>
                <button className={subview === 'list' ? 'active' : ''} onClick={() => setSubview('list')}><MdFormatListBulleted aria-hidden /> Lista</button>
              </>
            )}
          </div>

          {/* Filtro local sobre lo ya cargado — distinto de la búsqueda global
              del TopBar (esa consulta al backend y navega a /search). Antes
              esto era una segunda barra de búsqueda casi idéntica a la del
              TopBar, junto al título de la página; ahora es un filtro
              explícito dentro de la barra de vistas. */}
          <div className="explorer-filter-wrapper">
            <MdSearch className="explorer-filter-icon" aria-hidden />
            <input
              type="text"
              className="explorer-filter-input"
              placeholder={scope === 'discover' ? 'Filtrar especies u observadores…' : 'Filtrar por especie, lugar…'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <main className="explorer-main">
        <div className="container">
          {loading ? (
            <LoadingSpinner text="Cargando…" />
          ) : loadError ? (
            <div className="explorer-load-error" role="alert">
              <MdCloudOff aria-hidden />
              <p><strong>No se pudo cargar la información.</strong><br />Revisa tu conexión e inténtalo de nuevo.</p>
              <button type="button" className="btn-secondary" onClick={() => { fetchData(search.trim().length >= 2 ? search.trim() : ''); fetchStats(); }}>Reintentar</button>
            </div>
          ) : (
            <>
              {/* VIEW: OBSERVATIONS */}
              {view === 'observations' && (
                <>
                  {subview === 'map' && (
                    <div className="map-split-view">
                      {/* Panel lateral — solo aporta en escritorio (más espacio
                          que un móvil); en pantallas chicas queda oculto y el
                          mapa vuelve a ocupar todo el ancho, como antes. */}
                      <div className="map-side-list">
                        {filteredObservations.length === 0 ? (
                          <div className="no-results">{noResults('observaciones', 'observación')}</div>
                        ) : filteredObservations.map(obs => (
                          <div key={obs.id} className="map-side-item" onClick={() => navigate(`/explorer/${obs.id}`)}>
                            <div className="map-side-thumb">
                              <Thumb src={getImageUrl(obs.thumbnail_key, 'small')} alt={obs.common_name || 'Observación'} audioOnly={isAudioOnly(obs)} />
                            </div>
                            <div className="map-side-info">
                              <strong>{obs.common_name || obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar'}</strong>
                              {formatAiProbPercent(obs.ai_prob) && (
                                <span className="map-side-prob">{formatAiProbPercent(obs.ai_prob)}</span>
                              )}
                              <span className="map-side-meta"><MdCalendarToday aria-hidden /> {getRelativeTime(obs.created_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="map-wrapper card">
                        <div className="geo-map-header">
                          <div className="geo-map-title-row">
                            <h3 className="geo-map-title">Actividad geográfica</h3>
                            <span className="geo-map-badge">Colombia · En vivo</span>
                          </div>
                          <p className="geo-map-subtitle">
                            Cuadrícula de densidad adaptativa — {filteredObservations.filter(obs => obs.lat && obs.lon).length} observaciones georreferenciadas. Acerca el zoom (nivel 12+) para ver los avistamientos individuales.
                          </p>
                        </div>
                        <div className="geo-map-canvas">
                          <MapContainer center={[6.25, -75.60]} zoom={7} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                            <TileLayer
                              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            />
                            <GridDensityLayer
                              data={filteredObservations
                                .filter(obs => obs.lat && obs.lon)
                                .map(obs => ({
                                  ...obs,
                                  decimalLatitude: parseFloat(obs.lat),
                                  decimalLongitude: parseFloat(obs.lon),
                                  isUserSubmitted: true,
                                }))}
                              getImageUrl={getImageUrl}
                              accentColor={MAP_DENSITY_ACCENT}
                            />
                          </MapContainer>
                        </div>
                      </div>
                    </div>
                  )}
                  {subview === 'grid' && (
                    <div className="obs-grid-pro">
                      {filteredObservations.map(obs => (
                        <div key={obs.id} className="species-card" onClick={() => navigate(`/explorer/${obs.id}`)}>
                          <div className="species-img-wrapper">
                            <Thumb src={getImageUrl(obs.thumbnail_key, 'medium')} alt="" audioOnly={isAudioOnly(obs)} />
                            <HeartBtn obs={obs} />
                            <div className="species-info">
                              <span className="species-common">{obs.common_name || 'Sin identificar'}</span>
                              <span className="species-scientific">{obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar'}</span>
                              {formatAiProbPercent(obs.ai_prob) && (
                                <span className="species-ai-prob">{formatAiProbPercent(obs.ai_prob)}</span>
                              )}
                              <div className="obs-user-row" onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/people/${obs.username}`);
                              }} style={{ cursor: 'pointer' }}>
                                <Avatar
                                  src={obs.profile_image ? mediaUrl(obs.profile_image) : ''}
                                  alt="u"
                                  placeholderClassName="avatar-micro"
                                />
                                <span className="obs-username-small">{obs.username}</span>
                                <span className="obs-time-overlay"><MdCalendarToday aria-hidden /> {getRelativeTime(obs.created_at)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredObservations.length === 0 && (
                         <div className="no-results">{noResults('observaciones', 'observación')}</div>
                      )}
                    </div>
                  )}
                  {subview === 'list' && (
                    <div className="obs-list-pro card">
                      <table className="obs-table-full">
                        <thead>
                          <tr>
                            <th>Multimedia</th>
                            <th>Nombre</th>
                            <th>Usuario</th>
                            <th>Fecha</th>
                            <th>Lugar</th>
                            <th>Añadido</th>
                            <th className="th-actions"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredObservations.map(obs => (
                            <tr key={obs.id} onClick={() => navigate(`/explorer/${obs.id}`)} style={{ cursor: 'pointer' }}>
                              <td data-label="Multimedia" data-mobile-type="media" className="td-media">
                                <Thumb src={getImageUrl(obs.thumbnail_key, 'small')} alt="thumb" audioOnly={isAudioOnly(obs)} />
                              </td>
                              <td data-label="Nombre" data-mobile-type="name">
                                <div className="name-stack">
                                  <strong>{obs.common_name || 'Sin identificar'}</strong>
                                  <small onClick={(e) => {
                                    const slug = getTaxonSlug(obs.taxon_id, obs.ai_class?.replace(/_/g, ' '));
                                    if (slug) {
                                      e.stopPropagation();
                                      navigate(slug);
                                    }
                                  }} className="taxon-clickable-small">
                                    {obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar'}
                                    {formatAiProbPercent(obs.ai_prob) ? ` · ${formatAiProbPercent(obs.ai_prob)}` : ''}
                                  </small>
                                </div>
                              </td>
                              <td data-label="Usuario" data-mobile-type="user">
                                <div className="user-stack" onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/people/${obs.username}`);
                                }} style={{ cursor: 'pointer' }}>
                                  <Avatar
                                    src={obs.profile_image ? mediaUrl(obs.profile_image) : ''}
                                    alt="u"
                                    placeholderClassName="avatar-micro"
                                  />
                                  <span>{obs.username}</span>
                                </div>
                              </td>
                              <td data-label="Fecha" data-mobile-type="date">{new Date(obs.recorded_at || obs.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                              <td data-label="Lugar" data-mobile-type="place">
                                <MdLocationOn aria-hidden className="inline-icon" /> {obs.place_guess || (obs.lat ? `${obs.lat.toFixed(2)}, ${obs.lon.toFixed(2)}` : 'Desconocido')}
                              </td>
                              <td data-label="Añadido" data-mobile-type="added">{new Date(obs.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                              <td className="td-actions">
                                <HeartBtn obs={obs} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredObservations.length === 0 && (
                         <div className="no-results" style={{padding: '2rem'}}>{noResults('observaciones', 'observación')}</div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* VIEW: SPECIES */}
              {view === 'species' && (
                <div className="obs-grid-pro">
                  {filteredSpecies.map(s => (
                    <div key={s.scientific_name} className="species-card" onClick={() => {
                      const slug = getTaxonSlug(s.taxon_id, s.scientific_name);
                      if (slug) navigate(slug);
                    }}>
                      <div className="species-img-wrapper">
                        <Thumb src={getImageUrl(s.thumbnail_key, 'medium')} alt="" />
                        <span className="species-count-badge">{s.obs_count.toLocaleString()}</span>
                        <div className="species-info">
                          <span className="species-common">{s.common_name || 'Sin nombre común'}</span>
                          <span className="species-scientific">{s.scientific_name?.replace(/_/g, ' ') || 'Sp.'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredSpecies.length === 0 && (
                     <div className="no-results" style={{gridColumn: '1 / -1'}}>{noResults('especies', 'especie')}</div>
                  )}
                </div>
              )}

              {/* VIEW: OBSERVERS */}
              {view === 'observers' && (
                <div className="observers-list card">
                  {searchLoading ? (
                    <LoadingSpinner text="Buscando observadores..." />
                  ) : (
                    <>
                      <table className="observers-table">
                        <thead>
                          <tr>
                            <th className="hide-mobile">Posición</th>
                            <th>Usuario</th>
                            <th className="hide-mobile">Observaciones{search ? ' de especie' : ''}</th>
                            <th className="hide-mobile">Especies</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredObservers.map((u, i) => (
                            <tr key={u.username} onClick={() => navigate(`/people/${u.username}`)} style={{ cursor: 'pointer' }}>
                              <td data-label="Posición" className="hide-mobile">{i + 1}</td>
                              <td data-label="Usuario" className="user-td">
                                <Avatar
                                  src={u.profile_image ? mediaUrl(u.profile_image) : ''}
                                  alt="avatar"
                                  placeholderClassName="avatar-mini"
                                />
                                <div className="user-info-stack">
                                  <span className="username-main">{u.username}</span>
                                  <div className="user-stats-row show-mobile grid">
                                    <span className="stat-item"><MdVisibility aria-hidden /> {parseInt(u.species_obs_count || u.obs_count).toLocaleString()}</span>
                                    <span className="stat-item"><FaFrog aria-hidden /> {parseInt(u.species_count).toLocaleString()}</span>
                                  </div>
                                </div>
                              </td>
                              <td data-label="Observaciones" className="hide-mobile"><MdVisibility aria-hidden /> {parseInt(u.species_obs_count || u.obs_count).toLocaleString()}</td>
                              <td data-label="Especies" className="hide-mobile"><FaFrog aria-hidden /> {parseInt(u.species_count).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredObservers.length === 0 && (
                         <div className="no-results" style={{padding: '2rem'}}>{noResults('observadores', 'observador', false)}</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
