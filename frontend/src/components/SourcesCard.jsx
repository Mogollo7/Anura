import { MdMenuBook } from 'react-icons/md';
import SourceLink from './SourceLink';
import './SourceLink.css';

/** Todas las fuentes de la ficha en un solo bloque: una fila por dato, con su enlace si la fuente es una dirección web. */
export function sourceRowsOf(species) {
  return [
    ['Estado de conservación (UICN)', [species.iucnSource, species.iucnYear].filter(Boolean).join(', ')],
    ['Amenazas', species.threatsSource],
    ['Toxicidad', species.toxicity?.source],
    ['Altitud', species.altitudeRange?.source],
    ['Endemismo', species.endemicSource],
    ['Tamaño (LHC)', species.morphology?.sizeSource],
    ['Dato curioso', species.curiositySource],
  ].filter(([, src]) => typeof src === 'string' && src.trim());
}

export default function SourcesCard({ species }) {
  const rows = sourceRowsOf(species);
  if (!rows.length) return null;
  return (
    <section className="taxon-section card taxon-sources-card">
      <h2 className="taxon-section-title">
        <MdMenuBook /> Fuentes
      </h2>
      <ul className="taxon-sources-list">
        {rows.map(([label, src]) => (
          <li key={label}>
            <strong>{label}</strong>
            <SourceLink text={src} label="" />
          </li>
        ))}
      </ul>
    </section>
  );
}
