import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCamera, FaCircleCheck, FaTriangleExclamation, FaUser } from 'react-icons/fa6';
import { BsIncognito } from 'react-icons/bs';
import './Profile.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
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
  
  const navigate = useNavigate();
  const token = localStorage.getItem('anura_token');

  useEffect(() => {
    fetchUserData();
  }, []);

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
        setProfileImage(data.user.profile_image || '');
        setPreviewUrl(data.user.profile_image ? `${API_BASE}${data.user.profile_image}` : '');
        setAvatarLoadError(false)
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

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

  if (loading && token) return <div className="profile-loading">Cargando perfil...</div>;

  return (
    <div className="profile-view theme-aware">
      <div className="profile-header">
        <button className="btn-back" onClick={() => navigate('/home/camara')}><FaArrowLeft aria-hidden /> Volver</button>
        <h1>Mi Perfil</h1>
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
          <div className="profile-card card glassmorphism">
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
      </div>
    </div>
  );
}
