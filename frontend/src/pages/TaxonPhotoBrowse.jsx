import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MdArrowBack, MdWarning } from 'react-icons/md';
import { GiFrogFoot } from 'react-icons/gi';
import './TaxonPhotoBrowse.css';
import LoadingSpinner from '../components/LoadingSpinner';
import BackButton from '../components/BackButton';
import PhotoLightbox from '../components/PhotoLightbox';
import { apiGet, getThumbUrl } from '../services/api';
import { normalizeKey } from '../lib/format';

const PAGE_SIZE = 24;

/**
 * Galería de fotos de una especie — corresponde a la funcionalidad real de
 * anura.juanlabs.me/taxa/{id}-{especie}/fotos. Antes: sin paginación (traía
 * el feed completo y filtraba en cliente) y sin lightbox (cada clic sacaba
 * de la página al detalle completo de la observación). El filtrado sigue
 * siendo en cliente porque no existe un endpoint de fotos por especie en el
 * backend — lo que cambia es que ahora solo se RENDERIZA un lote a la vez.
 */
export default function TaxonPhotoBrowse() {
  const { taxonIdSlug } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [observations, setObservations] = useState([]);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const slugPart = taxonIdSlug.split('-').slice(1).join(' ');
  const speciesKey = normalizeKey(slugPart);
  const displayName = slugPart;

  useEffect(() => {
    fetchPhotos();
    setVisibleCount(PAGE_SIZE);
  }, [taxonIdSlug]);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const data = await apiGet('/api/explorer/feed', { auth: false });
      const filtered = data.filter(obs => {
        const k = normalizeKey(obs.ai_class || obs.common_name || '');
        // Sin nombre no hay coincidencia posible ('' está contenido en todo).
        if (!k) return false;
        return k === speciesKey || k.includes(speciesKey) || speciesKey.includes(k);
      });
      setObservations(filtered);
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const thumbUrl = (key, size = 'medium') => getThumbUrl(String(key || '').split('/').pop(), size);

  const visibleObservations = observations.slice(0, visibleCount);
  const lightboxImages = useMemo(() => visibleObservations.map((obs) => ({
    // Preferir la foto completa (image_key) sobre el thumbnail: pedirle "original" al
    // thumbnail solo devuelve el recorte de 300px tal cual, sin escalar.
    src: thumbUrl(obs.image_key, 'original') || thumbUrl(obs.thumbnail_key, 'original'),
    alt: obs.common_name || obs.ai_class?.replace(/_/g, ' ') || 'Observación',
    obsId: obs.id,
  })), [visibleObservations]);

  if (loading)
    return <LoadingSpinner text={`Cargando fotos de ${displayName}...`} />;

  if (error)
    return (
      <div className="browse-error">
        <MdWarning />
        <p>{error}</p>
        <button className="btn-back" onClick={() => navigate(-1)}>
          <MdArrowBack /> Volver
        </button>
      </div>
    );

  return (
    <div className="browse-view theme-aware">
      <header className="browse-header">
        <div className="container header-flex">
          <BackButton noWrapper />
          <div className="browse-title-wrap">
            <h1 className="browse-title">
              <i>{displayName}</i>
            </h1>
            <p className="browse-subtitle">
              {observations.length} foto{observations.length !== 1 ? 's' : ''} registrada{observations.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </header>

      {observations.length === 0 ? (
        <div className="container">
          <div className="browse-empty">
            <GiFrogFoot />
            <p>No se encontraron fotos de esta especie.</p>
          </div>
        </div>
      ) : (
        <div className="container" style={{ marginTop: '2rem' }}>
          <div className="browse-grid">
            {visibleObservations.map((obs, i) => (
              <PhotoCard
                key={obs.id}
                obs={obs}
                getThumbUrl={thumbUrl}
                onOpen={() => setLightboxIndex(i)}
              />
            ))}
          </div>

          {visibleCount < observations.length && (
            <div className="browse-load-more">
              <button type="button" className="btn-secondary" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                Cargar más ({observations.length - visibleCount} restantes)
              </button>
            </div>
          )}
        </div>
      )}

      {lightboxIndex != null && (
        <PhotoLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onIndexChange={setLightboxIndex}
          onOpenDetail={(img) => navigate(`/explorer/${img.obsId}`)}
        />
      )}
    </div>
  );
}

/* ── Individual photo card ── */
function PhotoCard({ obs, getThumbUrl, onOpen }) {
  const commonName = obs.common_name || obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar';

  return (
    <div className="photo-card" onClick={onOpen}>
      <div className="photo-card-img-wrap">
        <img
          src={getThumbUrl(obs.thumbnail_key, 'medium')}
          alt={commonName}
          className="photo-card-img"
          loading="lazy"
          onError={(e) => {
            e.target.src = getThumbUrl(obs.image_key, 'original');
          }}
        />
      </div>
    </div>
  );
}
