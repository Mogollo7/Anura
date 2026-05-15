import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FaCircle, FaFrog, FaLocationDot, FaMagnifyingGlass,
  FaTableCells, FaList, FaTriangleExclamation, FaUser,
  FaCalendarDays, FaHeart, FaXmark, FaGoogle,
} from 'react-icons/fa6';
import { CiHeart } from 'react-icons/ci';
import './People.css';
import './PeopleObservations.css';
import { obsIdKey } from '../lib/observationIds';

const API_BASE = import.meta.env.VITE_API_URL || '';

const getImageUrl = (key, size = 'medium') => {
  if (!key) return '';
  const filename = key.split('/').pop();
  return `${API_BASE}/api/explorer/thumbnail/${size}/${filename}`;
};

export default function PeopleObservations() {
  const { username } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  const [observations, setObservations] = useState([]);
  const [obsLoading, setObsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subview, setSubview] = useState('grid'); // 'grid' | 'list'

  // Auth state (read from localStorage)
  const token = localStorage.getItem('anura_token');
  const isLoggedIn = !!token && token !== 'null' && token !== 'undefined';

  // Liked set
  const [likedIds, setLikedIds] = useState(new Set());
  const [likeLoading, setLikeLoading] = useState(new Set());

  // Guest login modal
  const [guestModal, setGuestModal] = useState(false);
  const [pendingLikeId, setPendingLikeId] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, [username]);

  useEffect(() => {
    fetchObservations();
  }, [username]);

  useEffect(() => {
    if (isLoggedIn) fetchLikedIds();
  }, [isLoggedIn]);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/public/${username}`);
      if (res.ok) {
        setProfile(await res.json());
        setAvatarLoadError(false);
      } else {
        const err = await res.json();
        setProfileError(err.message || 'No se pudo cargar el perfil');
      }
    } catch {
      setProfileError('Error al conectar con el servidor');
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchObservations = async () => {
    setObsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/explorer/feed?username=${encodeURIComponent(username)}`);
      if (res.ok) setObservations(await res.json());
    } catch (e) { console.error(e); }
    finally { setObsLoading(false); }
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
      // Save pending info and show modal
      localStorage.setItem('anura_pending_favorite', obsIdKey(obsId));
      localStorage.setItem('anura_pending_url', window.location.pathname);
      setPendingLikeId(obsId);
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

  const filtered = observations.filter(obs => {
    const q = search.toLowerCase();
    return !q ||
      (obs.common_name || '').toLowerCase().includes(q) ||
      (obs.ai_class || '').toLowerCase().includes(q) ||
      (obs.place_guess || '').toLowerCase().includes(q);
  });

  if (profileLoading) return <div className="people-loading">Cargando perfil de {username}…</div>;
  if (profileError) return (
    <div className="people-error">
      <p><FaTriangleExclamation aria-hidden /> {profileError}</p>
      <button onClick={() => navigate('/explorer')} className="btn-back">Volver al Explorador</button>
    </div>
  );

  const { user, stats } = profile;

  const fmtDate = (d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

  // Observation card shared between grid/list
  const HeartBtn = ({ obs }) => {
    const oid = obsIdKey(obs.id);
    const liked = likedIds.has(oid);
    return (
      <button
        className={`po-heart-btn ${liked ? 'liked' : ''}`}
        onClick={e => handleHeart(e, oid)}
        disabled={likeLoading.has(oid)}
        title={liked ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      >
        {liked ? <FaHeart aria-hidden /> : <CiHeart aria-hidden />}
      </button>
    );
  };

  return (
    <div className="people-view theme-aware">

      {/* Guest modal */}
      {guestModal && (
        <div className="po-modal-overlay" onClick={() => setGuestModal(false)}>
          <div className="po-modal-card" onClick={e => e.stopPropagation()}>
            <button className="po-modal-close" onClick={() => setGuestModal(false)}><FaXmark /></button>
            <FaHeart aria-hidden className="po-modal-icon" />
            <h2>Guarda tus favoritos</h2>
            <p>Para guardar observaciones en favoritos necesitas iniciar sesión. Después de entrar, continuarás aquí automáticamente.</p>
            <button
              className="btn-primary po-modal-login"
              onClick={() => { window.location.href = `${API_BASE}/api/auth/google`; }}
            >
              <FaGoogle aria-hidden /> Continuar con Google
            </button>
            <button className="btn-secondary po-modal-skip" onClick={() => setGuestModal(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="people-header-banner">
        <div className="container">
          <div className="people-profile-summary">
            <div className="people-avatar-large">
              {user.profile_image && !avatarLoadError ? (
                <img src={`${API_BASE}${user.profile_image}`} alt={user.username} onError={() => setAvatarLoadError(true)} />
              ) : (
                <span className="avatar-placeholder"><FaUser aria-hidden /></span>
              )}
            </div>
            <div className="people-identity">
              <h1>{user.username}</h1>
              <p className="people-meta">
                Unido: {fmtDate(stats.joined)}
                <span className="separator"><FaCircle aria-hidden /></span>
                Última actividad: {fmtDate(stats.last_activity)}
                <span className="separator"><FaCircle aria-hidden /></span>
                {stats.observations} observaciones
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="people-nav">
        <div className="container">
          <ul>
            <li onClick={() => navigate(`/people/${username}`)}>Perfil</li>
            <li className="active">Observaciones</li>
            <li onClick={() => navigate(`/people/${username}/favoritos`)}>Favoritos</li>
          </ul>
        </div>
      </nav>


      {/* Controls */}
      <div className="po-controls container">
        <div className="po-search-wrap">
          <FaMagnifyingGlass aria-hidden className="po-search-icon" />
          <input
            type="text" className="po-search-input"
            placeholder="Buscar especie o lugar…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="po-switcher">
          <button className={subview === 'grid' ? 'po-sw-btn active' : 'po-sw-btn'} onClick={() => setSubview('grid')} title="Cuadrícula">
            <FaTableCells aria-hidden />
          </button>
          <button className={subview === 'list' ? 'po-sw-btn active' : 'po-sw-btn'} onClick={() => setSubview('list')} title="Lista">
            <FaList aria-hidden />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="po-content container">
        {obsLoading ? (
          <div className="po-loading">
            <FaFrog aria-hidden className="po-loading-icon" />
            <p>Cargando observaciones…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="po-empty">
            <FaFrog aria-hidden className="po-empty-icon" />
            <p>{search ? `Sin resultados para "${search}"` : `${username} aún no tiene observaciones.`}</p>
          </div>
        ) : subview === 'grid' ? (

          <div className="po-grid">
            {filtered.map(obs => (
              <div key={obs.id} className="po-card" onClick={() => navigate(`/explorer/${obs.id}`)}>
                <div className="po-card-img">
                  <img src={getImageUrl(obs.thumbnail_key, 'medium')} alt={obs.common_name || 'Observación'} onError={e => { e.target.style.display = 'none'; }} />
                  {obs.quality_grade === 'research' && <span className="po-badge">Verificada</span>}
                  <HeartBtn obs={obs} />
                </div>
                <div className="po-card-body">
                  <strong className="po-common">{obs.common_name || 'Sin identificar'}</strong>
                  <small className="po-sci">{obs.ai_class?.replace(/_/g, ' ') || ''}</small>
                  <span className="po-date"><FaCalendarDays aria-hidden /> {fmtDate(obs.recorded_at || obs.created_at)}</span>
                  {obs.place_guess && <span className="po-place"><FaLocationDot aria-hidden /> {obs.place_guess}</span>}
                </div>
              </div>
            ))}
          </div>

        ) : (

          <div className="po-list">
            {filtered.map(obs => (
              <div key={obs.id} className="po-list-item" onClick={() => navigate(`/explorer/${obs.id}`)}>
                <div className="po-list-thumb">
                  <img src={getImageUrl(obs.thumbnail_key, 'small')} alt={obs.common_name || 'Observación'} onError={e => { e.target.style.display = 'none'; }} />
                </div>
                <div className="po-list-info">
                  <strong>{obs.common_name || 'Sin identificar'}</strong>
                  <small className="po-sci">{obs.ai_class?.replace(/_/g, ' ') || ''}</small>
                  <div className="po-list-meta">
                    <span><FaCalendarDays aria-hidden /> {fmtDate(obs.recorded_at || obs.created_at)}</span>
                    {obs.place_guess && <span><FaLocationDot aria-hidden /> {obs.place_guess}</span>}
                  </div>
                </div>
                <div className="po-list-end">
                  <HeartBtn obs={obs} />
                </div>
              </div>
            ))}
          </div>

        )}
      </div>
    </div>
  );
}
