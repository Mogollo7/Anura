import { useRef, useState } from 'react'
import { MdImage } from 'react-icons/md'
import AudioPlayer from './AudioPlayer'
import FallbackImage from './FallbackImage'
import './MediaCarousel.css'

/**
 * Carrusel de medios de una observación — replica ObservationMediaCarousel.kt:
 * un slide por vista (sin "peek"), 12px de espacio entre slides, sin dots;
 * el indicador es una píldora de vidrio "1/3" abajo al centro, solo si hay
 * más de un elemento. object-fit: cover, controla el alto quien lo use.
 *
 * `media`: [{ type?: 'image' | 'audio', src, alt?, durationMs? }]
 * (sin `type`, o `type: 'image'`, se trata como foto)
 */
export default function MediaCarousel({ media = [], height, emptyLabel = 'Sin imágenes aún' }) {
  const trackRef = useRef(null)
  const [index, setIndex] = useState(0)
  const total = media.length

  const handleScroll = () => {
    const el = trackRef.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) setIndex(Math.max(0, Math.min(total - 1, i)))
  }

  if (total === 0) {
    return (
      <div className="a-media a-media-carousel a-media-carousel--empty" style={height ? { height } : undefined}>
        <MdImage aria-hidden className="a-media-carousel-empty-icon" />
        <span className="a-media-carousel-empty-label">{emptyLabel}</span>
      </div>
    )
  }

  return (
    <div className="a-media a-media-carousel" style={height ? { height } : undefined}>
      <div className="a-media-carousel-track" ref={trackRef} onScroll={handleScroll}>
        {media.map((m, i) => (
          <div className="a-media-carousel-slide" key={i}>
            {m.type === 'audio' ? (
              <AudioPlayer
                id={m.id || `audio-${i}`}
                title={m.alt}
                meta="Audio de la observación"
                durationMs={m.durationMs}
                src={m.src}
                variant="carousel"
              />
            ) : (
              <FallbackImage
                src={m.src}
                alt={m.alt || ''}
                label={emptyLabel}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            )}
          </div>
        ))}
      </div>
      {total > 1 && (
        <span className="a-media-carousel-index" aria-live="polite">{index + 1}/{total}</span>
      )}
    </div>
  )
}
