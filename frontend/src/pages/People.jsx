import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MdCircle, MdWarning, MdPerson, MdCalendarToday, MdChevronRight, MdPersonAddAlt, MdPersonAdd, MdPersonRemoveAlt1, MdPersonRemove, MdEdit } from 'react-icons/md';
import './People.css';
import LoadingSpinner from '../components/LoadingSpinner';
import GuestLoginModal from '../components/GuestLoginModal';
import { currentUserIdFromToken } from '../lib/observationIds';
import { apiGet, apiPost, getThumbUrl } from '../services/api';
import { mediaUrl, isAudioOnly } from '../lib/format';
import Thumb from '../components/Thumb';

export default function People() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [isHoveringFollow, setIsHoveringFollow] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [recentObservations, setRecentObservations] = useState([]);
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

  const token = localStorage.getItem('anura_token');
  const isOwnProfile = Boolean(profile && currentUserIdFromToken() === String(profile.user.id));

  const getImageUrl = (key, size = 'small') => {
    if (!key) return '';
    const filename = key.split('/').pop();
    return getThumbUrl(filename, size);
  };

  useEffect(() => {
    fetchProfile();
    fetchRecentObservations();
    if (token && !isOwnProfile) {
      fetchFollowStatus();
    }
  }, [username, token, isOwnProfile]);

  const fetchFollowStatus = async () => {
    try {
      const data = await apiGet(`/api/auth/follow/${username}/status`);
      setIsFollowing(data.following);
    } catch (e) { console.error('Error fetching follow status:', e); }
  };

  const handleFollow = async () => {
    if (!token) {
      setShowGuestPrompt(true);
      return;
    }
    setFollowLoading(true);
    try {
      const data = await apiPost(`/api/auth/follow/${username}`, {});
      setIsFollowing(data.following);
      fetchProfile(); // Update follower count
    } catch (e) {
      console.error('Error toggling follow:', e);
    } finally {
      setFollowLoading(false);
    }
  };

  const fetchRecentObservations = async () => {
    try {
      const data = await apiGet(`/api/explorer/feed?username=${username}`, { auth: !!token });
      setRecentObservations(data.slice(0, 3));
    } catch (e) {
      console.error('Error fetching recent obs:', e);
    }
  };

  const fetchProfile = async () => {
    try {
      const data = await apiGet(`/api/auth/public/${username}`, { auth: false });
      setProfile(data);
      setAvatarLoadError(false)
    } catch (err) {
      setError(err.body?.message || 'No se pudo cargar el perfil');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner text={`Cargando perfil de ${username}...`} />;
  if (error) return (
    <div className="people-error">
      <p><MdWarning aria-hidden /> {error}</p>
      <button onClick={() => navigate('/inicio')} className="btn-primary">Volver al inicio</button>
    </div>
  );

  const { user, stats } = profile;

  return (
    <div className="people-view theme-aware">
      <div className="people-header-banner">
        <div className="container">
          <div className="people-profile-summary">
            <div className="people-avatar-large">
              {user.profile_image && !avatarLoadError ? (
                <img
                  src={mediaUrl(user.profile_image)}
                  alt={user.username}
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <span className="avatar-placeholder"><MdPerson aria-hidden /></span>
              )}
            </div>
            <div className="profile-titles">
              <div className="profile-name-row">
                <div className="profile-name-block">
                  <h1>{user.username}</h1>
                  <p className="profile-role"><MdCircle className="status-dot" /> {user.role === 'admin' ? 'Administrador' : 'Explorador'}</p>
                </div>
                <div className="profile-actions">
                  {isOwnProfile ? (
                    <button className="btn-follow" onClick={() => navigate('/ajustes/perfil/editar')}>
                      <MdEdit aria-hidden />
                      <span>Editar perfil</span>
                    </button>
                  ) : profile && (
                    <button
                      className={`btn-follow ${isFollowing ? 'following' : ''}`}
                      onClick={handleFollow}
                      disabled={followLoading}
                      onMouseEnter={() => setIsHoveringFollow(true)}
                      onMouseLeave={() => setIsHoveringFollow(false)}
                    >
                      {isFollowing ? (
                        isHoveringFollow ? <MdPersonRemove /> : <MdPersonRemoveAlt1 />
                      ) : (
                        isHoveringFollow ? <MdPersonAdd /> : <MdPersonAddAlt />
                      )}
                      <span>{isFollowing ? 'Dejar de seguir' : 'Seguir'}</span>
                    </button>
                  )}
                </div>
              </div>
              <p className="people-meta">
                <span>Unido: {new Date(stats.joined).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', day: 'numeric' })}</span>
                <span className="separator"><MdCircle aria-hidden /></span>
                <span>Última actividad: {stats.last_activity ? new Date(stats.last_activity).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', day: 'numeric' }) : 'sin actividad'}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <nav className="people-nav">
        <div className="container">
          <ul>
            <li className="active">Perfil</li>
            <li onClick={() => navigate(`/people/${user.username}/observaciones`)}>Observaciones</li>
            <li onClick={() => navigate(`/people/${user.username}/favoritos`)}>Favoritos</li>
          </ul>
        </div>
      </nav>

      <div className="people-content container">
        <div className="people-grid">
          <div className="people-sidebar">
            <div className="stats-box card">
              <div className="stat-item">
                <span className="stat-val">{stats.observations}</span>
                <span className="stat-label">Observaciones</span>
              </div>
              <div className="stat-item">
                <span className="stat-val">{stats.species}</span>
                <span className="stat-label">Especies</span>
              </div>
              <div className="stat-item">
                <span className="stat-val">{stats.followers}</span>
                <span className="stat-label">Seguidores</span>
              </div>
              <div className="stat-item">
                <span className="stat-val">{stats.following || 0}</span>
                <span className="stat-label">Siguiendo</span>
              </div>
            </div>
          </div>

          <div className="people-main">
            <div className="bio-section card">
              <h3>Biografía</h3>
              <div className="bio-text">
                {user.biography ? (
                  <p>{user.biography}</p>
                ) : (
                  <p className="no-bio">Este explorador aún no ha escrito su biografía en Anura.</p>
                )}
              </div>
            </div>

            <div className="recent-activity card">
              <h3>Actividad Reciente</h3>
              <div className="recent-obs-list">
                {recentObservations.length > 0 ? (
                  <>
                    <div className="recent-obs-grid">
                      {recentObservations.map(obs => (
                        <div key={obs.id} className="recent-obs-card" onClick={() => navigate(`/explorer/${obs.id}`)}>
                          <div className="recent-obs-img">
                            <Thumb src={getImageUrl(obs.thumbnail_key, 'medium')} alt={obs.common_name} audioOnly={isAudioOnly(obs)} />
                          </div>
                          <div className="recent-obs-info">
                            <span className="recent-obs-name">{obs.common_name || 'Sin identificar'}</span>
                            <span className="recent-obs-date"><MdCalendarToday /> {new Date(obs.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="view-more-activity" onClick={() => navigate(`/people/${username}/observaciones`)}>
                       <MdChevronRight size={32} />
                       <span>Ver más</span>
                    </div>
                  </>
                ) : (
                  <p className="no-activity">No hay observaciones recientes.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showGuestPrompt && (
        <GuestLoginModal
          onClose={() => setShowGuestPrompt(false)}
          Icon={MdPersonAdd}
          title={`Sigue a ${username}`}
          description="Inicia sesión para seguir a otros exploradores y ver sus nuevas observaciones."
        />
      )}
    </div>
  );
}
