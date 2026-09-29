import { useEffect } from 'react'
import { MdClose, MdChevronLeft, MdChevronRight, MdOpenInFull } from 'react-icons/md'
import './PhotoLightbox.css'

/**
 * Visor de fotos a pantalla completa con navegación anterior/siguiente.
 * Réplica web del MediaLightbox.kt de Android — antes, hacer clic en una
 * foto de TaxonPhotoBrowse.jsx sacaba de la página directo al detalle de la
 * observación, sin poder simplemente mirar la imagen en grande.
 */
export default function PhotoLightbox({ images, index, onClose, onIndexChange, onOpenDetail }) {
  const total = images.length
  const current = images[index]

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onIndexChange((index + 1) % total)
      if (e.key === 'ArrowLeft') onIndexChange((index - 1 + total) % total)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [index, total, onClose, onIndexChange])

  if (!current) return null

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="Cerrar">
        <MdClose />
      </button>

      {total > 1 && (
        <button
          type="button"
          className="lightbox-nav lightbox-prev"
          onClick={(e) => { e.stopPropagation(); onIndexChange((index - 1 + total) % total) }}
          aria-label="Foto anterior"
        >
          <MdChevronLeft />
        </button>
      )}

      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img src={current.src} alt={current.alt || ''} className="lightbox-img" />
        <div className="lightbox-footer">
          <span className="lightbox-counter">{index + 1} / {total}</span>
          {onOpenDetail && (
            <button type="button" className="lightbox-detail-link" onClick={() => onOpenDetail(current)}>
              <MdOpenInFull aria-hidden /> Ver observación completa
            </button>
          )}
        </div>
      </div>

      {total > 1 && (
        <button
          type="button"
          className="lightbox-nav lightbox-next"
          onClick={(e) => { e.stopPropagation(); onIndexChange((index + 1) % total) }}
          aria-label="Foto siguiente"
        >
          <MdChevronRight />
        </button>
      )}
    </div>
  )
}
