import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { currentUserIdFromToken, obsIdKey } from '../lib/observationIds';
import { MdCircle, MdLocationOn, MdSearch, MdGridView, MdFormatListBulleted, MdWarning, MdPerson, MdCalendarToday, MdFavorite } from 'react-icons/md';
import './People.css';
import './PeopleObservations.css';
import LoadingSpinner from '../components/LoadingSpinner';
import GuestLoginModal from '../components/GuestLoginModal';
import FavoriteHeartButton from '../components/FavoriteHeartButton';
import { apiGet, apiPost, getThumbUrl } from '../services/api';
import { mediaUrl, isAudioOnly } from '../lib/format';
import Thumb from '../components/Thumb';

const getImageUrl = (key, size = 'medium') => {
  if (!key) return '';
  const filename = key.split('/').pop();
  return getThumbUrl(filename, size);
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
      const data = await apiGet(`/api/auth/public/${username}`, { auth: false });
      setProfile(data);
    } catch (err) {
      setProfileError(err.body?.message || 'No se pudo cargar el perfil');
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchFavorites = async () => {
    setObsLoading(true);
    try {
      // Get public favorites of this user
      const data = await apiGet(`/api/explorer/favorites/feed/user/${encodeURIComponent(username)}`, { auth: false });
      setObservations(data);
    } catch (e) { console.error(e); }
    finally { setObsLoading(false); }
  };

  const handleHeart = async (e, obsId) => {
    e.stopPropagation();
    if (!isProfileOwner) return;
    const oid = obsIdKey(obsId);
    setLikeLoading(prev => new Set(prev).add(oid));
    try {
      const { liked } = await apiPost(`/api/explorer/favorites/${encodeURIComponent(oid)}`, {});
      if (!liked) {
        setObservations(prev => prev.filter(o => obsIdKey(o.id) !== oid));
      }
    } catch (err) {
      if (err.status === 401) {
        localStorage.removeItem('anura_token');
        setGuestModal(true);
      }
    } finally {
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

  if (profileLoading) return <LoadingSpinner text={`Cargando favoritos de ${username}…`} />;
  if (profileError) return (
    <div className="people-error">
      <p><MdWarning aria-hidden /> {profileError}</p>
      <button onClick={() => navigate('/inicio')} className="btn-back">Volver al inicio</button>
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
      <FavoriteHeartButton
        liked
        disabled={!isProfileOwner || busy}
        onClick={e => handleHeart(e, obs.id)}
        title={
          isProfileOwner
            ? (busy ? 'Quitando…' : 'Quitar de mis favoritos')
            : `En favoritos de ${username}`
        }
        ariaLabel={isProfileOwner ? 'Quitar de mis favoritos' : `Favorito de ${username}`}
      />
    );
  };

  return (
    <div className="people-view theme-aware">
      {guestModal && (
        <GuestLoginModal
          onClose={() => setGuestModal(false)}
          description="Para guardar observaciones en favoritos necesitas iniciar sesión."
          showCancel={false}
        />
      )}

      <div className="people-header-banner">
        <div className="container">
          <div className="people-profile-summary">
            <div className="people-avatar-large">
              {user.profile_image && !avatarLoadError ? (
                <img src={mediaUrl(user.profile_image)} alt={user.username} onError={() => setAvatarLoadError(true)} />
              ) : (
                <span className="avatar-placeholder"><MdPerson aria-hidden /></span>
              )}
            </div>
            <div className="people-identity">
              <h1>{user.username}</h1>
              <p className="people-meta">
                Unido: {fmtDate(stats.joined)}
                <span className="separator"><MdCircle aria-hidden /></span>
                Última actividad: {fmtDate(stats.last_activity)}
                <span className="separator"><MdCircle aria-hidden /></span>
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
          <MdSearch aria-hidden className="po-search-icon" />
          <input
            type="text" className="po-search-input"
            placeholder="Buscar en favoritos…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="po-switcher">
          <button className={subview === 'grid' ? 'po-sw-btn active' : 'po-sw-btn'} onClick={() => setSubview('grid')}><MdGridView /></button>
          <button className={subview === 'list' ? 'po-sw-btn active' : 'po-sw-btn'} onClick={() => setSubview('list')}><MdFormatListBulleted /></button>
        </div>
      </div>

      <div className="po-content container">
        {obsLoading ? (
          <LoadingSpinner text="Cargando favoritos…" />
        ) : filtered.length === 0 ? (
          <div className="po-empty"><MdFavorite className="po-empty-icon" /><p>{search ? `Sin resultados para "${search}"` : `${username} no tiene favoritos públicos.`}</p></div>
        ) : subview === 'grid' ? (
          <div className="po-grid">
            {filtered.map(obs => (
              <div key={obsIdKey(obs.id)} className="po-card" onClick={() => navigate(`/explorer/${obsIdKey(obs.id)}`)}>
                <div className="po-card-img">
                  <Thumb src={getImageUrl(obs.thumbnail_key, 'medium')} alt={obs.common_name} audioOnly={isAudioOnly(obs)} />
                  <HeartBtn obs={obs} />
                </div>
                <div className="po-card-body">
                  <strong className="po-common">{obs.common_name || 'Sin identificar'}</strong>
                  <small className="po-sci">{obs.ai_class?.replace(/_/g, ' ')}</small>
                  <span className="po-date"><MdCalendarToday /> {fmtDate(obs.recorded_at || obs.created_at)}</span>
                  {obs.place_guess && <span className="po-place"><MdLocationOn /> {obs.place_guess}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="po-list">
            {filtered.map(obs => (
              <div key={obsIdKey(obs.id)} className="po-list-item" onClick={() => navigate(`/explorer/${obsIdKey(obs.id)}`)}>
                <div className="po-list-thumb"><Thumb src={getImageUrl(obs.thumbnail_key, 'small')} alt={obs.common_name} audioOnly={isAudioOnly(obs)} /></div>
                <div className="po-list-info">
                  <strong>{obs.common_name || 'Sin identificar'}</strong>
                  <div className="po-list-meta">
                    <span><MdCalendarToday /> {fmtDate(obs.recorded_at || obs.created_at)}</span>
                    {obs.place_guess && <span><MdLocationOn /> {obs.place_guess}</span>}
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
