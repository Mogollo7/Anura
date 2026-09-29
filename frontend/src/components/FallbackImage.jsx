import { useState } from 'react'
import { MdImage } from 'react-icons/md'
import './FallbackImage.css'

/**
 * <img> que cae a un ícono de placeholder si la carga falla (404/500 del
 * backend, archivo vacío, etc.) en vez de dejar el ícono roto del navegador
 * con el alt suelto encima — mismo problema que ya se resolvía a mano solo
 * para el avatar en ObservationDetail.jsx, generalizado acá.
 */
export default function FallbackImage({ src, alt = '', className = '', label, icon: Icon = MdImage, onClick, ...imgRest }) {
  const [failedSrc, setFailedSrc] = useState(null)

  if (!src || failedSrc === src) {
    return (
      <div className={`img-fallback ${className}`.trim()} onClick={onClick}>
        <Icon aria-hidden className="img-fallback-icon" />
        {label && <span className="img-fallback-label">{label}</span>}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onClick={onClick}
      onError={() => setFailedSrc(src)}
      {...imgRest}
    />
  )
}
