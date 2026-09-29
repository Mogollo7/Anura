import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdPerson, MdEdit, MdChevronRight, MdPalette,
  MdLightMode, MdDarkMode, MdBrightnessAuto, MdLogout, MdInventory2,
  MdNotifications, MdStar,
} from 'react-icons/md';
import './Settings.css';
import { usePreferencesStore } from '../store/preferencesStore';
import { apiGet } from '../services/api';
import { mediaUrl } from '../lib/format';

/**
 * Ajustes — antes "Mi Perfil" (Profile.jsx) mezclaba esto con edición de
 * cuenta y gestión de observaciones. Ahora replica SettingsScreen.kt: una
 * cabecera de perfil compacta (que enlaza al perfil real, People.jsx, y a
 * Editar perfil), Paquetes ("Zonas descargadas" en Android — ampliado en la
 * web a Explorar/Mis paquetes/Dispositivo), Apariencia, y Cerrar sesión.
 */
export default function Settings({ onLogout }) {
  const navigate = useNavigate();
  const {
    preferences, setTheme, completePreferences, savePreferences,
    setNotifyNewPackages, setNotifyFeaturedObservations,
  } = usePreferencesStore();
  const [user, setUser] = useState(null);

  const params = new URLSearchParams(window.location.search);
  const isNewUserFlow = params.get('new') === 'true' || !preferences.preferencesCompleted;

  useEffect(() => {
    apiGet('/api/auth/me').then((data) => setUser(data.user)).catch(() => {});
  }, []);

  const handlePrefChange = async (key, value) => {
    if (key === 'theme') setTheme(value);
    if (key === 'notify_new_packages') setNotifyNewPackages(value);
    if (key === 'notify_featured_observations') setNotifyFeaturedObservations(value);
    try {
      await savePreferences();
    } catch (err) {
      console.error('Error al guardar la preferencia', err);
    }
  };

  const handleSkipPrefs = async () => {
    completePreferences();
    await savePreferences();
    navigate('/inicio');
  };

  return (
    <div className="settings-view theme-aware">
      <header className="settings-header">
        <div className="container">
          <h1>Perfil</h1>
        </div>
      </header>

      <div className="container settings-container">
        {isNewUserFlow && (
          <div className="new-user-badge">Configura tu apariencia antes de continuar</div>
        )}

        <button
          type="button"
          className="settings-profile-row card"
          onClick={() => user && navigate(`/people/${user.username}`)}
        >
          <span className="settings-avatar">
            {user?.profile_image ? <img src={mediaUrl(user.profile_image)} alt="" /> : <MdPerson aria-hidden />}
          </span>
          <span className="settings-profile-text">
            <strong>{user?.username || 'Mi cuenta'}</strong>
            <small>Ver mi perfil</small>
          </span>
          <MdChevronRight aria-hidden className="settings-row-arrow" />
        </button>

        <button type="button" className="settings-row card" onClick={() => navigate('/ajustes/perfil/editar')}>
          <span className="settings-row-icon"><MdEdit aria-hidden /></span>
          <span className="settings-row-text">Editar perfil</span>
          <MdChevronRight aria-hidden className="settings-row-arrow" />
        </button>

        <button type="button" className="settings-row card" onClick={() => navigate('/paquetes')}>
          <span className="settings-row-icon"><MdInventory2 aria-hidden /></span>
          <span className="settings-row-text">Paquetes</span>
          <MdChevronRight aria-hidden className="settings-row-arrow" />
        </button>

        <section className="settings-section card">
          <h2><MdPalette aria-hidden /> Apariencia</h2>
          <p className="settings-section-desc">El mismo tema que usas en la app móvil.</p>
          <div className="options-grid">
            {[
              { id: 'light', label: 'Claro', desc: 'Fondos claros', Icon: MdLightMode },
              { id: 'dark', label: 'Oscuro', desc: 'Fondos oscuros', Icon: MdDarkMode },
              { id: 'system', label: 'Automático', desc: 'Igual que tu dispositivo', Icon: MdBrightnessAuto },
            ].map(({ id, label, desc, Icon }) => (
              <label key={id} className={`option-card ${preferences.theme === id ? 'selected' : ''}`}>
                <input
                  type="radio" name="settings_theme" value={id}
                  checked={preferences.theme === id}
                  onChange={() => handlePrefChange('theme', id)}
                />
                <span className={`theme-icon theme-${id}`}>
                  <Icon aria-hidden />
                </span>
                <span className="option-label">{label}</span>
                <span className="option-desc">{desc}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="settings-section card">
          <h2><MdNotifications aria-hidden /> Notificaciones</h2>
          <p className="settings-section-desc">Elige qué avisos quieres recibir.</p>
          <div className="settings-toggle-list">
            <label className="settings-toggle">
              <span className="settings-row-icon"><MdInventory2 aria-hidden /></span>
              <span className="settings-toggle-text">
                <strong>Paquetes nuevos</strong>
                <small>Cuando se publique un paquete regional nuevo</small>
              </span>
              <input
                type="checkbox"
                className="switch-input"
                role="switch"
                aria-checked={preferences.notify_new_packages ?? true}
                checked={preferences.notify_new_packages ?? true}
                onChange={(e) => handlePrefChange('notify_new_packages', e.target.checked)}
              />
            </label>
            <label className="settings-toggle">
              <span className="settings-row-icon"><MdStar aria-hidden /></span>
              <span className="settings-toggle-text">
                <strong>Observaciones destacadas</strong>
                <small>Cuando una observación tuya sea destacada</small>
              </span>
              <input
                type="checkbox"
                className="switch-input"
                role="switch"
                aria-checked={preferences.notify_featured_observations ?? true}
                checked={preferences.notify_featured_observations ?? true}
                onChange={(e) => handlePrefChange('notify_featured_observations', e.target.checked)}
              />
            </label>
          </div>
        </section>

        {isNewUserFlow ? (
          <div className="settings-actions">
            <button type="button" onClick={handleSkipPrefs} className="btn-primary">Continuar</button>
          </div>
        ) : (
          <button type="button" className="settings-row settings-logout card" onClick={onLogout}>
            <span className="settings-row-icon"><MdLogout aria-hidden /></span>
            <span className="settings-row-text">Cerrar sesión</span>
          </button>
        )}
      </div>
    </div>
  );
}
