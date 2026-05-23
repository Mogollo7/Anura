import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaArrowLeft, FaCamera, FaCircleCheck, FaTriangleExclamation, FaUser, 
  FaEllipsisVertical, FaLocationDot, FaCalendarDays, FaFrog, FaPalette, 
  FaMobileScreenButton, FaGlobe, FaUniversalAccess, FaBell, FaLock, 
  FaBookOpen, FaMicroscope, FaGear, FaEnvelope, FaMoon,
  FaMagnifyingGlass, FaXmark
} from 'react-icons/fa6';
import { FiSun } from 'react-icons/fi';
import { BsIncognito } from 'react-icons/bs';
import './Profile.css';
import LoadingSpinner from '../components/LoadingSpinner';
import BackButton from '../components/BackButton';
import { usePreferencesStore } from '../store/preferencesStore';

const API_BASE = import.meta.env.VITE_API_URL || '';

const getImageUrl = (key, size = 'medium') => {
  if (!key) return '';
  const filename = key.split('/').pop();
  return `${API_BASE}/api/explorer/thumbnail/${size}/${filename}`;
};

export default function Profile() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [biography, setBiography] = useState('');
  const [profileImage, setProfileImage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const [observations, setObservations] = useState([]);
  const [obsLoading, setObsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [privacyFilter, setPrivacyFilter] = useState('all'); // 'all', 'public', 'private'
  const [actionMenuOpen, setActionMenuOpen] = useState(null);
  const [editObservation, setEditObservation] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLon, setEditLon] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

  const filteredObservations = observations.filter(obs => {
    if (privacyFilter === 'public' && obs.is_private) return false;
    if (privacyFilter === 'private' && !obs.is_private) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    
    const matchesCommonName = obs.common_name && obs.common_name.toLowerCase().includes(q);
    const matchesSpecies = obs.species && obs.species.toLowerCase().includes(q);
    const matchesGenus = obs.genus && obs.genus.toLowerCase().includes(q);
    const matchesFamily = obs.family && obs.family.toLowerCase().includes(q);
    const matchesNotes = obs.notes && obs.notes.toLowerCase().includes(q);
    const matchesPlace = obs.place_guess && obs.place_guess.toLowerCase().includes(q);
    const matchesAiClass = obs.ai_class && obs.ai_class.toLowerCase().replace(/_/g, ' ').includes(q);

    return !!(matchesCommonName || matchesSpecies || matchesGenus || matchesFamily || matchesNotes || matchesPlace || matchesAiClass);
  });

  const {
    preferences,
    updateAllPreferences,
    completePreferences,
    savePreferences,
  } = usePreferencesStore();

  const params = new URLSearchParams(window.location.search);
  const isNewUserFlow = params.get('new') === 'true' || !preferences.preferencesCompleted;

  const [activePrefTab, setActivePrefTab] = useState(isNewUserFlow ? 'theme' : 'profile');
  const [localPrefs, setLocalPrefs] = useState({
    theme: preferences.theme,
    mode: preferences.mode,
    language: preferences.language,
    accessibility_mode: preferences.accessibility_mode,
    notifications_enabled: preferences.notifications_enabled,
    email_notifications: preferences.email_notifications,
    push_notifications: preferences.push_notifications,
    exact_location_enabled: preferences.exact_location_enabled,
    public_profile: preferences.public_profile,
  });

  // Sync if preferences loaded from backend
  useEffect(() => {
    setLocalPrefs({
      theme: preferences.theme,
      mode: preferences.mode,
      language: preferences.language,
      accessibility_mode: preferences.accessibility_mode,
      notifications_enabled: preferences.notifications_enabled,
      email_notifications: preferences.email_notifications,
      push_notifications: preferences.push_notifications,
      exact_location_enabled: preferences.exact_location_enabled,
      public_profile: preferences.public_profile,
    });
  }, [preferences]);
  
  const navigate = useNavigate();
  const token = localStorage.getItem('anura_token');

  useEffect(() => {
    if (token) {
      fetchUserData();
    } else {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setAvatarLoadError(false)
  }, [previewUrl])

  const fetchUserData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        setUsername(data.user.username || '');
        setBiography(data.user.biography || '');
        setProfileImage(data.user.profile_image || '');
        setPreviewUrl(data.user.profile_image ? `${API_BASE}${data.user.profile_image}` : '');
        setAvatarLoadError(false)
        fetchUserObservations(data.user.username);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserObservations = async (uname) => {
    setObsLoading(true);
    try {
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/api/explorer/feed?username=${encodeURIComponent(uname)}`, { headers });
      if (res.ok) {
        setObservations(await res.json());
      }
    } catch (err) {
      console.error('Error fetching observations:', err);
    } finally {
      setObsLoading(false);
    }
  };

  const startEditObservation = (obs) => {
    setActionMenuOpen(null);
    setEditObservation(obs);
    setEditNotes(obs.notes || '');
    setEditLat(obs.lat != null ? String(obs.lat) : '');
    setEditLon(obs.lon != null ? String(obs.lon) : '');
    setEditPrivate(Boolean(obs.is_private));
    setEditError(null);
  };

  const closeEditModal = () => {
    setEditObservation(null);
    setEditError(null);
  };

  const handleUpdateObservation = async (e) => {
    e.preventDefault();
    if (!editObservation) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const token = localStorage.getItem('anura_token');
      const res = await fetch(`${API_BASE}/api/observations/${editObservation.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          notes: editNotes,
          lat: editLat !== '' ? editLat : null,
          lon: editLon !== '' ? editLon : null,
          is_private: editPrivate
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error al actualizar');
      setObservations((prev) => prev.map((item) => item.id === editObservation.id ? { ...item, ...data.observation } : item));
      setEditObservation(null);
      setActionMenuOpen(null);
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteObservation = async (e, obsId) => {
    e.stopPropagation();
    const confirmDelete = window.confirm('¿Estás seguro de que deseas eliminar esta observación? Esta acción no se puede deshacer.');
    if (!confirmDelete) return;

    try {
      const res = await fetch(`${API_BASE}/api/observations/${obsId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setObservations(prev => prev.filter(obs => obs.id !== obsId));
        setMessage('Observación eliminada correctamente');
      } else {
        setError(data.message || 'Error al eliminar la observación');
      }
    } catch (err) {
      console.error(err);
      setError('Error de conexión al eliminar la observación');
    }
  };

  const handlePrefChange = async (key, value) => {
    setError(null);
    setMessage(null);
    try {
      const updated = { ...localPrefs, [key]: value };
      setLocalPrefs(updated);
      updateAllPreferences(updated);
      await savePreferences();
    } catch (err) {
      console.error(err);
      setError('Error al guardar la preferencia');
    }
  };

  const handleSkipPrefs = async () => {
    completePreferences();
    await savePreferences();
    navigate('/home/camara');
  };

  const prefField = (key) => ({
    checked: localPrefs[key] || false,
    onChange: (e) => handlePrefChange(key, e.target.checked),
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword && newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('biography', biography);
      if (selectedFile) {
        formData.append('image', selectedFile);
      }
      if (newPassword) {
        formData.append('currentPassword', currentPassword);
        formData.append('newPassword', newPassword);
      }

      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Perfil actualizado correctamente');
        setUser(data.user);
        setProfileImage(data.user.profile_image);
        setPreviewUrl(`${API_BASE}${data.user.profile_image}`);
        setAvatarLoadError(false)
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSelectedFile(null);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Error al actualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  if (loading && token) return <LoadingSpinner text="Cargando tu perfil..." />;

  return (
    <div className="profile-view theme-aware">
      <div className="profile-header">
        <div className="container header-flex-profile">
          <BackButton to="/home/camara" noWrapper className="profile-back-btn" />
          <h1>Mi Perfil</h1>
        </div>
      </div>

      <div className={`profile-container container ${!token ? 'guest-mode-container' : ''}`}>
        {!token ? (
          <div className="profile-card card guest-profile-card glassmorphism animate-fade">
            <div className="guest-avatar">
              <BsIncognito aria-hidden />
            </div>
            <h2>Modo Invitado</h2>
            <p>Estás explorando Anura como invitado. Para personalizar tu perfil, guardar observaciones y seguir a otros exploradores, necesitas una cuenta.</p>
            
            <div className="guest-actions">
              <button className="btn-primary" onClick={() => navigate('/login')}>
                Iniciar Sesión
              </button>
              <button className="btn-secondary" onClick={() => navigate('/register')}>
                Crear Cuenta
              </button>
            </div>
          </div>
        ) : (
          <div className="profile-layout-grid animate-fade">
            <div className="profile-config-card card glassmorphism">
              <div className="pref-card-header">
                <h2><FaGear aria-hidden className="spin-slow" /> Configuración</h2>
                {isNewUserFlow && (
                  <div className="new-user-badge animate-pulse">
                    Configura tus preferencias antes de continuar
                  </div>
                )}
              </div>

              <div className="pref-box-layout">
                <div className="pref-box-nav">
                  {!isNewUserFlow && (
                    <>
                      <button
                        type="button"
                        className={`pref-nav-item ${activePrefTab === 'profile' ? 'active' : ''}`}
                        onClick={() => setActivePrefTab('profile')}
                      >
                        <FaUser aria-hidden /> <span>Mi Perfil</span>
                      </button>
                      <button
                        type="button"
                        className={`pref-nav-item ${activePrefTab === 'observations' ? 'active' : ''}`}
                        onClick={() => setActivePrefTab('observations')}
                      >
                        <FaFrog aria-hidden /> <span>Mis Observaciones</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={`pref-nav-item ${activePrefTab === 'theme' ? 'active' : ''}`}
                    onClick={() => setActivePrefTab('theme')}
                  >
                    <FaPalette aria-hidden /> <span>Tema</span>
                  </button>
                  <button
                    type="button"
                    className={`pref-nav-item ${activePrefTab === 'mode' ? 'active' : ''}`}
                    onClick={() => setActivePrefTab('mode')}
                  >
                    <FaMobileScreenButton aria-hidden /> <span>Modo</span>
                  </button>
                  <button
                    type="button"
                    className={`pref-nav-item ${activePrefTab === 'language' ? 'active' : ''}`}
                    onClick={() => setActivePrefTab('language')}
                  >
                    <FaGlobe aria-hidden /> <span>Idioma</span>
                  </button>
                  <button
                    type="button"
                    className={`pref-nav-item ${activePrefTab === 'accessibility' ? 'active' : ''}`}
                    onClick={() => setActivePrefTab('accessibility')}
                  >
                    <FaUniversalAccess aria-hidden /> <span>Accesibilidad</span>
                  </button>
                  <button
                    type="button"
                    className={`pref-nav-item ${activePrefTab === 'notifications' ? 'active' : ''}`}
                    onClick={() => setActivePrefTab('notifications')}
                  >
                    <FaBell aria-hidden /> <span>Notificaciones</span>
                  </button>
                  <button
                    type="button"
                    className={`pref-nav-item ${activePrefTab === 'privacy' ? 'active' : ''}`}
                    onClick={() => setActivePrefTab('privacy')}
                  >
                    <FaLock aria-hidden /> <span>Privacidad</span>
                  </button>
                </div>

                <div className="pref-box-content">
                  {activePrefTab === 'profile' && !isNewUserFlow && (
                    <div className="pref-tab-panel animate-fade">
                      <h3>Mi Perfil</h3>
                      <p className="tab-panel-desc">Actualiza tu información personal y de seguridad.</p>
                      
                      <div className="profile-avatar-section">
                        <div className="profile-avatar-large">
                          {previewUrl && !avatarLoadError ? (
                            <img
                              src={previewUrl}
                              alt="Avatar"
                              onError={() => setAvatarLoadError(true)}
                            />
                          ) : (
                            <span className="avatar-placeholder"><FaUser aria-hidden /></span>
                          )}
                        </div>
                        <input 
                          type="file" 
                          id="avatar-input" 
                          hidden 
                          accept="image/*" 
                          onChange={handleFileChange} 
                        />
                        <label htmlFor="avatar-input" className="btn-change-photo">
                          <FaCamera aria-hidden /> Cambiar foto
                        </label>
                        <p className="user-email">{user?.email}</p>
                      </div>

                      <form onSubmit={handleUpdate} className="profile-form">
                        <div className="form-group">
                          <label>Nombre de usuario</label>
                          <input 
                            type="text" 
                            value={username} 
                            onChange={(e) => setUsername(e.target.value)} 
                            placeholder="Tu nombre de explorador"
                            className="theme-input"
                          />
                        </div>

                        <div className="form-group">
                          <label>Biografía</label>
                          <textarea 
                            value={biography} 
                            onChange={(e) => setBiography(e.target.value)} 
                            placeholder="Cuéntanos sobre ti..."
                            className="theme-input"
                            style={{ minHeight: '80px', resize: 'vertical' }}
                          />
                        </div>

                        <hr className="form-divider" />
                        <h3>Seguridad</h3>
                        <p className="form-hint">Completa para cambiar tu contraseña</p>

                        <div className="form-group">
                          <label>Contraseña actual</label>
                          <input 
                            type="password" 
                            value={currentPassword} 
                            onChange={(e) => setCurrentPassword(e.target.value)} 
                            className="theme-input"
                          />
                        </div>

                        <div className="form-group">
                          <label>Nueva contraseña</label>
                          <input 
                            type="password" 
                            value={newPassword} 
                            onChange={(e) => setNewPassword(e.target.value)} 
                            className="theme-input"
                          />
                        </div>

                        <div className="form-group">
                          <label>Confirmar nueva contraseña</label>
                          <input 
                            type="password" 
                            value={confirmPassword} 
                            onChange={(e) => setConfirmPassword(e.target.value)} 
                            className="theme-input"
                          />
                        </div>

                        {error && <div className="error-box animate-shake"><FaTriangleExclamation aria-hidden /> {error}</div>}
                        {message && <div className="success-box animate-fade"><FaCircleCheck aria-hidden /> {message}</div>}

                        <button type="submit" className="btn-primary btn-save" disabled={saving}>
                          {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                      </form>
                    </div>
                  )}

                  {activePrefTab === 'observations' && !isNewUserFlow && (
                    <div className="pref-tab-panel animate-fade">
                      <h3>Mis Observaciones ({observations.length})</h3>
                      <p className="tab-panel-desc">Gestiona tus registros y avistamientos.</p>

                      {obsLoading ? (
                        <div className="profile-obs-loading">
                          <LoadingSpinner text="Cargando tus observaciones..." />
                        </div>
                      ) : observations.length === 0 ? (
                        <div className="profile-obs-empty animate-fade">
                          <FaFrog aria-hidden className="po-empty-icon" />
                          <p>Aún no has registrado ninguna observación.</p>
                          <button className="btn-primary" onClick={() => navigate('/home/camara')}>
                            Subir primera observación
                          </button>
                        </div>
                      ) : (
                        <div>
                          <div className="obs-controls">
                            <div className="obs-search-wrapper">
                              <FaMagnifyingGlass className="search-icon" />
                              <input
                                type="text"
                                placeholder="Buscar por especie, familia, nombre común..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="obs-search-input"
                              />
                              {searchQuery && (
                                <button type="button" onClick={() => setSearchQuery('')} className="btn-clear-search">
                                  <FaXmark />
                                </button>
                              )}
                            </div>

                            <div className="obs-privacy-filters">
                              <button type="button" className={`filter-btn ${privacyFilter === 'all' ? 'active' : ''}`} onClick={() => setPrivacyFilter('all')}>
                                Todas ({observations.length})
                              </button>
                              <button type="button" className={`filter-btn ${privacyFilter === 'public' ? 'active' : ''}`} onClick={() => setPrivacyFilter('public')}>
                                <FaGlobe /> Públicas ({observations.filter(o => !o.is_private).length})
                              </button>
                              <button type="button" className={`filter-btn ${privacyFilter === 'private' ? 'active' : ''}`} onClick={() => setPrivacyFilter('private')}>
                                <FaLock /> Privadas ({observations.filter(o => o.is_private).length})
                              </button>
                            </div>
                          </div>

                          {editObservation && (
                            <div className="obs-edit-modal-backdrop" role="dialog" aria-modal="true">
                              <div className="obs-edit-modal">
                                <div className="obs-edit-header">
                                  <h3>Editar observación</h3>
                                  <button type="button" className="close-modal" onClick={closeEditModal} aria-label="Cerrar">
                                    <FaXmark />
                                  </button>
                                </div>
                                <form className="obs-edit-form" onSubmit={handleUpdateObservation}>
                                  <div className="form-group">
                                    <label>Notas</label>
                                    <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={5} />
                                  </div>
                                  <div className="form-group">
                                    <label>Ubicación</label>
                                    <div className="obs-edit-location-grid">
                                      <input type="number" step="0.00001" placeholder="Latitud" value={editLat} onChange={(e) => setEditLat(e.target.value)} />
                                      <input type="number" step="0.00001" placeholder="Longitud" value={editLon} onChange={(e) => setEditLon(e.target.value)} />
                                    </div>
                                  </div>
                                  <div className="form-group">
                                    <label>Visibilidad</label>
                                    <div className="visibility-options">
                                      <button type="button" className={`btn-toggle ${!editPrivate ? 'active' : ''}`} onClick={() => setEditPrivate(false)}>Pública</button>
                                      <button type="button" className={`btn-toggle ${editPrivate ? 'active' : ''}`} onClick={() => setEditPrivate(true)}>Privada</button>
                                    </div>
                                  </div>
                                  {editError && <div className="error-box"><FaTriangleExclamation aria-hidden /> {editError}</div>}
                                  <div className="obs-edit-actions">
                                    <button type="button" className="btn-secondary" onClick={closeEditModal}>Cancelar</button>
                                    <button type="submit" className="btn-primary" disabled={editLoading}>{editLoading ? 'Guardando...' : 'Guardar cambios'}</button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          )}

                          <div className="profile-obs-list">
                            {filteredObservations.map((obs) => {
                              const imageSrc = getImageUrl(obs.thumbnail_key, 'medium');
                              const scientificLabel = obs.scientific_name?.replace(/_/g, ' ') || obs.ai_class?.replace(/_/g, ' ');
                              const fmtDateStr = new Date(obs.recorded_at || obs.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
                              return (
                                <div key={obs.id} className="profile-obs-item" onClick={() => navigate(`/explorer/${obs.id}`)}>
                                  <div className="profile-obs-thumb">
                                    {obs.thumbnail_key ? <img src={imageSrc} alt={obs.common_name || 'Frog'} onError={(e) => { e.target.style.display = 'none'; }} /> : <FaFrog className="placeholder-icon" />}
                                  </div>
                                  <div className="profile-obs-info">
                                    <strong>{obs.common_name || 'Sin identificar'}</strong>
                                    {scientificLabel ? <small>{scientificLabel}</small> : null}
                                    <div className="profile-obs-meta">
                                      <span><FaCalendarDays /> {fmtDateStr}</span>
                                      {obs.place_guess && <span><FaLocationDot /> {obs.place_guess}</span>}
                                      <span className={`privacy-badge ${obs.is_private ? 'private' : 'public'}`}>{obs.is_private ? <FaLock /> : <FaGlobe />} {obs.is_private ? 'Privada' : 'Pública'}</span>
                                    </div>
                                  </div>
                                  <div className="obs-actions-wrapper">
                                    <button type="button" className="btn-action-obs" onClick={(e) => { e.stopPropagation(); setActionMenuOpen((prev) => (prev === obs.id ? null : obs.id)); }} title="Acciones"><FaEllipsisVertical aria-hidden /></button>
                                    {actionMenuOpen === obs.id && (
                                      <div className="obs-action-menu" onClick={(e) => e.stopPropagation()}>
                                        <button type="button" onClick={() => startEditObservation(obs)}>Editar</button>
                                        <button type="button" className="danger" onClick={(e) => { handleDeleteObservation(e, obs.id); setActionMenuOpen(null); }}>Eliminar</button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {activePrefTab === 'theme' && (
                    <div className="pref-tab-panel animate-fade">
                      <h3>Tema visual</h3>
                      <p className="tab-panel-desc">Elige la apariencia de la interfaz de la aplicación.</p>
                      <div className="options-grid">
                        {['light', 'dark'].map((t) => (
                          <label key={t} className={`option-card ${localPrefs.theme === t ? 'selected' : ''}`}>
                            <input
                              type="radio" name="profile_theme" value={t}
                              checked={localPrefs.theme === t}
                              onChange={() => handlePrefChange('theme', t)}
                            />
                            <span className={`theme-icon theme-${t}`}>
                              {t === 'light' ? <FiSun aria-hidden /> : <FaMoon aria-hidden />}
                            </span>
                            <span className="option-label">
                              {t === 'light' ? 'Claro' : 'Oscuro'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePrefTab === 'mode' && (
                    <div className="pref-tab-panel animate-fade">
                      <h3>Modo de uso</h3>
                      <p className="tab-panel-desc">Adapta la interfaz según tu objetivo en Anura.</p>
                      <div className="options-grid vertical-stack">
                        {Object.entries({
                          standard: 'Interfaz estándar con todas las funciones',
                          educational: 'Enfocado en educación y enseñanza',
                          scientific: 'Interfaz especializada para investigadores',
                        }).map(([m, desc]) => (
                          <label key={m} className={`option-card-row ${localPrefs.mode === m ? 'selected' : ''}`}>
                            <input
                              type="radio" name="profile_mode" value={m}
                              checked={localPrefs.mode === m}
                              onChange={() => handlePrefChange('mode', m)}
                            />
                            <span className="mode-icon">
                              {m === 'standard' && <FaGear aria-hidden />}
                              {m === 'educational' && <FaBookOpen aria-hidden />}
                              {m === 'scientific' && <FaMicroscope aria-hidden />}
                            </span>
                            <div className="mode-label-group">
                              <span className="option-label">
                                {m.charAt(0).toUpperCase() + m.slice(1)}
                              </span>
                              <span className="option-description">{desc}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePrefTab === 'language' && (
                    <div className="pref-tab-panel animate-fade">
                      <h3>Idioma</h3>
                      <p className="tab-panel-desc">Selecciona tu idioma de preferencia.</p>
                      <div className="options-grid">
                        {[
                          { code: 'es', tag: 'ES', label: 'Español' },
                          { code: 'en', tag: 'EN', label: 'English' },
                          { code: 'fr', tag: 'FR', label: 'Français' },
                          { code: 'pt', tag: 'PT', label: 'Português' },
                        ].map(({ code, tag, label }) => (
                          <label key={code} className={`option-card ${localPrefs.language === code ? 'selected' : ''}`}>
                            <input
                              type="radio" name="profile_language" value={code}
                              checked={localPrefs.language === code}
                              onChange={() => handlePrefChange('language', code)}
                            />
                            <span className="lang-flag">{tag}</span>
                            <span className="option-label">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePrefTab === 'accessibility' && (
                    <div className="pref-tab-panel animate-fade">
                      <h3>Accesibilidad</h3>
                      <p className="tab-panel-desc">Ajustes visuales y de alto contraste.</p>
                      <div className="accessibility-checks">
                        <label className="checkbox-label">
                          <input type="checkbox" {...prefField('accessibility_mode')} />
                          <span>Alto contraste</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {activePrefTab === 'notifications' && (
                    <div className="pref-tab-panel animate-fade">
                      <h3>Notificaciones</h3>
                      <p className="tab-panel-desc">Configura cómo y dónde recibir alertas.</p>
                      <div className="accessibility-checks">
                        <label className="checkbox-label">
                          <input type="checkbox" {...prefField('notifications_enabled')} />
                          <span>Notificaciones generales</span>
                        </label>
                        <label className="checkbox-label">
                          <input type="checkbox" {...prefField('email_notifications')} />
                          <span><FaEnvelope aria-hidden /> Notificaciones por email</span>
                        </label>
                        <label className="checkbox-label">
                          <input type="checkbox" {...prefField('push_notifications')} />
                          <span><FaMobileScreenButton aria-hidden /> Notificaciones push</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {activePrefTab === 'privacy' && (
                    <div className="pref-tab-panel animate-fade">
                      <h3>Privacidad</h3>
                      <p className="tab-panel-desc">Gestiona la privacidad de tu perfil y ubicaciones.</p>
                      <div className="accessibility-checks">
                        <label className="checkbox-label">
                          <input type="checkbox" {...prefField('exact_location_enabled')} />
                          <span><FaLocationDot aria-hidden /> Ubicación exacta en observaciones</span>
                        </label>
                        <label className="checkbox-label">
                          <input type="checkbox" {...prefField('public_profile')} />
                          <span><FaUser aria-hidden /> Perfil público</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {isNewUserFlow && (
                    <div className="pref-box-actions">
                      <button type="button" onClick={handleSkipPrefs} className="btn-secondary">
                        Omitir
                      </button>
                      <button type="button" onClick={handleSkipPrefs} className="btn-primary">
                        Continuar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
