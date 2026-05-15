import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { FaGear, FaList, FaMagnifyingGlass, FaMapLocationDot, FaTableCells, FaUser, FaCalendarDays, FaBinoculars, FaFrog, FaLocationDot, FaHeart, FaRegHeart, FaXmark, FaGoogle } from 'react-icons/fa6'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import './Explorer.css'
import { obsIdKey } from '../lib/observationIds'

const API_BASE = import.meta.env.VITE_API_URL || ''

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

const getImageUrl = (key, size = 'medium') => {
  if (!key) return '';
  const filename = key.split('/').pop();
  return `${API_BASE}/api/explorer/thumbnail/${size}/${filename}`;
};

const mediaUrl = (path) => {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const p = path.startsWith('/') ? path : `/${path}`
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
  return `${base}${p}`
}

const getRelativeTime = (dateString) => {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} año${years > 1 ? 's' : ''}`;
  if (months > 0) return `${months} mes${months > 1 ? 'es' : ''}`;
  if (weeks > 0) return `${weeks} semana${weeks > 1 ? 's' : ''}`;
  if (days > 0) return `${days} día${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
  return 'ahora';
};

const SafeAvatar = ({ src, alt, placeholderClassName }) => {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return <span className={placeholderClassName || 'avatar-micro'}><FaUser aria-hidden /></span>
  }

  return (
    <img
      className={placeholderClassName || 'avatar-micro'}
      src={src}
      alt={alt}
      style={{ objectFit: 'cover' }}
      onError={() => setFailed(true)}
    />
  )
}

export default function Explorer() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') || 'observations'; // observations, species, observers
  const subview = searchParams.get('subview') || 'map'; // map, grid, list

  const [observations, setObservations] = useState([])
  const [species, setSpecies] = useState([])
  const [observers, setObservers] = useState([])
  const [stats, setStats] = useState({ observations: 0, observers: 0, species: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const token = localStorage.getItem('anura_token');
  const isLoggedIn = !!token && token !== 'null' && token !== 'undefined';
  const [likedIds, setLikedIds] = useState(new Set());
  const [likeLoading, setLikeLoading] = useState(new Set());
  const [guestModal, setGuestModal] = useState(false);

  useEffect(() => {
    fetchData();
    fetchStats();
    if (isLoggedIn) fetchLikedIds();
  }, [view, isLoggedIn]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/explorer/stats`);
      if (res.ok) setStats(await res.json());
    } catch (e) { console.error(e); }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let endpoint = '/api/explorer/feed';
      if (view === 'species') endpoint = '/api/explorer/species';
      if (view === 'observers') endpoint = '/api/explorer/observers';

      const res = await fetch(`${API_BASE}${endpoint}`);
      if (res.ok) {
        const data = await res.json();
        if (view === 'observations') setObservations(data);
        if (view === 'species') setSpecies(data);
        if (view === 'observers') setObservers(data);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLikedIds = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/explorer/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('anura_token');
        return;
      }
      if (res.ok) {
        const raw = await res.json();
        setLikedIds(new Set(Array.isArray(raw) ? raw.map(obsIdKey) : []));
      }
    } catch { /* silent */ }
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
      const res = await fetch(`${API_BASE}/api/explorer/favorites/${encodeURIComponent(oid)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem('anura_token');
        setGuestModal(true);
        return;
      }
      if (res.ok) {
        const { liked } = await res.json();
        setLikedIds(prev => {
          const next = new Set(prev);
          liked ? next.add(oid) : next.delete(oid);
          return next;
        });
      }
    } catch { /* silent */ }
    finally {
      setLikeLoading(prev => { const n = new Set(prev); n.delete(oid); return n; });
    }
  };

  const HeartBtn = ({ obs }) => {
    const oid = obsIdKey(obs.id);
    const liked = likedIds.has(oid);
    return (
      <button
        className={`po-heart-btn ${liked ? 'liked' : ''}`}
        onClick={e => handleHeart(e, oid)}
        disabled={likeLoading.has(oid)}
      >
        {liked ? <FaHeart aria-hidden /> : <FaRegHeart aria-hidden />}
      </button>
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

  return (
    <div className="explorer-view theme-aware">
      {guestModal && (
        <div className="po-modal-overlay" onClick={() => setGuestModal(false)}>
          <div className="po-modal-card" onClick={e => e.stopPropagation()}>
            <button className="po-modal-close" onClick={() => setGuestModal(false)}><FaXmark /></button>
            <FaHeart aria-hidden className="po-modal-icon" />
            <h2>Guarda tus favoritos</h2>
            <p>Para guardar observaciones en favoritos necesitas iniciar sesión.</p>
            <button className="btn-primary po-modal-login" onClick={() => { window.location.href = `${API_BASE}/api/auth/google`; }}>
              <FaGoogle aria-hidden /> Continuar con Google
            </button>
          </div>
        </div>
      )}
      {/* Header / Search Section */}
      <header className="explorer-header">
        <div className="container header-flex">
          <h1 className="logo-text">Observaciones</h1>
          <div className="search-group">
            <div className="search-input-wrapper">
              <span className="search-icon"><FaMagnifyingGlass aria-hidden /></span>
              <input
                type="text"
                placeholder="Especie"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="search-input-wrapper">
              <input type="text" placeholder="Ubicación" />
            </div>
            <button className="btn-search">Busca</button>
            <button className="btn-filters"><FaGear aria-hidden /> Filtros</button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <section className="explorer-stats-bar">
        <div className="container stats-flex">
          <div className={`stat-box ${view === 'observations' ? 'green-box active' : 'grey-box'}`} onClick={() => setView('observations')}>
            <span className="stat-number">{stats.observations.toLocaleString()}</span>
            <span className="stat-label">OBSERVACIONES</span>
          </div>
          <div className={`stat-box ${view === 'species' ? 'green-box active' : 'grey-box'}`} onClick={() => setView('species')}>
            <span className="stat-number">{stats.species ? stats.species.toLocaleString() : '0'}</span>
            <span className="stat-label">ESPECIES</span>
          </div>
          <div className={`stat-box ${view === 'observers' ? 'green-box active' : 'grey-box'}`} onClick={() => setView('observers')}>
            <span className="stat-number">{stats.observers.toLocaleString()}</span>
            <span className="stat-label">OBSERVADORES</span>
          </div>
        </div>
      </section>

      {/* View Switcher */}
      {view === 'observations' ? (
        <div className="view-switcher-bar">
          <div className="container switcher-flex">
            <div className="tabs">
              <button className={subview === 'map' ? 'active' : ''} onClick={() => setSubview('map')}><FaMapLocationDot aria-hidden /> Mapa</button>
              <button className={subview === 'grid' ? 'active' : ''} onClick={() => setSubview('grid')}><FaTableCells aria-hidden /> Cuadrícula</button>
              <button className={subview === 'list' ? 'active' : ''} onClick={() => setSubview('list')}><FaList aria-hidden /> Lista</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="view-switcher-bar" style={{ visibility: 'hidden' }} aria-hidden="true">
          <div className="container switcher-flex">
            <div className="tabs">
              <button><FaList aria-hidden /> Lista</button>
            </div>
          </div>
        </div>
      )}

      <main className="explorer-main">
        <div className="container">
          {loading ? (
            <div className="loading-state">Cargando datos...</div>
          ) : (
            <>
              {/* RENDER LOGIC BASED ON VIEW AND SUBVIEW */}

              {/* VIEW: OBSERVATIONS */}
              {view === 'observations' && (
                <>
                  {subview === 'map' && (
                    <div className="map-wrapper card">
                      <MapContainer center={[4.5709, -74.2973]} zoom={5} style={{ height: '600px', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        {observations.map(obs => obs.lat && obs.lon && (
                          <Marker key={obs.id} position={[obs.lat, obs.lon]}>
                            <Popup className="inat-popup-wrapper">
                              <div className="inat-popup" onClick={() => navigate(`/explorer/${obs.id}`)}>
                                {/* Column 1: Image */}
                                <div className="popup-image">
                                  <img src={getImageUrl(obs.thumbnail_key, 'small')} alt={obs.ai_class || 'Rana'} />
                                </div>

                                {/* Column 2: Details */}
                                <div className="popup-col-center">
                                  <h4 className="common-name">{obs.common_name || obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar'}</h4>
                                  <span className="scientific-name">({obs.ai_class ? obs.ai_class.replace(/_/g, ' ') : 'Sin identificar'})</span>
                                  <span className="date-full">{new Date(obs.recorded_at || obs.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                                </div>

                                {/* Column 3: Meta */}
                                <div className="popup-col-right">
                                  <div className="avatar-top-right" onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/people/${obs.username}`);
                                  }} style={{ cursor: 'pointer' }}>
                                    <SafeAvatar
                                      src={obs.profile_image ? mediaUrl(obs.profile_image) : ''}
                                      alt="u"
                                      placeholderClassName="avatar-micro"
                                    />
                                    <span className="popup-user-name" style={{ fontSize: '10px', display: 'block', textAlign: 'center', marginTop: '2px', color: 'var(--primary)' }}>
                                      {obs.username}
                                    </span>
                                  </div>
                                  <div className="time-bottom-right">
                                    <FaCalendarDays aria-hidden /> {getRelativeTime(obs.created_at)}
                                  </div>
                                </div>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                      </MapContainer>
                    </div>
                  )}
                  {subview === 'grid' && (
                    <div className="obs-grid-pro">
                      {observations.map(obs => (
                        <div key={obs.id} className="species-card card-no-border" onClick={() => navigate(`/explorer/${obs.id}`)}>
                          <div className="species-img-wrapper">
                            <img src={getImageUrl(obs.thumbnail_key, 'medium')} alt="thumb" />
                            <HeartBtn obs={obs} />
                            <div className="obs-overlay-bar">
                              <span className="obs-id-overlay">ID: {obs.id.split('-')[0]}</span>
                              <span className="obs-time-overlay">
                                <FaCalendarDays aria-hidden /> {getRelativeTime(obs.created_at)}
                              </span>
                            </div>
                          </div>
                          <div className="species-info">
                            <span className="species-common">{obs.common_name || 'Sin identificar'}</span>
                            <span className="species-scientific">{obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar'}</span>
                            
                            <div className="obs-user-row" onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/people/${obs.username}`);
                            }} style={{ cursor: 'pointer' }}>
                              <SafeAvatar
                                src={obs.profile_image ? mediaUrl(obs.profile_image) : ''}
                                alt="u"
                                placeholderClassName="avatar-micro"
                              />
                              <span className="obs-username-small">{obs.username}</span>
                            </div>
                          </div>
                        </div>
                      ))}
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
                          {observations.map(obs => (
                            <tr key={obs.id} onClick={() => navigate(`/explorer/${obs.id}`)} style={{ cursor: 'pointer' }}>
                              <td data-label="Multimedia" data-mobile-type="media" className="td-media">
                                <img src={getImageUrl(obs.thumbnail_key, 'small')} alt="thumb" />
                              </td>
                              <td data-label="Nombre" data-mobile-type="name">
                                <div className="name-stack">
                                  <strong>{obs.common_name || 'Sin identificar'}</strong>
                                  <small>{obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar'}</small>
                                </div>
                              </td>
                              <td data-label="Usuario" data-mobile-type="user">
                                <div className="user-stack" onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/people/${obs.username}`);
                                }} style={{ cursor: 'pointer' }}>
                                  <SafeAvatar
                                    src={obs.profile_image ? mediaUrl(obs.profile_image) : ''}
                                    alt="u"
                                    placeholderClassName="avatar-micro"
                                  />
                                  <span>{obs.username}</span>
                                </div>
                              </td>
                              <td data-label="Fecha" data-mobile-type="date">{new Date(obs.recorded_at || obs.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                              <td data-label="Lugar" data-mobile-type="place">
                                <FaLocationDot aria-hidden className="inline-icon" /> {obs.place_guess || (obs.lat ? `${obs.lat.toFixed(2)}, ${obs.lon.toFixed(2)}` : 'Desconocido')}
                              </td>
                              <td data-label="Añadido" data-mobile-type="added">{new Date(obs.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                              <td className="td-actions">
                                <HeartBtn obs={obs} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* VIEW: SPECIES */}
              {view === 'species' && (
                <div className="obs-grid-pro species-view-pullup">
                  {species.map(s => (
                    <div key={s.scientific_name} className="species-card card-no-border">
                      <div className="species-img-wrapper">
                        <img src={getImageUrl(s.thumbnail_key, 'medium')} alt={s.scientific_name} />
                        <div className="obs-overlay-bar">
                          <span className="obs-id-overlay">{s.obs_count.toLocaleString()} observaciones</span>
                        </div>
                      </div>
                      <div className="species-info">
                        <span className="species-common">{s.common_name || 'Sin nombre común'}</span>
                        <span className="species-scientific">{s.scientific_name?.replace(/_/g, ' ') || 'Sp.'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* VIEW: OBSERVERS */}
              {view === 'observers' && (
                <div className="observers-list card">
                  <table className="observers-table">
                    <thead>
                      <tr>
                        <th className="hide-mobile">Posición</th>
                        <th>Usuario</th>
                        <th className="hide-mobile">Observaciones</th>
                        <th className="hide-mobile">Especies</th>
                      </tr>
                    </thead>
                    <tbody>
                      {observers.map((u, i) => (
                        <tr key={u.username} onClick={() => navigate(`/people/${u.username}`)} style={{ cursor: 'pointer' }}>
                          <td data-label="Posición" className="hide-mobile">{i + 1}</td>
                          <td data-label="Usuario" className="user-td">
                            <SafeAvatar
                              src={u.profile_image ? mediaUrl(u.profile_image) : ''}
                              alt="avatar"
                              placeholderClassName="avatar-mini"
                            />
                            <div className="user-info-stack">
                              <span className="username-main">{u.username}</span>
                              <div className="user-stats-row show-mobile grid">
                                <span className="stat-item"><FaBinoculars aria-hidden /> {parseInt(u.obs_count).toLocaleString()}</span>
                                <span className="stat-item"><FaFrog aria-hidden /> {parseInt(u.species_count).toLocaleString()}</span>
                              </div>
                            </div>
                          </td>
                          <td data-label="Observaciones" className="hide-mobile"><FaBinoculars aria-hidden /> {parseInt(u.obs_count).toLocaleString()}</td>
                          <td data-label="Especies" className="hide-mobile"><FaFrog aria-hidden /> {parseInt(u.species_count).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
