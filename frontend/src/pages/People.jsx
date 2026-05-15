import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaCircle, FaTriangleExclamation, FaUser } from 'react-icons/fa6';
import './People.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function People() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [username]);

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

  if (loading) return <div className="people-loading">Explorando perfil de {username}...</div>;
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
            <div className="people-identity">
              <h1>{user.username}</h1>
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
                <span className="stat-val">{stats.identifications}</span>
                <span className="stat-label">Identificaciones</span>
              </div>
              <div className="stat-item">
                <span className="stat-val">{stats.followers}</span>
                <span className="stat-label">Seguidores</span>
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
              <p className="placeholder-text">Próximamente: Lista de las últimas observaciones de {user.username}.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
