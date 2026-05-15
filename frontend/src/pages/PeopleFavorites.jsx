import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { currentUserIdFromToken, obsIdKey } from '../lib/observationIds';
import {
  FaCircle, FaFrog, FaLocationDot, FaMagnifyingGlass,
  FaTableCells, FaList, FaTriangleExclamation, FaUser,
  FaCalendarDays, FaHeart, FaXmark, FaGoogle,
} from 'react-icons/fa6';
import './People.css';
import './PeopleObservations.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

const getImageUrl = (key, size = 'medium') => {
  if (!key) return '';
  const filename = key.split('/').pop();
  return `${API_BASE}/api/explorer/thumbnail/${size}/${filename}`;
};

export default function PeopleFavorites() {
  const { username } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  const [observations, setObservations] = useState([]);
  const [obsLoading, setObsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subview, setSubview] = useState('grid');

  const token = localStorage.getItem('anura_token');
  const isLoggedIn = !!token && token !== 'null' && token !== 'undefined';
  const [likeLoading, setLikeLoading] = useState(new Set());
  const [guestModal, setGuestModal] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchFavorites();
  }, [username, location.key]);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/public/${username}`);
      if (res.ok) {
        setProfile(await res.json());
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

  const fetchFavorites = async () => {
    setObsLoading(true);
    try {
      // Get public favorites of this user
      const res = await fetch(`${API_BASE}/api/explorer/favorites/feed/user/${encodeURIComponent(username)}`);
      if (res.ok) setObservations(await res.json());
    } catch (e) { console.error(e); }
    finally { setObsLoading(false); }
  };

  const handleHeart = async (e, obsId) => {
    e.stopPropagation();
    if (!isProfileOwner) return;
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

        if (!liked) {
          setObservations(prev => prev.filter(o => obsIdKey(o.id) !== oid));
        }
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

  if (profileLoading) return <div className="people-loading">Cargando favoritos de {username}…</div>;
  if (profileError) return (
    <div className="people-error">
      <p><FaTriangleExclamation aria-hidden /> {profileError}</p>
      <button onClick={() => navigate('/explorer')} className="btn-back">Volver al Explorador</button>
    </div>
  );

  const myUserId = currentUserIdFromToken();
  const isProfileOwner =
    isLoggedIn &&
    myUserId != null &&
    profile?.user?.id != null &&
    String(profile.user.id) === myUserId;

  const { user, stats } = profile;
  const fmtDate = (d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

  const HeartBtn = ({ obs }) => {
    const busy = likeLoading.has(obsIdKey(obs.id));
    return (
      <button
        type="button"
        className="po-heart-btn liked"
        onClick={e => handleHeart(e, obs.id)}
        disabled={!isProfileOwner || busy}
        title={
          isProfileOwner
            ? (busy ? 'Quitando…' : 'Quitar de mis favoritos')
            : `En favoritos de ${username}`
        }
        aria-label={
          isProfileOwner
            ? 'Quitar de mis favoritos'
            : `Favorito de ${username}`
        }
      >
        <FaHeart aria-hidden />
      </button>
    );
  };

  return (
    <div className="people-view theme-aware">
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

      <nav className="people-nav">
        <div className="container">
          <ul>
            <li onClick={() => navigate(`/people/${username}`)}>Perfil</li>
            <li onClick={() => navigate(`/people/${username}/observaciones`)}>Observaciones</li>
            <li className="active">Favoritos</li>
          </ul>
        </div>
      </nav>

      <div className="po-controls container">
        <div className="po-search-wrap">
          <FaMagnifyingGlass aria-hidden className="po-search-icon" />
          <input
            type="text" className="po-search-input"
            placeholder="Buscar en favoritos…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="po-switcher">
          <button className={subview === 'grid' ? 'po-sw-btn active' : 'po-sw-btn'} onClick={() => setSubview('grid')}><FaTableCells /></button>
          <button className={subview === 'list' ? 'po-sw-btn active' : 'po-sw-btn'} onClick={() => setSubview('list')}><FaList /></button>
        </div>
      </div>

      <div className="po-content container">
        {obsLoading ? (
          <div className="po-loading"><FaFrog className="po-loading-icon" /><p>Cargando favoritos…</p></div>
        ) : filtered.length === 0 ? (
          <div className="po-empty"><FaHeart className="po-empty-icon" /><p>{search ? `Sin resultados para "${search}"` : `${username} no tiene favoritos públicos.`}</p></div>
        ) : subview === 'grid' ? (
          <div className="po-grid">
            {filtered.map(obs => (
              <div key={obsIdKey(obs.id)} className="po-card" onClick={() => navigate(`/explorer/${obsIdKey(obs.id)}`)}>
                <div className="po-card-img">
                  <img src={getImageUrl(obs.thumbnail_key, 'medium')} alt={obs.common_name} onError={e => e.target.style.display='none'} />
                  <HeartBtn obs={obs} />
                </div>
                <div className="po-card-body">
                  <strong className="po-common">{obs.common_name || 'Sin identificar'}</strong>
                  <small className="po-sci">{obs.ai_class?.replace(/_/g, ' ')}</small>
                  <span className="po-date"><FaCalendarDays /> {fmtDate(obs.recorded_at || obs.created_at)}</span>
                  {obs.place_guess && <span className="po-place"><FaLocationDot /> {obs.place_guess}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="po-list">
            {filtered.map(obs => (
              <div key={obsIdKey(obs.id)} className="po-list-item" onClick={() => navigate(`/explorer/${obsIdKey(obs.id)}`)}>
                <div className="po-list-thumb"><img src={getImageUrl(obs.thumbnail_key, 'small')} alt={obs.common_name} /></div>
                <div className="po-list-info">
                  <strong>{obs.common_name || 'Sin identificar'}</strong>
                  <div className="po-list-meta">
                    <span><FaCalendarDays /> {fmtDate(obs.recorded_at || obs.created_at)}</span>
                    {obs.place_guess && <span><FaLocationDot /> {obs.place_guess}</span>}
                  </div>
                </div>
                <div className="po-list-end"><HeartBtn obs={obs} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
