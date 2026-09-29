import './LoadingSpinner.css';

/**
 * AnuraLoader (web) — replica el indicador real de la app móvil
 * (designsystem/component/AnuraLoader.kt): dos puntos que rebotan en
 * vertical, desfasados 200ms, período 1200ms. Respeta prefers-reduced-motion
 * (los puntos pulsan opacidad en vez de moverse).
 */
export default function LoadingSpinner({ text = 'Cargando…', className = '' }) {
  return (
    <div className={`anura-loader-wrapper ${className}`} role="status" aria-live="polite">
      <div className="anura-loader-dots" aria-hidden>
        <span className="anura-loader-dot" />
        <span className="anura-loader-dot" />
      </div>
      {text && <span className="anura-loader-text">{text}</span>}
    </div>
  );
}
