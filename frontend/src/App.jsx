import { useState, useRef } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function App() {
  const [preview, setPreview]     = useState(null)
  const [result, setResult]       = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [coords, setCoords]       = useState({ lat: '', lon: '' })
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setResult(null)
    setError(null)
  }

  const handlePredict = async () => {
    const file = fileRef.current?.files[0]
    if (!file) return setError('Selecciona una imagen primero')
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', file)
      if (coords.lat) form.append('lat', coords.lat)
      if (coords.lon) form.append('lon', coords.lon)
      const res  = await fetch(`${API_BASE}/api/predict`, { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error en la predicción')
      setResult(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const useGPS = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      ()    => setError('No se pudo obtener ubicación GPS')
    )
  }

  return (
    <main className="app">
      <h1>🐸 Anura</h1>
      <p className="subtitle">Identificación de anfibios colombianos con IA</p>

      <div className="card upload-card">
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} id="img-input" />
        <label htmlFor="img-input" className="btn-upload">
          {preview ? '📷 Cambiar imagen' : '📷 Seleccionar imagen'}
        </label>
        {preview && <img src={preview} alt="preview" className="preview" />}
      </div>

      <div className="card coords-card">
        <h3>📍 Ubicación (opcional)</h3>
        <div className="coords-row">
          <input type="number" placeholder="Latitud"  value={coords.lat} onChange={e => setCoords(c => ({...c, lat: e.target.value}))} />
          <input type="number" placeholder="Longitud" value={coords.lon} onChange={e => setCoords(c => ({...c, lon: e.target.value}))} />
          <button onClick={useGPS} className="btn-gps">GPS 🛰️</button>
        </div>
      </div>

      <button onClick={handlePredict} disabled={loading || !preview} className="btn-predict">
        {loading ? 'Analizando...' : '🔍 Identificar especie'}
      </button>

      {error && <div className="error-box">⚠️ {error}</div>}

      {result && (
        <div className="card result-card">
          <h2>{result.is_frog ? '🐸' : '❌'} {result.best_class.replace(/_/g,' ')}</h2>
          <p className="prob">Confianza: <strong>{(result.best_prob * 100).toFixed(1)}%</strong></p>
          {result.location_used && <p className="loc-tag">📍 Predicción ajustada por ubicación</p>}
          <h3>Top 5</h3>
          <ul className="top5">
            {result.predictions.map((p, i) => (
              <li key={i}>
                <span className="rank">#{i+1}</span>
                <span className="sname">{p.class.replace(/_/g,' ')}</span>
                <span className="sbar">
                  <span className="fill" style={{width: `${(p.probability*100).toFixed(0)}%`}} />
                </span>
                <span className="spct">{(p.probability*100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  )
}