import { MdOpenInNew } from 'react-icons/md';
import './SourceLink.css';

// Una dirección http(s) dentro del texto de una fuente. Se corta antes de coma, punto y coma, paréntesis o espacio.
const URL_RE = /(https?:\/\/[^\s,;)]+)/gi;

/** "https://www.iucnredlist.org/species/1/2" → "iucnredlist.org/species/1/2" (corto, legible). */
function etiqueta(url) {
  try {
    const u = new URL(url);
    const ruta = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
    return ruta.length > 38 ? `${ruta.slice(0, 37)}…` : ruta;
  } catch {
    return url;
  }
}

/**
 * Texto de una «Fuente»: las direcciones http(s) se vuelven enlaces que abren en otra pestaña y el
 * resto del texto (año, nombre de la base) se deja tal cual. Solo http y https: nada de javascript:.
 */
export default function SourceLink({ text, label = 'Fuente', className = '' }) {
  const t = typeof text === 'string' ? text.trim() : '';
  if (!t) return null;
  const partes = t.split(URL_RE);
  return (
    <span className={`source-link ${className}`.trim()}>
      {label && <span className="source-link-label">{label}</span>}
      <span className="source-link-body">
        {partes.map((p, i) =>
          i % 2 === 1 ? (
            <a key={i} href={p} target="_blank" rel="noopener noreferrer" title={p} className="source-link-anchor">
              {etiqueta(p)} <MdOpenInNew aria-hidden="true" />
            </a>
          ) : (
            p
          )
        )}
      </span>
    </span>
  );
}
