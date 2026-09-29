import { useState, useEffect } from 'react'
import { MdPerson } from 'react-icons/md'

/**
 * Avatar de usuario con fallback a un icono genérico si no hay imagen o si
 * la imagen falla al cargar. Antes redefinido como "SafeAvatar" en
 * Explorer.jsx y TaxonDetail.jsx.
 */
export default function Avatar({ src, alt, placeholderClassName }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return <span className={placeholderClassName || 'avatar-micro'}><MdPerson aria-hidden /></span>
  }

  return (
    <img
      className={placeholderClassName || 'avatar-micro'}
      src={src}
      alt={alt}
      style={{ objectFit: 'cover' }}
      onError={() => setFailed(true)}
    />
  )
}
