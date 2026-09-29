import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MdCircle, MdLocationOn, MdSearch,
  MdGridView, MdFormatListBulleted, MdWarning, MdPerson,
  MdCalendarToday, MdPublic, MdLock, MdMoreVert, MdClose,
} from 'react-icons/md';
import { GiFrogFoot } from 'react-icons/gi';
import './People.css';
import './PeopleObservations.css';
import { obsIdKey, currentUserIdFromToken } from '../lib/observationIds';
import LoadingSpinner from '../components/LoadingSpinner';
import GuestLoginModal from '../components/GuestLoginModal';
import ConfirmDialog from '../components/ConfirmDialog';
import FavoriteHeartButton from '../components/FavoriteHeartButton';
import { apiGet, apiPost, apiPut, apiDelete, getThumbUrl } from '../services/api';
import { mediaUrl, isAudioOnly } from '../lib/format';
import Thumb from '../components/Thumb';

const getImageUrl = (key, size = 'medium') => {
  if (!key) return '';
  const filename = key.split('/').pop();
  return getThumbUrl(filename, size);
};

export default function PeopleObservations() {
  const { username } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [observations, setObservations] = useState([]);
  const [obsLoading, setObsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subview, setSubview] = useState('grid'); // 'grid' | 'list'
  const [privacyFilter, setPrivacyFilter] = useState('all'); // 'all' | 'public' | 'private'

  // Auth state (read from localStorage)
  const token = localStorage.getItem('anura_token');
  const isLoggedIn = !!token && token !== 'null' && token !== 'undefined';
  const isOwnProfile = isLoggedIn && profile?.user?.id != null && currentUserIdFromToken() === String(profile.user.id);

  // Liked set
  const [likedIds, setLikedIds] = useState(new Set());
  const [likeLoading, setLikeLoading] = useState(new Set());

  // Guest login modal
  const [guestModal, setGuestModal] = useState(false);
  const [pendingLikeId, setPendingLikeId] = useState(null);

  // Edición/eliminación — solo disponible cuando isOwnProfile (antes vivía
  // aparte, en Profile.jsx, sin el header/stats reales del perfil).
  const [actionMenuOpen, setActionMenuOpen] = useState(null);
  const [editObservation, setEditObservation] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [editLat, setEditLat] = useState('');
  const [editLon, setEditLon] = useState('');
  const [editPrivate, setEditPrivate] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, [username]);

  useEffect(() => {
    fetchObservations();
  }, [username]);

  useEffect(() => {
    if (isLoggedIn) fetchLikedIds();
  }, [isLoggedIn]);

  const fetchProfile = async () => {
    try {
      const data = await apiGet(`/api/auth/public/${username}`, { auth: false });
      setProfile(data);
      setAvatarLoadError(false);
    } catch (err) {
      setProfileError(err.body?.message || 'No se pudo cargar el perfil');
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchObservations = async () => {
    setObsLoading(true);
    try {
      const data = await apiGet(`/api/explorer/feed?username=${encodeURIComponent(username)}`, { auth: !!token });
      setObservations(data);
    } catch (e) { console.error(e); }
    finally { setObsLoading(false); }
  };

  const fetchLikedIds = async () => {
    try {
      const raw = await apiGet('/api/explorer/favorites');
      setLikedIds(new Set(Array.isArray(raw) ? raw.map(obsIdKey) : []));
    } catch (err) {
      if (err.status === 401) localStorage.removeItem('anura_token');
    }
  };

  const handleHeart = async (e, obsId) => {
    e.stopPropagation();
    if (!isLoggedIn) {
      // Save pending info and show modal
      localStorage.setItem('anura_pending_favorite', obsIdKey(obsId));
      localStorage.setItem('anura_pending_url', window.location.pathname);
      setPendingLikeId(obsId);
      setGuestModal(true);
      return;
    }
    const oid = obsIdKey(obsId);
    setLikeLoading(prev => new Set(prev).add(oid));
    try {
      const { liked } = await apiPost(`/api/explorer/favorites/${encodeURIComponent(oid)}`, {});
      setLikedIds(prev => {
        const next = new Set(prev);
        liked ? next.add(oid) : next.delete(oid);
        return next;
      });
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
    if (isOwnProfile && privacyFilter === 'public' && obs.is_private) return false;
    if (isOwnProfile && privacyFilter === 'private' && !obs.is_private) return false;
    const q = search.toLowerCase();
    return !q ||
      (obs.common_name || '').toLowerCase().includes(q) ||
      (obs.ai_class || '').toLowerCase().includes(q) ||
      (obs.place_guess || '').toLowerCase().includes(q);
  });

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
      const data = await apiPut(`/api/observations/${editObservation.id}`, {
        notes: editNotes,
        lat: editLat !== '' ? editLat : null,
        lon: editLon !== '' ? editLon : null,
        is_private: editPrivate,
      });
      setObservations((prev) => prev.map((item) => item.id === editObservation.id ? { ...item, ...data.observation } : item));
      setEditObservation(null);
      setActionMenuOpen(null);
    } catch (err) {
      setEditError(err.body?.message || err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteObservation = (e, obsId) => {
    e.stopPropagation();
    setDeleteError(null);
    setPendingDeleteId(obsId);
  };

  const confirmDeleteObservation = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiDelete(`/api/observations/${pendingDeleteId}`);
      setObservations((prev) => prev.filter((obs) => obs.id !== pendingDeleteId));
      setPendingDeleteId(null);
    } catch (err) {
      setDeleteError(err.message || 'No se pudo eliminar. Inténtalo de nuevo.');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (profileLoading) return <LoadingSpinner text={`Cargando perfil de ${username}…`} />;
  if (profileError) return (
    <div className="people-error">
      <p><MdWarning aria-hidden /> {profileError}</p>
      <button onClick={() => navigate('/inicio')} className="btn-back">Volver al inicio</button>
    </div>
  );

  const { user, stats } = profile;

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : 'sin actividad');

  // Observation card shared between grid/list
  const HeartBtn = ({ obs }) => {
    const oid = obsIdKey(obs.id);
    const liked = likedIds.has(oid);
    return (
      <FavoriteHeartButton
        liked={liked}
        disabled={likeLoading.has(oid)}
        onClick={e => handleHeart(e, oid)}
        title={liked ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      />
    );
  };

  // Editar/eliminar — solo en el propio perfil, en vez del corazón de favoritos
  const ActionMenuBtn = ({ obs }) => (
    <div className="obs-actions-wrapper" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="btn-action-obs" onClick={() => setActionMenuOpen((prev) => (prev === obs.id ? null : obs.id))} title="Acciones">
        <MdMoreVert aria-hidden />
      </button>
      {actionMenuOpen === obs.id && (
        <div className="obs-action-menu">
          <button type="button" onClick={() => startEditObservation(obs)}>Editar</button>
          <button type="button" className="danger" onClick={(e) => { handleDeleteObservation(e, obs.id); setActionMenuOpen(null); }}>Eliminar</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="people-view theme-aware">

      {/* Guest modal */}
      {guestModal && <GuestLoginModal onClose={() => setGuestModal(false)} />}

      {/* Header */}
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
                <span>Unido: {fmtDate(stats.joined)}</span>
                <span className="separator"><MdCircle aria-hidden /></span>
                <span>Última actividad: {fmtDate(stats.last_activity)}</span>
                <span className="separator"><MdCircle aria-hidden /></span>
                <span>{stats.observations} observaciones</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="people-nav">
        <div className="container">
          <ul>
            <li onClick={() => navigate(`/people/${username}`)}>Perfil</li>
            <li className="active">Observaciones</li>
            <li onClick={() => navigate(`/people/${username}/favoritos`)}>Favoritos</li>
          </ul>
        </div>
      </nav>


      {/* Controls */}
      <div className="po-controls container">
        <div className="po-search-wrap">
          <MdSearch aria-hidden className="po-search-icon" />
          <input
            type="text" className="po-search-input"
            placeholder="Buscar especie o lugar…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="po-switcher">
          <button className={subview === 'grid' ? 'po-sw-btn active' : 'po-sw-btn'} onClick={() => setSubview('grid')} title="Cuadrícula">
            <MdGridView aria-hidden />
          </button>
          <button className={subview === 'list' ? 'po-sw-btn active' : 'po-sw-btn'} onClick={() => setSubview('list')} title="Lista">
            <MdFormatListBulleted aria-hidden />
          </button>
        </div>
      </div>

      {/* Filtro de privacidad — solo en el propio perfil */}
      {isOwnProfile && (
        <div className="obs-privacy-filters container">
          <button type="button" className={`filter-btn ${privacyFilter === 'all' ? 'active' : ''}`} onClick={() => setPrivacyFilter('all')}>
            Todas ({observations.length})
          </button>
          <button type="button" className={`filter-btn ${privacyFilter === 'public' ? 'active' : ''}`} onClick={() => setPrivacyFilter('public')}>
            <MdPublic aria-hidden /> Públicas ({observations.filter(o => !o.is_private).length})
          </button>
          <button type="button" className={`filter-btn ${privacyFilter === 'private' ? 'active' : ''}`} onClick={() => setPrivacyFilter('private')}>
            <MdLock aria-hidden /> Privadas ({observations.filter(o => o.is_private).length})
          </button>
        </div>
      )}

      {editObservation && (
        <div className="obs-edit-modal-backdrop" role="dialog" aria-modal="true">
          <div className="obs-edit-modal">
            <div className="obs-edit-header">
              <h3>Editar observación</h3>
              <button type="button" className="close-modal" onClick={closeEditModal} aria-label="Cerrar">
                <MdClose />
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
              {editError && <div className="error-box"><MdWarning aria-hidden /> {editError}</div>}
              <div className="obs-edit-actions">
                <button type="button" className="btn-secondary" onClick={closeEditModal}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={editLoading}>{editLoading ? 'Guardando…' : 'Guardar cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="po-content container">
        {obsLoading ? (
          <LoadingSpinner text="Cargando observaciones…" />
        ) : filtered.length === 0 ? (
          <div className="po-empty">
            <GiFrogFoot aria-hidden className="po-empty-icon" />
            <p>{search ? `Sin resultados para "${search}"` : `${username} aún no tiene observaciones.`}</p>
          </div>
        ) : subview === 'grid' ? (

          <div className="po-grid">
            {filtered.map(obs => (
              <div key={obs.id} className="po-card" onClick={() => navigate(`/explorer/${obs.id}`)}>
                <div className="po-card-img">
                  <Thumb src={getImageUrl(obs.thumbnail_key, 'medium')} alt={obs.common_name || 'Observación'} audioOnly={isAudioOnly(obs)} />
                  {obs.quality_grade === 'research' && <span className="po-badge">Verificada</span>}
                  {isOwnProfile ? <ActionMenuBtn obs={obs} /> : <HeartBtn obs={obs} />}
                </div>
                <div className="po-card-body">
                  <strong className="po-common">{obs.common_name || 'Sin identificar'}</strong>
                  <small className="po-sci">{obs.ai_class?.replace(/_/g, ' ') || ''}</small>
                  <span className="po-date"><MdCalendarToday aria-hidden /> {fmtDate(obs.recorded_at || obs.created_at)}</span>
                  {obs.place_guess && <span className="po-place"><MdLocationOn aria-hidden /> {obs.place_guess}</span>}
                  {isOwnProfile && (
                    <span className={`privacy-badge ${obs.is_private ? 'private' : 'public'}`}>
                      {obs.is_private ? <MdLock aria-hidden /> : <MdPublic aria-hidden />} {obs.is_private ? 'Privada' : 'Pública'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

        ) : (

          <div className="po-list">
            {filtered.map(obs => (
              <div key={obs.id} className="po-list-item" onClick={() => navigate(`/explorer/${obs.id}`)}>
                <div className="po-list-thumb">
                  <Thumb src={getImageUrl(obs.thumbnail_key, 'small')} alt={obs.common_name || 'Observación'} audioOnly={isAudioOnly(obs)} />
                </div>
                <div className="po-list-info">
                  <strong>{obs.common_name || 'Sin identificar'}</strong>
                  <small className="po-sci">{obs.ai_class?.replace(/_/g, ' ') || ''}</small>
                  <div className="po-list-meta">
                    <span><MdCalendarToday aria-hidden /> {fmtDate(obs.recorded_at || obs.created_at)}</span>
                    {obs.place_guess && <span><MdLocationOn aria-hidden /> {obs.place_guess}</span>}
                    {isOwnProfile && (
                      <span className={`privacy-badge ${obs.is_private ? 'private' : 'public'}`}>
                        {obs.is_private ? <MdLock aria-hidden /> : <MdPublic aria-hidden />} {obs.is_private ? 'Privada' : 'Pública'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="po-list-end">
                  {isOwnProfile ? <ActionMenuBtn obs={obs} /> : <HeartBtn obs={obs} />}
                </div>
              </div>
            ))}
          </div>

        )}
      </div>

      {pendingDeleteId && (
        <ConfirmDialog
          title="¿Eliminar esta observación?"
          message={deleteError || 'Esta acción no se puede deshacer.'}
          confirmLabel={deleteError ? 'Reintentar' : 'Eliminar'}
          busy={deleteBusy}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={confirmDeleteObservation}
        />
      )}
    </div>
  );
}
