import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MdStickyNote2, MdWarning, MdPerson, MdFavorite, MdFavoriteBorder, MdRefresh, MdLock, MdShare, MdPersonAdd } from 'react-icons/md';
import 'leaflet/dist/leaflet.css';
import { obsIdKey } from '../lib/observationIds';
import { mediaUrl, getTaxonSlug, formatAiProbPercent } from '../lib/format';
import './ObservationDetail.css';
import LoadingSpinner from '../components/LoadingSpinner';
import BackButton from '../components/BackButton';
import MediaCarousel from '../components/MediaCarousel';
import GuestLoginModal from '../components/GuestLoginModal';
import CommentsSection from '../components/CommentsSection';
import { usePublishedSpecies, publishedToSpecies } from '../species/publishedCatalog';
import { apiGet, apiPost, getThumbUrl } from '../services/api';

// Un campo vacío no se muestra: ni "-" ni texto de relleno (mismo criterio que TaxonDetail).
const has = (v) => v != null && v !== '' && v !== '-';

const IUCN_LABEL = {
  LC: 'Preocupación menor',
  NT: 'Casi amenazada',
  VU: 'Vulnerable',
  EN: 'En peligro',
  CR: 'En peligro crítico',
  EW: 'Extinta en estado silvestre',
  EX: 'Extinta',
  DD: 'Datos insuficientes',
};

const altitudeLabel = (r) => {
  if (!r) return null;
  if (r.min != null && r.max != null) return `${r.min} – ${r.max} m`;
  if (r.min != null) return `desde ${r.min} m`;
  if (r.max != null) return `hasta ${r.max} m`;
  return null;
};

const tunnelThumb = (key, size = 'medium') => {
  if (!key) return '';
  const filename = String(key).split('/').pop();
  return getThumbUrl(filename, size);
};

export default function ObservationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [obs, setObs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [guestPrompt, setGuestPrompt] = useState(null);
  const [shareNotice, setShareNotice] = useState('');
  const [myUsername, setMyUsername] = useState(null);

  const isLoggedIn = (() => {
    const t = localStorage.getItem('anura_token');
    return !!t && t !== 'null' && t !== 'undefined';
  })();

  useEffect(() => {
    if (isLoggedIn) apiGet('/api/auth/me').then((data) => setMyUsername(data.user?.username || null)).catch(() => {});
  }, [isLoggedIn]);

  // Nombre y taxonomía: solo lo que trae la observación desde la API.
  const scientificName =
    has(obs?.genus) && has(obs?.species)
      ? `${obs.genus} ${obs.species}`
      : has(obs?.ai_class)
        ? obs.ai_class.replace(/_/g, ' ')
        : null
  const commonName = has(obs?.common_name) ? obs.common_name : null
  const titleName = commonName || scientificName || 'Sin identificar'
  const showSubtitle = !!(commonName && scientificName && commonName !== scientificName)

  const aiProbLabel = formatAiProbPercent(obs?.ai_prob)

  const taxonomyRows = [
    ['Clase', obs?.class_name],
    ['Orden', obs?.order_name],
    ['Familia', obs?.family],
    ['Género', obs?.genus],
  ].filter(([, v]) => has(v))

  // Texto educativo, sinónimos, UICN y altitud: solo de la ficha publicada en Admin → Contenido.
  const { entry: publishedEntry, ready: publishedReady } = usePublishedSpecies(scientificName)
  const published = publishedEntry ? publishedToSpecies(publishedEntry) : null
  const publishedFacts = published
    ? [
        ['Sinónimos', (published.synonyms ?? []).join(', ')],
        ['Estado UICN', published.iucn
          ? (IUCN_LABEL[published.iucn] ? `${published.iucn} · ${IUCN_LABEL[published.iucn]}` : published.iucn)
          : null],
        ['Altitud', altitudeLabel(published.altitudeRange)],
      ].filter(([, v]) => has(v))
    : []

  useEffect(() => {
    if (isLoggedIn && obs?.username) {
      fetchFollowStatus(obs.username);
    }
  }, [obs?.username, isLoggedIn]);

  const fetchFollowStatus = async (username) => {
    try {
      const data = await apiGet(`/api/auth/follow/${username}/status`);
      setIsFollowing(data.following);
    } catch (e) { console.error('Error fetching follow status:', e); }
  };

  const handleFollow = async () => {
    if (!isLoggedIn) {
      setGuestPrompt('follow');
      return;
    }
    setFollowLoading(true);
    try {
      const data = await apiPost(`/api/auth/follow/${obs.username}`, {});
      setIsFollowing(data.following);
    } catch (e) {
      console.error('Error toggling follow:', e);
    } finally {
      setFollowLoading(false);
    }
  };

  const taxonLink = getTaxonSlug(obs?.taxon_id, scientificName);

  const handleShare = async () => {
    const url = window.location.href
    // La hoja nativa de compartir (navigator.share) puede quedarse "pegada"
    // en navegadores de escritorio (Windows/Edge/Chrome), bloqueando toda la
    // ventana con un overlay que no se puede cerrar. Solo se usa en
    // dispositivos táctiles, donde el share sheet funciona de forma nativa.
    const isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches
    try {
      if (isTouchDevice && navigator.share) {
        await navigator.share({ title: 'Anura', url })
        return
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setShareNotice('Enlace copiado')
      } else {
        setShareNotice('No se pudo copiar el enlace')
      }
    } catch (e) {
      // Cancelar la hoja nativa de compartir no es un error para el usuario.
      if (e?.name !== 'AbortError') setShareNotice('No se pudo compartir')
    }
    setTimeout(() => setShareNotice(''), 2500)
  }

  useEffect(() => {
    fetchObservation();
    if (isLoggedIn) fetchLikedStatus();
  }, [id, isLoggedIn]);

  const fetchLikedStatus = async () => {
    const idKey = obsIdKey(id);
    try {
      const likedIds = await apiGet('/api/explorer/favorites');
      const set = new Set(Array.isArray(likedIds) ? likedIds.map(obsIdKey) : []);
      setIsLiked(set.has(idKey));
    } catch (e) { console.error('Error fetching liked status:', e); }
  };

  const handleHeart = async () => {
    const idKey = obsIdKey(id);
    if (!isLoggedIn) {
      setGuestPrompt('favorite');
      return;
    }
    setLikeLoading(true);
    try {
      const { liked } = await apiPost(`/api/explorer/favorites/${encodeURIComponent(idKey)}`, {});
      setIsLiked(liked);
    } catch (e) {
      console.error('Error toggling favorite:', e);
    } finally {
      setLikeLoading(false);
    }
  };

  useEffect(() => {
    setAvatarLoadError(false)
  }, [obs?.profile_image]);

  const fetchObservation = async () => {
    try {
      const data = await apiGet(`/api/explorer/observation/${id}`);
      setObs(data);
    } catch (err) {
      if (err.status === 403) {
        setError('Esta observación es privada.');
      } else if (err.status === 404) {
        setError('Esta observación no existe o fue eliminada.');
      } else {
        setError('No se pudo cargar la observación. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner text="Cargando detalles del hallazgo..." />;
  if (error) return (
    <div className="detail-error">
      <p><MdWarning aria-hidden /> {error}</p>
      {!/privada|no existe/.test(error) && (
        <button onClick={() => { setError(null); setLoading(true); fetchObservation(); }} className="btn-secondary">Reintentar</button>
      )}
      <button onClick={() => navigate('/observaciones')} className="btn-primary">Volver a Observaciones</button>
    </div>
  );

  return (
    <div className="obs-detail-view theme-aware">
      <header className="detail-header">
        <div className="container header-flex-row">
          <BackButton to="/observaciones" noWrapper className="header-back-inline" />
          <div className="detail-header-titles">
            {taxonLink ? (
              <Link to={taxonLink} className="detail-title-link">
                <h1 className="detail-main-title">
                  {titleName}
                  {obs?.is_private && <MdLock className="title-private-icon" title="Observación privada" style={{ marginLeft: '8px', fontSize: '0.8em', color: 'var(--warning)', verticalAlign: 'middle' }} />}
                </h1>
                {showSubtitle && <span className="detail-subtitle">({scientificName})</span>}
              </Link>
            ) : (
              <>
                <h1 className="detail-main-title">
                  {titleName}
                  {obs?.is_private && <MdLock className="title-private-icon" title="Observación privada" style={{ marginLeft: '8px', fontSize: '0.8em', color: 'var(--warning)', verticalAlign: 'middle' }} />}
                </h1>
                {showSubtitle && <span className="detail-subtitle">({scientificName})</span>}
              </>
            )}
          </div>
          <div className="header-actions">
            <button type="button" className="btn-secondary btn-icon heart-header-btn" onClick={handleShare} aria-label="Compartir observación" title="Compartir">
              <MdShare aria-hidden />
            </button>
            <button type="button" className={`btn-secondary btn-icon heart-header-btn ${isLiked ? 'liked' : ''}`} onClick={handleHeart} disabled={likeLoading} aria-label={isLiked ? 'Quitar de favoritos' : 'Guardar en favoritos'} aria-pressed={isLiked}>
              {likeLoading ? <MdRefresh className="icon-spin" /> : (isLiked ? <MdFavorite /> : <MdFavoriteBorder />)}
            </button>
          </div>
        </div>
      </header>

      <div className="detail-container container">
        <div className="detail-main-grid">
          
          {/* Columna Izquierda: Imagen y Taxonomía */}
          <div className="detail-card card glassmorphism">
            <MediaCarousel
              height="280px"
              media={[
                ...(obs.image_key || obs.thumbnail_key ? [{
                  type: 'image',
                  // mediaUrl(image_key) armaba /uploads/<archivo>.webp, ruta que nginx no
                  // tiene mapeada (cae al fallback de la SPA); tunnelThumb sí pasa por
                  // /api/explorer/thumbnail/... que resuelve contra MinIO/DB.
                  src: obs.image_key ? tunnelThumb(obs.image_key, 'original') : tunnelThumb(obs.thumbnail_key, 'medium'),
                  alt: titleName,
                }] : []),
                ...(obs.audio_key ? [{
                  type: 'audio',
                  id: obsIdKey(id),
                  // `audio_url` es la única fuente real hoy; `audio_key` solo
                  // marca que existe audio (aún no hay endpoint que lo sirva).
                  src: obs.audio_url || undefined,
                  durationMs: obs.audio_duration_ms || 14000,
                  alt: titleName,
                }] : []),
              ]}
              emptyLabel="Sin fotos ni audio aún"
            />
            
            <div className="detail-info-section">
              <div className="detail-taxonomy">
                <p className="detail-label">Identificación</p>
                <h2 className="detail-common-name">
                  {taxonLink ? (
                    <Link to={taxonLink} className="taxon-link-hover">{titleName}</Link>
                  ) : titleName}
                </h2>
                {(showSubtitle || aiProbLabel) && (
                  <p className="detail-scientific-name">
                    {showSubtitle && (taxonLink ? (
                      <Link to={taxonLink} className="taxon-link-hover"><i>{scientificName}</i></Link>
                    ) : <i>{scientificName}</i>)}
                    {aiProbLabel && (
                      <span className="detail-ai-prob" title="Probabilidad del modelo">
                        {aiProbLabel}
                      </span>
                    )}
                  </p>
                )}

                {taxonomyRows.length > 0 && (
                  <div className="taxonomical-hierarchy">
                    {taxonomyRows.map(([label, value]) => (
                      <div className="tax-item" key={label}><span>{label}</span><strong>{value}</strong></div>
                    ))}
                  </div>
                )}

                {published ? (
                  <div className="detail-standard-block">
                    {has(published.whatIs) && (
                      <p className="detail-scientific-text-standard">
                        {published.whatIs}
                        {taxonLink && (
                          <Link to={taxonLink} className="read-more-link"> Leer más...</Link>
                        )}
                      </p>
                    )}
                    {publishedFacts.length > 0 && (
                      <div className="taxonomical-hierarchy">
                        {publishedFacts.map(([label, value]) => (
                          <div className="tax-item" key={label}><span>{label}</span><strong>{value}</strong></div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : publishedReady && scientificName ? (
                  <div className="detail-standard-block">
                    <p className="detail-scientific-text-standard">Esta especie todavía no tiene ficha publicada.</p>
                  </div>
                ) : null}
              </div>

            </div>
          </div>

          {/* Columna Derecha: Mapa y Contexto */}
          <div className="detail-side-column">
            {/* User info at the top of the sidebar */}
            <div className="detail-card card glassmorphism user-sidebar-card">
              <div className="user-sidebar-flex">
                <div className="user-avatar-detail" onClick={() => navigate(`/people/${obs.username}`)} style={{ cursor: 'pointer' }}>
                  {obs.profile_image && !avatarLoadError ? (
                    <img
                      src={mediaUrl(obs.profile_image)}
                      alt="Avatar"
                      onError={() => setAvatarLoadError(true)}
                    />
                  ) : (
                    <span className="avatar-placeholder"><MdPerson aria-hidden /></span>
                  )}
                </div>
                <div className="user-meta-detail">
                  <strong onClick={() => navigate(`/people/${obs.username}`)} className="detail-user-link">{obs.username}</strong>
                  <p className="user-obs-count">{obs.user_obs_count || 0} observaciones</p>
                </div>
                <button 
                  className={`btn-secondary btn-small follow-btn-sidebar ${isFollowing ? 'following' : ''}`} 
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? 'Cargando...' : (isFollowing ? 'Siguiendo' : 'Seguir')}
                </button>
              </div>
              <div className="obs-date-row">
                <span className="date-detail">Observado el {new Date(obs.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
            </div>

            <div className="detail-card card glassmorphism map-card-detail" id="obs-map-card">
              <div className="detail-map-wrapper">
                {obs.lat && obs.lon ? (
                  <MapContainer center={[obs.lat, obs.lon]} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[obs.lat, obs.lon]}>
                      <Popup>Ubicación exacta</Popup>
                    </Marker>
                  </MapContainer>
                ) : (
                  <div className="no-coords">No hay coordenadas disponibles</div>
                )}
              </div>
              <div className="geo-stats">
                <div className="stat">
                  <span>Altitud (msnm, OpenTopoData)</span>
                  <strong>
                    {obs.altitude_m != null && obs.altitude_m !== ''
                      ? `${Number(obs.altitude_m).toFixed(0)} m`
                      : 'Sin dato'}
                  </strong>
                </div>
                <div className="stat">
                  <span>Latitud</span>
                  <strong>{obs.lat?.toFixed(4) || 'N/A'}</strong>
                </div>
                <div className="stat">
                  <span>Longitud</span>
                  <strong>{obs.lon?.toFixed(4) || 'N/A'}</strong>
                </div>
              </div>
            </div>

            <div className="detail-card card glassmorphism notes-card">
              <h3><MdStickyNote2 aria-hidden /> Notas de campo</h3>
              <p className="obs-notes-text">
                {obs.notes || "El observador no proporcionó notas adicionales para este registro."}
              </p>
            </div>
          </div>

        </div>

        {/* Ancho completo: en la columna lateral angosta, avatares, hilos y
            el composer de comentarios quedarían apretados. */}
        <CommentsSection
          observationId={obsIdKey(id)}
          speciesContext={{ commonName: titleName, scientificName }}
          isLoggedIn={isLoggedIn}
          username={myUsername}
        />
      </div>

      {shareNotice && <div className="detail-toast" role="status">{shareNotice}</div>}

      {guestPrompt && (
        <GuestLoginModal
          onClose={() => setGuestPrompt(null)}
          Icon={guestPrompt === 'follow' ? MdPersonAdd : MdFavorite}
          title={guestPrompt === 'follow' ? 'Sigue a este explorador' : 'Guarda tus favoritos'}
          description={guestPrompt === 'follow'
            ? 'Inicia sesión para seguir a otros exploradores y ver sus nuevas observaciones.'
            : 'Inicia sesión para guardar esta observación en tus favoritos.'}
        />
      )}
    </div>
  );
}
