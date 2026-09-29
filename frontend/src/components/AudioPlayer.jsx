import { useEffect, useMemo, useRef, useState } from 'react'
import { MdPlayArrow, MdStop } from 'react-icons/md'
import './AudioPlayer.css'

const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`
}

// Alturas de las barras del "waveform" — deterministas por id, para que no
// cambien en cada re-render ni sean todas iguales.
function barsFor(seed, count = 28) {
  let x = 0
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0
  const bars = []
  for (let i = 0; i < count; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    bars.push(0.25 + (x % 100) / 100 * 0.75)
  }
  return bars
}

/**
 * Reproductor de audio. Con `src` (audio realmente grabado/subido) reproduce
 * el archivo real, como CaptureAudioPlayer.kt. Sin `src` (canto de
 * referencia de una especie, o un mock de demo) el progreso es un
 * temporizador simulado — mismo estado que ObservationMediaCarousel.kt /
 * SpeciesAudioRow en la app hoy, que tampoco tienen un archivo real detrás;
 * eso es una limitación conocida de la app, no algo que el web deba fingir
 * resolver por su cuenta.
 */
export default function AudioPlayer({ id, title, meta, durationMs = 14000, src, variant = 'row' }) {
  const [playing, setPlaying] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const audioElRef = useRef(null)
  const rafRef = useRef(null)
  const startRef = useRef(0)
  const bars = useMemo(() => barsFor(id || title || 'a'), [id, title])

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current.currentTime = 0
    }
    setPlaying(false)
    setElapsedMs(0)
  }

  useEffect(() => () => stop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const tick = () => {
    const t = performance.now() - startRef.current
    if (t >= durationMs) { stop(); return }
    setElapsedMs(t)
    rafRef.current = requestAnimationFrame(tick)
  }

  const play = () => {
    if (src && audioElRef.current) {
      audioElRef.current.currentTime = 0
      audioElRef.current.play().catch(() => {})
    }
    startRef.current = performance.now()
    setPlaying(true)
    rafRef.current = requestAnimationFrame(tick)
  }

  const toggle = () => (playing ? stop() : play())
  const progress = durationMs ? Math.min(1, elapsedMs / durationMs) : 0
  const activeBars = Math.round(progress * bars.length)

  return (
    <div className={`audio-player audio-player--${variant} ${playing ? 'is-playing' : ''}`}>
      {src && <audio ref={audioElRef} src={src} preload="none" onEnded={stop} />}
      <button
        type="button"
        className="audio-player-btn"
        onClick={toggle}
        aria-label={playing ? `Detener ${title || 'audio'}` : `Reproducir ${title || 'audio'}`}
      >
        {playing ? <MdStop aria-hidden /> : <MdPlayArrow aria-hidden />}
      </button>
      <div className="audio-player-body">
        {(title || meta) && (
          <div className="audio-player-labels">
            {title && <strong>{title}</strong>}
            {meta && <small>{meta}</small>}
          </div>
        )}
        <div className="audio-player-wave" aria-hidden>
          {bars.map((h, i) => (
            <span
              key={i}
              className={i < activeBars ? 'is-past' : undefined}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
        </div>
        <span className="audio-player-time">{fmt(elapsedMs)} / {fmt(durationMs)}</span>
      </div>
    </div>
  )
}
