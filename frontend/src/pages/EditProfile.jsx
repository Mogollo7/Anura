import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdPhotoCamera, MdCheckCircle, MdWarning, MdPerson } from 'react-icons/md';
import './EditProfile.css';
import LoadingSpinner from '../components/LoadingSpinner';
import BackButton from '../components/BackButton';
import { apiGet, apiPut } from '../services/api';
import { mediaUrl } from '../lib/format';

/**
 * Editar cuenta — extraído de lo que antes era la pestaña "Mi Perfil" dentro
 * de Profile.jsx. El perfil que se ve (avatar, stats, bio, actividad) es
 * People.jsx; esto es solo el formulario de edición, como EditProfile en
 * AnuraRoute.kt (ruta separada de ver el perfil).
 */
export default function EditProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [biography, setBiography] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet('/api/auth/me')
      .then((data) => {
        setUser(data.user);
        setUsername(data.user.username || '');
        setBiography(data.user.biography || '');
        setPreviewUrl(data.user.profile_image ? mediaUrl(data.user.profile_image) : '');
      })
      .catch((err) => setError(err.body?.message || 'Error al conectar con el servidor'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [previewUrl]);

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
      if (selectedFile) formData.append('image', selectedFile);
      if (newPassword) {
        formData.append('currentPassword', currentPassword);
        formData.append('newPassword', newPassword);
      }

      const data = await apiPut('/api/auth/profile', formData);
      setMessage('Perfil actualizado correctamente');
      setUser(data.user);
      setPreviewUrl(mediaUrl(data.user.profile_image));
      setAvatarLoadError(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSelectedFile(null);
    } catch (err) {
      setError(err.body?.message || 'Error al actualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner text="Cargando tu perfil..." />;

  return (
    <div className="edit-profile-view theme-aware">
      <header className="edit-profile-header">
        <div className="container edit-profile-header-inner">
          <BackButton to={user ? `/people/${user.username}` : '/inicio'} noWrapper />
          <h1>Editar perfil</h1>
        </div>
      </header>

      <div className="container edit-profile-container">
        <div className="edit-profile-card card">
          <div className="profile-avatar-section">
            <div className="profile-avatar-large">
              {previewUrl && !avatarLoadError ? (
                <img src={previewUrl} alt="Avatar" onError={() => setAvatarLoadError(true)} />
              ) : (
                <span className="avatar-placeholder"><MdPerson aria-hidden /></span>
              )}
            </div>
            <input type="file" id="avatar-input" hidden accept="image/*" onChange={handleFileChange} />
            <label htmlFor="avatar-input" className="btn-change-photo">
              <MdPhotoCamera aria-hidden /> Cambiar foto
            </label>
            <p className="user-email">{user?.email}</p>
          </div>

          <form onSubmit={handleUpdate} className="edit-profile-form">
            <div className="form-group">
              <label htmlFor="edit-username">Nombre de usuario</label>
              <input
                id="edit-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu nombre de explorador"
                className="theme-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-biography">Biografía</label>
              <textarea
                id="edit-biography"
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
              <label htmlFor="edit-current-password">Contraseña actual</label>
              <input id="edit-current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="theme-input" />
            </div>

            <div className="form-group">
              <label htmlFor="edit-new-password">Nueva contraseña</label>
              <input id="edit-new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="theme-input" />
            </div>

            <div className="form-group">
              <label htmlFor="edit-confirm-password">Confirmar nueva contraseña</label>
              <input id="edit-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="theme-input" />
            </div>

            {error && <div className="error-box"><MdWarning aria-hidden /> {error}</div>}
            {message && <div className="success-box"><MdCheckCircle aria-hidden /> {message}</div>}

            <button type="submit" className="btn-primary btn-save" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
