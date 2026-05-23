import './LoadingSpinner.css';

/**
 * Reusable loading spinner component.
 * Centers itself in the available space while data loads.
 * @param {string} text - Optional label below the spinner.
 * @param {string} className - Extra class for the wrapper (e.g. to override min-height).
 */
export default function LoadingSpinner({ text = 'Cargando...', className = '' }) {
  return (
    <div className={`loading-spinner-wrapper ${className}`} role="status" aria-live="polite">
      <div className="loading-spinner-ring" aria-hidden />
      {text && <span className="loading-spinner-text">{text}</span>}
    </div>
  );
}
