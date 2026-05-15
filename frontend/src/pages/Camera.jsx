import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FaCamera,
  FaCircleCheck,
  FaCircleNotch,
  FaFloppyDisk,
  FaFrog,
  FaLocationCrosshairs,
  FaLocationDot,
  FaMagnifyingGlass,
  FaTriangleExclamation,
  FaXmark,
} from 'react-icons/fa6'
import { usePreferencesStore } from '../store/preferencesStore'
import './Camera.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function Camera() {
  const navigate = useNavigate()
  const { preferences } = usePreferencesStore()

  const [preview, setPreview]         = useState(null)
  const [result, setResult]           = useState(null)
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState(null)
  const [coords, setCoords]           = useState({ lat: '', lon: '' })
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)

  const fileRef  = useRef()
  const videoRef = useRef()

  // Apply theme/mode from preferences on mount and whenever they change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', preferences.theme || 'dark')
    document.documentElement.setAttribute('data-mode',  preferences.mode  || 'standard')
    document.documentElement.setAttribute('data-high-contrast', preferences.accessibility_mode || false)
  }, [preferences.theme, preferences.mode, preferences.accessibility_mode])

  // Set video srcObject when stream is available and video element is ready
  useEffect(() => {
    if (cameraActive && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream
    }
  }, [cameraActive, cameraStream])

  // Cleanup: stop all camera tracks when component unmounts or camera is deactivated
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [cameraStream])

  // ── Image handlers ────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setResult(null)
    setError(null)
  }

  // ── GPS ───────────────────────────────────────────────────────
  const useGPS = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      ()    => setError('No se pudo obtener ubicación GPS')
    )
  }

  // ── Prediction ────────────────────────────────────────────────
  const handlePredict = async () => {
    if (!fileRef.current?.files[0]) return setError('Selecciona o captura una imagen primero')
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const form = new FormData()
      form.append('image', fileRef.current.files[0])
      if (coords.lat) form.append('lat', coords.lat)
      if (coords.lon) form.append('lon', coords.lon)

      const res = await fetch(`${API_BASE}/api/predict`, { method: 'POST', body: form })
      
      // Verificar si la respuesta es HTML (error de servidor/proxy)
      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('text/html')) {
        if (res.status === 413) {
          throw new Error('La imagen es demasiado pesada para el servidor. Intenta con una más pequeña.')
        }
        throw new Error(`Error del servidor (${res.status}). El servicio de IA podría estar reiniciándose.`)
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error en la predicción')
      setResult(data)
      if (data?.is_frog === false) {
        setError('La imagen no parece contener una rana o sapo. Anura solo permite guardar observaciones de anuros.')
      }
    } catch (e) {
      console.error('Predict error:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Save Observation ──────────────────────────────────────────
  const handleSaveObservation = async () => {
    if (!fileRef.current?.files[0] || !result) {
      return setError('Se requiere una predicción antes de guardar')
    }

    // Bloqueo duro: solo se permiten observaciones de anuros
    if (result.is_frog === false) {
      return setError('No se puede guardar esta observación: la IA no detectó una rana o sapo en la imagen.')
    }

    // Bloqueo para invitados: Redirigir a stash (temporalizar en Redis)
    if (preferences.isGuest) {
      const file = fileRef.current?.files[0]
      if (!file) return setError('No hay imagen para guardar')

      setLoading(true)
      try {
        const form = new FormData()
        form.append('image', file)
        form.append('lat', coords.lat)
        form.append('lon', coords.lon)
        form.append('notes', '') // Guests usually don't have a notes field yet, but we send it empty
        form.append('ai_top_class', result.best_class)
        form.append('ai_top_prob', result.best_prob)
        form.append('ai_location_used', result.location_used)

        const res = await fetch(`${API_BASE}/api/observations/stash`, {
          method: 'POST',
          body: form
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || 'Error al temporalizar')

        // Guardar stash_id y redirigir
        localStorage.setItem('anura_pending_stash', data.stash_id)
        navigate('/login', { state: { message: 'Inicia sesión para completar tu observación' } })
        return
      } catch (err) {
        setLoading(false)
        return setError('Error al guardar temporalmente: ' + err.message)
      }
    }

    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', fileRef.current.files[0])
      if (coords.lat) form.append('lat', coords.lat)
      if (coords.lon) form.append('lon', coords.lon)
      form.append('notes', '')
      form.append('ai_top_class', result.best_class)
      form.append('ai_top_prob', result.best_prob)
      form.append('ai_location_used', result.location_used)

      const token = localStorage.getItem('anura_token')
      const res = await fetch(`${API_BASE}/api/observations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Error al guardar observación')
      alert('Observación guardada correctamente')
      navigate('/explorer')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="camera-view">

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="camera-header">
        <div className="container header-brand">
          <h1>Cámara</h1>
          <p className="subtitle">Identificación de anfibios colombianos con IA</p>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      <div className="container camera-container">
        <div className="camera-grid">
          
          {/* Column 1: Image Upload */}
          <div className="camera-col-left">
            <div className="card upload-card">
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} id="img-input" />
              <label htmlFor="img-input" className="btn-upload">
                <FaCamera aria-hidden /> {preview ? 'Cambiar imagen' : 'Seleccionar imagen'}
              </label>
              {preview && <img src={preview} alt="Vista previa" className="preview" />}
            </div>
          </div>

          {/* Column 2: Controls and Results */}
          <div className="camera-col-right">
            {/* GPS coords */}
            <div className="card coords-card">
              <h3><FaLocationDot aria-hidden /> Ubicación opcional</h3>
              <div className="coords-row">
                <input
                  type="number" placeholder="Latitud"  step="0.00001"
                  value={coords.lat} onChange={e => setCoords(c => ({ ...c, lat: e.target.value }))}
                />
                <input
                  type="number" placeholder="Longitud" step="0.00001"
                  value={coords.lon} onChange={e => setCoords(c => ({ ...c, lon: e.target.value }))}
                />
                <button onClick={useGPS} className="btn-gps"><FaLocationCrosshairs aria-hidden /> GPS</button>
              </div>
            </div>

            <div className="action-buttons" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button onClick={handlePredict} disabled={loading || !preview} className="btn-predict" style={{ flex: 1 }}>
                {loading && !result ? <><FaCircleNotch aria-hidden /> Analizando...</> : <><FaMagnifyingGlass aria-hidden /> Identificar especie</>}
              </button>
              
              {result && (
                <button
                  onClick={handleSaveObservation}
                  disabled={loading || result.is_frog === false}
                  className="btn-primary"
                  style={{ flex: 1 }}
                  title={preferences.isGuest ? 'Inicia sesión para completar el guardado' : ''}
                >
                  {loading ? <><FaCircleNotch aria-hidden /> Guardando...</> : <><FaFloppyDisk aria-hidden /> Guardar observación</>}
                </button>
              )}
            </div>

            {/* Error */}
            {error && <div className="error-box"><FaTriangleExclamation aria-hidden /> {error}</div>}

            {/* Results */}
            {result && (
              <div className="card result-card">
                <h2>
                  {result.is_frog ? <FaFrog aria-hidden /> : <FaXmark aria-hidden />}{' '}
                  {result.best_class.replace(/_/g, ' ')}
                </h2>
                <p className="prob">
                  Confianza: <strong>{(result.best_prob * 100).toFixed(1)}%</strong>
                </p>
                {result.location_used && (
                  <p className="loc-tag"><FaCircleCheck aria-hidden /> Predicción ajustada por ubicación</p>
                )}
                <h3>Top 5 Predicciones</h3>
                <ul className="top5">
                  {result.predictions.map((p, i) => (
                    <li key={i}>
                      <span className="rank">#{i + 1}</span>
                      <span className="sname">{p.class.replace(/_/g, ' ')}</span>
                      <span className="sbar">
                        <span className="fill" style={{ width: `${(p.probability * 100).toFixed(0)}%` }} />
                      </span>
                      <span className="spct">{(p.probability * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
