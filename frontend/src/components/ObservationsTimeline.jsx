import { useMemo } from 'react';
import { MdShowChart } from 'react-icons/md';
import './ObservationsTimeline.css';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MAX_MESES = 24;

const fechaDe = (o) => {
  const d = new Date(o.observed_on || o.observed_at || o.created_at);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Observaciones de la especie en el tiempo: una barra por mes (hasta los últimos 24, sin recortar
 * los meses vacíos del medio) y tres cifras. Sale solo de las observaciones que ya cargó la página.
 */
export default function ObservationsTimeline({ observations }) {
  const datos = useMemo(() => {
    const fechas = observations.map(fechaDe).filter(Boolean);
    if (!fechas.length) return null;
    const conteo = new Map();
    for (const f of fechas) {
      const k = f.getFullYear() * 12 + f.getMonth();
      conteo.set(k, (conteo.get(k) || 0) + 1);
    }
    const claves = [...conteo.keys()];
    const fin = Math.max(...claves);
    const inicio = Math.max(Math.min(...claves), fin - (MAX_MESES - 1));
    const barras = [];
    for (let k = inicio; k <= fin; k += 1) barras.push({ k, anio: Math.floor(k / 12), mes: k % 12, n: conteo.get(k) || 0 });
    const mayor = barras.reduce((a, b) => (b.n > a.n ? b : a), barras[0]);
    fechas.sort((a, b) => a - b);
    return { barras, mayor, total: fechas.length, primera: fechas[0], ultima: fechas[fechas.length - 1] };
  }, [observations]);

  return (
    <section className="taxon-section card taxon-timeline-card">
      <h2 className="taxon-section-title">
        <MdShowChart /> Observaciones en el tiempo
      </h2>
      {!datos ? (
        <p className="taxon-what-is">Todavía no hay observaciones con fecha de esta especie.</p>
      ) : (
        <>
          <div className="timeline-stats">
            <div><span>Total</span><strong>{datos.total}</strong></div>
            <div><span>Primera</span><strong>{datos.primera.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' })}</strong></div>
            <div><span>Más reciente</span><strong>{datos.ultima.toLocaleDateString('es-CO', { month: 'short', year: 'numeric' })}</strong></div>
          </div>
          <Barras barras={datos.barras} />
          <p className="timeline-note">
            Mes con más registros: {MESES[datos.mayor.mes]} {datos.mayor.anio} ({datos.mayor.n}).
          </p>
        </>
      )}
    </section>
  );
}

function Barras({ barras }) {
  const W = 360;
  const H = 120;
  const base = H - 18;
  const max = Math.max(...barras.map((b) => b.n), 1);
  const paso = W / barras.length;
  const ancho = Math.max(2, paso - 3);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" role="img" aria-label={`Observaciones por mes, de ${MESES[barras[0].mes]} ${barras[0].anio} a ${MESES[barras[barras.length - 1].mes]} ${barras[barras.length - 1].anio}`}>
      <line x1="0" y1={base} x2={W} y2={base} className="timeline-axis" />
      {barras.map((b, i) => {
        const h = b.n ? Math.max(3, (b.n / max) * (base - 8)) : 0;
        return (
          <g key={b.k}>
            <rect x={i * paso + 1.5} y={base - h} width={ancho} height={h} rx="2" className="timeline-bar">
              <title>{`${MESES[b.mes]} ${b.anio}: ${b.n}`}</title>
            </rect>
            {(i === 0 || b.mes === 0 || i === barras.length - 1) && (
              <text x={i * paso + paso / 2} y={H - 4} textAnchor="middle" className="timeline-label">
                {b.mes === 0 || i === 0 ? `${MESES[b.mes]} ${String(b.anio).slice(2)}` : MESES[b.mes]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
