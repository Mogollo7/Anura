import { useEffect, useState } from 'react'

// Glifo de foto neutro (gris de sistema), fondo transparente: el color de
// fondo lo pone .thumb-is-placeholder con --ph-thumb, así respeta el tema.
const PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#8E8E93" d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg>',
)}`

// Igual, pero con un micrófono: una observación solo-audio no tiene "menos"
// que una con foto, así que no debe verse como el mismo marcador de "sin foto".
const AUDIO_PLACEHOLDER = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#8E8E93" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/></svg>',
)}`

/**
 * Miniatura de observación/especie. Sin foto o con error de carga muestra un
 * marcador en vez del icono de imagen rota (antes algunas vistas ocultaban
 * la <img> y dejaban un hueco, otras mostraban el icono roto). `audioOnly`
 * es para observaciones registradas solo con audio: no es un error, así que
 * usa su propio glifo en vez del de "sin foto".
 */
export default function Thumb({ src, alt = '', className = '', audioOnly = false, ...rest }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => { setFailed(false) }, [src])

  const missing = !src || failed
  const showAudio = missing && audioOnly
  return (
    <img
      {...rest}
      src={showAudio ? AUDIO_PLACEHOLDER : missing ? PLACEHOLDER : src}
      alt={missing ? (alt ? `${alt} (${showAudio ? 'solo audio' : 'sin foto'})` : '') : alt}
      loading="lazy"
      className={`${className} ${missing ? 'thumb-is-placeholder' : ''} ${showAudio ? 'thumb-is-audio' : ''}`.trim() || undefined}
      onError={missing ? undefined : () => setFailed(true)}
    />
  )
}
