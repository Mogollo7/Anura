import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaCircle, FaTriangleExclamation, FaUser, FaCalendarDays } from 'react-icons/fa6';
import { CiCircleMore } from 'react-icons/ci';
import { RiUserFollowLine, RiUserFollowFill, RiUserUnfollowLine, RiUserUnfollowFill } from 'react-icons/ri';
import './People.css';
import LoadingSpinner from '../components/LoadingSpinner';

const API_BASE = import.meta.env.VITE_API_URL || '';

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

  const token = localStorage.getItem('anura_token');
  let loggedInUserId = null;
  try {
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      loggedInUserId = payload.id;
    }
  } catch (e) { /* ignore */ }

  const isOwnProfile = profile && loggedInUserId === profile.user.id;

  const getImageUrl = (key, size = 'small') => {
    if (!key) return '';
    const filename = key.split('/').pop();
    return `${API_BASE}/api/explorer/thumbnail/${size}/${filename}`;
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
      const res = await fetch(`${API_BASE}/api/auth/follow/${username}/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.following);
      }
    } catch (e) { console.error('Error fetching follow status:', e); }
  };

  const handleFollow = async () => {
    if (!token) {
      alert('Inicia sesión para seguir a otros usuarios');
      return;
    }
    setFollowLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/follow/${username}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.following);
        fetchProfile(); // Update follower count
      }
    } catch (e) {
      console.error('Error toggling follow:', e);
    } finally {
      setFollowLoading(false);
    }
  };

  const fetchRecentObservations = async () => {
    try {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${API_BASE}/api/explorer/feed?username=${username}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setRecentObservations(data.slice(0, 3));
      }
    } catch (e) {
      console.error('Error fetching recent obs:', e);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/public/${username}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setAvatarLoadError(false)
      } else {
        const errData = await res.json();
        setError(errData.message || 'No se pudo cargar el perfil');
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner text={`Cargando perfil de ${username}...`} />;
  if (error) return (
    <div className="people-error">
      <p><FaTriangleExclamation aria-hidden /> {error}</p>
      <button onClick={() => navigate('/explorer')} className="btn-primary">Volver al Explorador</button>
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
                  src={`${API_BASE}${user.profile_image}`}
                  alt={user.username}
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <span className="avatar-placeholder"><FaUser aria-hidden /></span>
              )}
            </div>
            <div className="profile-titles">
              <div className="profile-name-row">
                <div className="profile-name-block">
                  <h1>{user.username}</h1>
                  <p className="profile-role"><FaCircle className="status-dot" /> {user.role === 'admin' ? 'Administrador' : 'Explorador'}</p>
                </div>
                <div className="profile-actions">
                  {token && profile && !isOwnProfile && (
                    <button 
                      className={`btn-follow ${isFollowing ? 'following' : ''}`}
                      onClick={handleFollow}
                      disabled={followLoading}
                      onMouseEnter={() => setIsHoveringFollow(true)}
                      onMouseLeave={() => setIsHoveringFollow(false)}
                    >
                      {isFollowing ? (
                        isHoveringFollow ? <RiUserUnfollowFill /> : <RiUserUnfollowLine />
                      ) : (
                        isHoveringFollow ? <RiUserFollowFill /> : <RiUserFollowLine />
                      )}
                      <span>{isFollowing ? 'Dejar de seguir' : 'Seguir'}</span>
                    </button>
                  )}
                </div>
              </div>
              <p className="people-meta">
                Unido: {new Date(stats.joined).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', day: 'numeric' })}
                <span className="separator"><FaCircle aria-hidden /></span>
                Última actividad: {new Date(stats.last_activity).toLocaleDateString('es-ES', { month: 'short', year: 'numeric', day: 'numeric' })}
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
                            <img src={getImageUrl(obs.thumbnail_key, 'medium')} alt={obs.common_name} />
                          </div>
                          <div className="recent-obs-info">
                            <span className="recent-obs-name">{obs.common_name || 'Sin identificar'}</span>
                            <span className="recent-obs-date"><FaCalendarDays /> {new Date(obs.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="view-more-activity" onClick={() => navigate(`/people/${username}/observaciones`)}>
                       <CiCircleMore size={32} />
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
    </div>
  );
}
