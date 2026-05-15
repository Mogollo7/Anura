import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaBell,
  FaBookOpen,
  FaCircleCheck,
  FaEnvelope,
  FaFrog,
  FaGear,
  FaGlobe,
  FaLocationDot,
  FaLock,
  FaMicroscope,
  FaMobileScreenButton,
  FaMoon,
  FaPalette,
  FaUniversalAccess,
  FaUser,
} from 'react-icons/fa6'
import { FiSun } from 'react-icons/fi'
import { usePreferencesStore } from '../store/preferencesStore'
import './Preferences.css'

export default function Preferences() {
  const navigate = useNavigate()
  const {
    preferences,
    updateAllPreferences,
    completePreferences,
    savePreferences,
  } = usePreferencesStore()

  // Local state mirrors the DB columns exactly
  const [local, setLocal] = useState({
    theme: preferences.theme,
    mode: preferences.mode,
    language: preferences.language,
    accessibility_mode: preferences.accessibility_mode,
    notifications_enabled: preferences.notifications_enabled,
    email_notifications: preferences.email_notifications,
    push_notifications: preferences.push_notifications,
    exact_location_enabled: preferences.exact_location_enabled,
    public_profile: preferences.public_profile,
  })

  // Sync if preferences loaded from backend after mount
  useEffect(() => {
    setLocal({
      theme: preferences.theme,
      mode: preferences.mode,
      language: preferences.language,
      accessibility_mode: preferences.accessibility_mode,
      notifications_enabled: preferences.notifications_enabled,
      email_notifications: preferences.email_notifications,
      push_notifications: preferences.push_notifications,
      exact_location_enabled: preferences.exact_location_enabled,
      public_profile: preferences.public_profile,
    })
  }, [preferences])

  const handleSave = async () => {
    updateAllPreferences(local)
    completePreferences()
    await savePreferences()
    navigate('/home/camara')
  }

  const handleSkip = async () => {
    completePreferences()
    await savePreferences()
    navigate('/home/camara')
  }

  const field = (key) => ({
    checked: local[key],
    onChange: (e) => setLocal({ ...local, [key]: e.target.checked }),
  })

  const modeDescriptions = {
    standard:    'Interfaz estándar con todas las funciones',
    educational: 'Enfocado en educación y enseñanza',
    scientific:  'Interfaz especializada para investigadores',
  }

  const modeIcons = {
    standard: <FaGear aria-hidden />,
    educational: <FaBookOpen aria-hidden />,
    scientific: <FaMicroscope aria-hidden />,
  }

  return (
    <div className="preferences-view">
      <header className="pref-header">
        <h1><FaFrog aria-hidden /> Personaliza Anura</h1>
        <p>Configura tus preferencias — puedes cambiarlas en cualquier momento</p>
      </header>

      <div className="preferences-container">

        {/* Tema */}
        <section className="pref-section">
          <h2><FaPalette aria-hidden /> Tema visual</h2>
          <div className="options-grid">
            {['light', 'dark'].map((t) => (
              <label key={t} className="option-card">
                <input
                  type="radio" name="theme" value={t}
                  checked={local.theme === t}
                  onChange={(e) => setLocal({ ...local, theme: e.target.value })}
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
        </section>

        {/* Modo de uso */}
        <section className="pref-section">
          <h2><FaMobileScreenButton aria-hidden /> Modo de uso</h2>
          <div className="options-grid">
            {Object.entries(modeDescriptions).map(([m, desc]) => (
              <label key={m} className="option-card">
                <input
                  type="radio" name="mode" value={m}
                  checked={local.mode === m}
                  onChange={(e) => setLocal({ ...local, mode: e.target.value })}
                />
                <span className="mode-icon">
                  {modeIcons[m]}
                </span>
                <span className="option-label">
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </span>
                <span className="option-description">{desc}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Idioma */}
        <section className="pref-section">
          <h2><FaGlobe aria-hidden /> Idioma</h2>
          <div className="options-grid">
            {[
              { code: 'es', tag: 'ES', label: 'Español' },
              { code: 'en', tag: 'EN', label: 'English' },
              { code: 'fr', tag: 'FR', label: 'Français' },
              { code: 'pt', tag: 'PT', label: 'Português' },
            ].map(({ code, tag, label }) => (
              <label key={code} className="option-card">
                <input
                  type="radio" name="language" value={code}
                  checked={local.language === code}
                  onChange={(e) => setLocal({ ...local, language: e.target.value })}
                />
                <span className="lang-flag">{tag}</span>
                <span className="option-label">{label}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Accesibilidad */}
        <section className="pref-section">
          <h2><FaUniversalAccess aria-hidden /> Accesibilidad</h2>
          <div className="accessibility-checks">
            <label className="checkbox-label">
              <input type="checkbox" {...field('accessibility_mode')} />
              <span>Alto contraste</span>
            </label>
          </div>
        </section>

        {/* Notificaciones */}
        <section className="pref-section">
          <h2><FaBell aria-hidden /> Notificaciones</h2>
          <div className="accessibility-checks">
            <label className="checkbox-label">
              <input type="checkbox" {...field('notifications_enabled')} />
              <span>Notificaciones generales</span>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" {...field('email_notifications')} />
              <span><FaEnvelope aria-hidden /> Notificaciones por email</span>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" {...field('push_notifications')} />
              <span><FaMobileScreenButton aria-hidden /> Notificaciones push</span>
            </label>
          </div>
        </section>

        {/* Privacidad */}
        <section className="pref-section">
          <h2><FaLock aria-hidden /> Privacidad</h2>
          <div className="accessibility-checks">
            <label className="checkbox-label">
              <input type="checkbox" {...field('exact_location_enabled')} />
              <span><FaLocationDot aria-hidden /> Ubicación exacta en observaciones</span>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" {...field('public_profile')} />
              <span><FaUser aria-hidden /> Perfil público</span>
            </label>
          </div>
        </section>

        <div className="pref-actions">
          <button onClick={handleSkip} className="btn-secondary">
            Omitir
          </button>
          <button onClick={handleSave} className="btn-primary">
            <FaCircleCheck aria-hidden /> Guardar preferencias
          </button>
        </div>
      </div>
    </div>
  )
}
