import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaFrog, FaTriangleExclamation } from 'react-icons/fa6';
import './TaxonPhotoBrowse.css';
import LoadingSpinner from '../components/LoadingSpinner';
import BackButton from '../components/BackButton';

const API_BASE = import.meta.env.VITE_API_URL || '';

const normalizeKey = (v) =>
  String(v || '').trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();

export default function TaxonPhotoBrowse() {
  const { taxonIdSlug } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [observations, setObservations] = useState([]);
  const [error, setError] = useState(null);

  const slugPart = taxonIdSlug.split('-').slice(1).join(' ');
  const speciesKey = normalizeKey(slugPart);
  const displayName = slugPart;

  useEffect(() => {
    fetchPhotos();
  }, [taxonIdSlug]);

  const fetchPhotos = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/explorer/feed`);
      if (res.ok) {
        const data = await res.json();
        const filtered = data.filter(obs => {
          const k = normalizeKey(obs.ai_class || obs.common_name || '');
          return k === speciesKey || k.includes(speciesKey) || speciesKey.includes(k);
        });
        setObservations(filtered);
      } else {
        setError('Error al cargar las fotos');
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const getFullImageUrl = (key) => {
    if (!key) return '';
    if (/^https?:\/\//i.test(key)) return key;
    const p = key.startsWith('/') ? key : `/${key}`;
    const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
    return `${base}${p}`;
  };

  const getThumbUrl = (key, size = 'medium') => {
    if (!key) return '';
    const filename = String(key).split('/').pop();
    return `${API_BASE}/api/explorer/thumbnail/${size}/${filename}`;
  };

  if (loading)
    return <LoadingSpinner text={`Cargando fotos de ${displayName}...`} />;

  if (error)
    return (
      <div className="browse-error">
        <FaTriangleExclamation />
        <p>{error}</p>
        <button className="btn-back" onClick={() => navigate(-1)}>
          <FaArrowLeft /> Volver
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
            <FaFrog />
            <p>No se encontraron fotos de esta especie.</p>
          </div>
        </div>
      ) : (
        <div className="container" style={{ marginTop: '2rem' }}>
          <div className="browse-grid">
            {observations.map(obs => (
              <PhotoCard
                key={obs.id}
                obs={obs}
                getThumbUrl={getThumbUrl}
                getFullImageUrl={getFullImageUrl}
                onNavigate={() => navigate(`/explorer/${obs.id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Individual photo card with hover tooltip ── */
function PhotoCard({ obs, getThumbUrl, getFullImageUrl, onNavigate }) {
  const commonName = obs.common_name || obs.ai_class?.replace(/_/g, ' ') || 'Sin identificar';
  const sciName = obs.ai_class?.replace(/_/g, ' ') || '';

  return (
    <div className="photo-card" onClick={onNavigate}>
      <div className="photo-card-img-wrap">
        <img
          src={getThumbUrl(obs.thumbnail_key, 'medium')}
          alt={commonName}
          className="photo-card-img"
          loading="lazy"
          onError={(e) => {
            e.target.src = getFullImageUrl(obs.image_key);
          }}
        />
      </div>
    </div>
  );
}
