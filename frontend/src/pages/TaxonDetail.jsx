import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MdArrowBack, MdArrowForward, MdLocationOn, MdCalendarToday, MdWarning, MdShield, MdTerrain, MdScience, MdEco, MdWaterDrop, MdMenuBook, MdStar, MdMap, MdLocalFireDepartment, MdLandscape, MdPublic, MdGraphicEq } from 'react-icons/md';
import { GiFrogFoot } from 'react-icons/gi';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './TaxonDetail.css';
import LoadingSpinner from '../components/LoadingSpinner';
import BackButton from '../components/BackButton';
import FallbackImage from '../components/FallbackImage';
import SourcesCard from '../components/SourcesCard';
import ObservationsTimeline from '../components/ObservationsTimeline';
import '../components/ObservationsTimeline.css';
import { HeatmapLayer, GridDensityLayer } from '../maps/SpeciesDistributionLayers';
import { usePublishedSpecies, publishedToSpecies } from '../species/publishedCatalog';
import { apiGet, getThumbUrl } from '../services/api';
import { normalizeKey } from '../lib/format';

/* Clases .a-badge--{code} reales del design system (anura-hig.css) — mismas
   que usa AnuraConservationChip en la app móvil, no colores inventados. */
const IUCN_COLORS = {
  LC: { badgeClass: 'a-badge--lc', label: 'Preocupación menor' },
  NT: { badgeClass: 'a-badge--nt', label: 'Casi amenazada' },
  VU: { badgeClass: 'a-badge--vu', label: 'Vulnerable' },
  EN: { badgeClass: 'a-badge--en', label: 'En peligro' },
  CR: { badgeClass: 'a-badge--cr', label: 'En peligro crítico' },
  EW: { badgeClass: 'a-badge--dd', label: 'Extinta en estado silvestre' },
  EX: { badgeClass: 'a-badge--dd', label: 'Extinta' },
  DD: { badgeClass: 'a-badge--dd', label: 'Datos insuficientes' },
};

export default function TaxonDetail() {
  const { taxonIdSlug } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [observations, setObservations] = useState([]);
  const [error, setError] = useState(null);
  
  const [mapData, setMapData] = useState([]);
  const [mapMode, setMapMode] = useState('geographic'); // 'geographic', 'heatmap', 'altitudinal', 'niche'


  const idPart = taxonIdSlug.split('-')[0];
  const slugPart = taxonIdSlug.split('-').slice(1).join(' ');

  // Try to match species data
  const speciesKey = normalizeKey(slugPart);
  // Ficha publicada en Admin → Contenido: si existe, manda ella sola (ver publishedCatalog.js).
  const { entry: publishedEntry, ready: publishedReady } = usePublishedSpecies(slugPart);
  // Sin ficha publicada no se completa nada a mano: solo el nombre que trae la URL.
  const species = publishedEntry ? publishedToSpecies(publishedEntry) : {
    published: false,
    scientificName: slugPart,
    commonName: slugPart,
    genus: slugPart.split(' ')[0] || null,
    speciesEpithet: slugPart.split(' ').slice(1).join(' ') || null,
  };

  // Un campo vacío no se muestra: ni "-" ni texto de relleno.
  const has = (v) => v != null && v !== '' && v !== '-';
  const iucnInfo = has(species.iucn)
    ? IUCN_COLORS[species.iucn] || { badgeClass: 'a-badge--dd', label: species.iucn }
    : null;
  const threats = species.threats ?? [];
  const synonyms = species.synonyms ?? [];
  const diagnostics = species.morphology?.diagnostics ?? [];
  const taxRows = [
    ['Clase', species.className],
    ['Orden', species.orderName],
    ['Familia', species.family],
    ['Género', species.genus, true],
    ['Especie', species.speciesEpithet, true],
    ['Autor / año', species.author],
  ].filter(([, v]) => has(v));
  const morphItems = [
    ['Tamaño', species.morphology?.size],
    ['Coloración dorsal', species.morphology?.dorsal],
    ['Coloración ventral', species.morphology?.ventral],
    ['Tímpano', species.morphology?.tympanum],
    ['Discos', species.morphology?.discs],
    ['Pliegues', species.morphology?.folds],
    ['Membranas', species.morphology?.webbing],
  ].filter(([, v]) => has(v));
  const ecoItems = [
    ['Microhábitat', species.habitat],
    ['Dieta', species.diet],
    ['Actividad', species.activity],
    ['Distribución', species.distribution],
  ].filter(([, v]) => has(v));

  useEffect(() => {
    // `ignore` evita que una llamada obsoleta (StrictMode la dispara dos
    // veces, o el usuario navega a otro taxón antes de que responda) pise el
    // estado de una llamada más reciente; el AbortController corta la
    // petición en sí para que no se quede colgada sin resolver `loading`.
    let ignore = false;
    const controller = new AbortController();

    const fetchMapData = async () => {
      try {
        const g = species.genus?.toLowerCase() || '';
        const e = species.speciesEpithet?.toLowerCase() || '';
        if (!g || !e || g === '-' || e === '-') return;

        const res = await fetch(`/data/distribution/${g}_${e}.json`, { signal: controller.signal });
        if (!res.ok) return;
        // El dev server de Vite responde 200 + index.html (SPA fallback)
        // para rutas /data/ inexistentes; sin este chequeo, res.json()
        // lanza "Unexpected token '<'" al intentar parsear HTML.
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return;
        const data = await res.json();
        if (ignore) return;
        setMapData(data);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching map data:', err);
      }
    };

    const fetchTaxonObservations = async () => {
      setLoading(true);
      try {
        const data = await apiGet('/api/explorer/feed', { auth: false, signal: controller.signal });
        if (ignore) return;
        const filtered = data.filter(obs => {
          const k = normalizeKey(obs.ai_class || obs.common_name || '');
          // Sin nombre no hay coincidencia posible ('' está contenido en todo).
          if (!k) return false;
          return k === speciesKey || k.includes(speciesKey) || speciesKey.includes(k);
        });
        setObservations(filtered);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Error fetching taxon observations:', err);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    fetchTaxonObservations();
    fetchMapData();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [taxonIdSlug]);

  const getImageUrl = (key, size = 'medium') => {
    if (!key) return '';
    const filename = String(key).split('/').pop();
    return getThumbUrl(filename, size);
  };

  // OJO: no usar mediaUrl(image_key) acá — arma /uploads/<archivo>.webp, una ruta que
  // nginx nunca tiene mapeada (cae al fallback de la SPA). El archivo real vive en MinIO
  // y solo es alcanzable a través de /api/explorer/thumbnail/original/:filename.
  const getFullImageUrl = (key) => getImageUrl(key, 'original');

  // Gallery: up to 6 images (5 visible + 1 "more" overlay)
  const combinedPoints = [
    ...mapData,
    ...observations
      .filter(obs => obs.lat && obs.lon)
      .map(obs => ({
        ...obs,
        decimalLatitude: Number(obs.lat),
        decimalLongitude: Number(obs.lon),
        isUserSubmitted: true
      }))
  ];

  const galleryObs = observations.slice(0, 6);
  const heroObs = galleryObs[0] || null;
  const thumbObs = galleryObs.slice(1, 6);
  const hasMore = observations.length > 6;
  const browseUrl = `/taxa/${taxonIdSlug}/fotos`;

  if (loading && observations.length === 0)
    return <LoadingSpinner text={`Cargando datos de ${species.commonName}...`} />;

  if (error)
    return (
      <div className="taxon-error">
        <MdWarning />
        <p>{error}</p>
        <button className="btn-back" onClick={() => navigate(-1)}>
          <MdArrowBack /> Volver
        </button>
      </div>
    );

  return (
    <div className="taxon-detail-view theme-aware">

      {/* ── Back nav + Titles ── */}
      <header className="taxon-header container">
        <BackButton noWrapper className="taxon-back-btn" />
        <div className="taxon-header-titles">
          <h1 className="taxon-header-common">{species.commonName}</h1>
          <span className="taxon-header-sci">({species.scientificName})</span>
        </div>
      </header>

      {/* ══════════════════════════════════════════
          HERO + GALLERY
      ══════════════════════════════════════════ */}
      <section className="taxon-gallery-section container">
        <div className="taxon-gallery-grid">
          {/* Left: Gallery Stack */}
          <div className="taxon-gallery-stack">
            {/* Hero image */}
            <div className="taxon-hero-slot">
              {heroObs ? (
                <FallbackImage
                  src={getFullImageUrl(heroObs.image_key)}
                  alt={species.commonName}
                  className="taxon-hero-img taxon-hero-fallback"
                  label="Sin imágenes aún"
                  onClick={() => navigate(`/explorer/${heroObs.id}`)}
                />
              ) : species.photo ? (
                <figure className="taxon-hero-figure">
                  <img src={species.photo.url} alt={species.commonName} className="taxon-hero-img" />
                  {species.photo.attribution && (
                    <figcaption className="taxon-hero-credit">Foto: {species.photo.attribution}</figcaption>
                  )}
                </figure>
              ) : (
                <div className="taxon-hero-placeholder">
                  <GiFrogFoot />
                  <span>Sin imágenes aún</span>
                </div>
              )}
            </div>

            {/* 5 thumbnails + 6th "see all" tile */}
            <div className="taxon-thumbs-grid">
              {thumbObs.map((obs, i) => (
                <div
                  key={obs.id}
                  className="taxon-thumb-slot"
                  onClick={() => navigate(`/explorer/${obs.id}`)}
                >
                  <FallbackImage
                    src={getImageUrl(obs.thumbnail_key, 'medium')}
                    alt={obs.common_name || species.commonName}
                    className="taxon-thumb-img"
                  />
                </div>
              ))}

              {/* 6th slot: "See all" CTA (always show tile so arrow remains visible on all viewports) */}
              <div
                className="taxon-thumb-slot taxon-thumb-more"
                onClick={() => navigate(browseUrl)}
              >
                {galleryObs[5] && (
                  <FallbackImage
                    src={getImageUrl(galleryObs[5].thumbnail_key, 'medium')}
                    alt="más"
                    className="taxon-thumb-img taxon-thumb-bg"
                  />
                )}
                <div className="taxon-thumb-more-overlay">
                  <MdArrowForward className="taxon-more-icon" />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Description / What is card + observaciones en el tiempo */}
          <div className="taxon-gallery-side-col">
          {!species.published && publishedReady && (
          <div className="taxon-gallery-side-card">
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <MdMenuBook /> Ficha en preparación
              </h2>
              <p className="taxon-what-is">
                Esta especie todavía no tiene ficha publicada. Aquí verás su descripción cuando un herpetólogo la revise y la publique.
              </p>
            </section>
          </div>
          )}
          {(has(species.whatIs) || has(species.curiosity)) && (
          <div className="taxon-gallery-side-card">
            <section className="taxon-section card">
              {has(species.whatIs) && (
                <>
                  <h2 className="taxon-section-title">
                    <MdMenuBook /> ¿Qué es esta especie?
                  </h2>
                  <p className="taxon-what-is">{species.whatIs}</p>
                </>
              )}

              {has(species.curiosity) && (
                <div className="taxon-curiosity">
                  <MdStar />
                  <div>
                    <strong>Dato curioso</strong>
                    <p>{species.curiosity}</p>
                  </div>
                </div>
              )}
              {species.published && (
                <p className="taxon-published-note">Ficha revisada por un herpetólogo · versión {species.version}</p>
              )}
            </section>
          </div>
          )}
          <ObservationsTimeline observations={observations} />
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════ */}
      <main className="taxon-main container">

        {/* ── Quick facts bar ── */}
        <div className="taxon-facts-bar">
          {iucnInfo && (
          <div className="taxon-fact-chip">
            <span className={`a-badge ${iucnInfo.badgeClass}`}><MdShield size={12} aria-hidden /> {species.iucn}</span>
            <div>
              <span className="fact-label">Estado UICN</span>
              <strong>{iucnInfo.label}</strong>
            </div>
          </div>
          )}
          {species.toxicity && (
            <div className="taxon-fact-chip">
              <MdWarning />
              <div>
                <span className="fact-label">Toxicidad</span>
                <strong>{species.toxicity.label}</strong>
              </div>
            </div>
          )}
          {species.altitudeRange && (species.altitudeRange.min != null || species.altitudeRange.max != null) && (
            <div className="taxon-fact-chip">
              <MdTerrain />
              <div>
                <span className="fact-label">Altitud</span>
                <strong>
                  {species.altitudeRange.min != null && species.altitudeRange.max != null
                    ? `${species.altitudeRange.min} – ${species.altitudeRange.max} m`
                    : species.altitudeRange.min != null
                      ? `desde ${species.altitudeRange.min} m`
                      : `hasta ${species.altitudeRange.max} m`}
                </strong>
              </div>
            </div>
          )}
          {typeof species.endemic === 'boolean' && (
            <div className="taxon-fact-chip">
              <MdEco />
              <div>
                <span className="fact-label">Endemismo</span>
                <strong>
                  {species.endemic ? `Endémica${species.endemicScope ? ` de ${species.endemicScope}` : ''}` : 'No endémica'}
                </strong>
              </div>
            </div>
          )}
          {has(species.activity) && (
            <div className="taxon-fact-chip">
              <GiFrogFoot />
              <div>
                <span className="fact-label">Actividad</span>
                <strong>{species.activity}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="taxon-content-grid">

          {/* LEFT COLUMN */}
          <div className="taxon-left-col">

            {/* ── 1. Taxonomy ── */}
            {(taxRows.length > 0 || synonyms.length > 0) && (
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <MdScience /> Taxonomía y clasificación
              </h2>
              <div className="taxon-tax-table">
                {taxRows.map(([label, value, italic]) => (
                  <div className="tax-row" key={label}>
                    <span>{label}</span>
                    <strong>{italic ? <i>{value}</i> : value}</strong>
                  </div>
                ))}
                {synonyms.length > 0 && (
                  <div className="tax-row tax-row-synonyms">
                    <span>Sinónimos</span>
                    <strong>{synonyms.join(', ')}</strong>
                  </div>
                )}
              </div>
            </section>
            )}

            {/* ── 2. Morphological description ── */}
            {(morphItems.length > 0 || diagnostics.length > 0) && (
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <GiFrogFoot /> Descripción morfológica
              </h2>
              {morphItems.length > 0 && (
                <div className="taxon-morpho-grid">
                  {morphItems.map(([label, value]) => (
                    <div className="morpho-item" key={label}>
                      <span className="morpho-label">{label}</span>
                      <p>{value}</p>
                    </div>
                  ))}
                </div>
              )}
              {diagnostics.length > 0 && (
                <div className="morpho-diagnostics">
                  <span className="morpho-label">Caracteres diagnósticos</span>
                  <ul>
                    {diagnostics.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            )}

            {/* ── 2b. Bioacústica — todavía no hay grabaciones reales en el catálogo: no se inventan. */}
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <MdGraphicEq /> Bioacústica
              </h2>
              <p className="taxon-what-is">Aún no hay grabaciones de esta especie. Aparecerán aquí cuando se publiquen.</p>
            </section>

            {/* ── 3. Conservation ── */}
            {(iucnInfo || threats.length > 0) && (
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <MdShield /> Estado de conservación
              </h2>
              {iucnInfo && (
                <div
                  className={`iucn-badge-large a-badge ${iucnInfo.badgeClass}`}
                >
                  <span className="iucn-code">{species.iucn}</span>
                  <span className="iucn-label">{iucnInfo.label}</span>
                </div>
              )}
              {threats.length > 0 && (
                <div className="threat-list">
                  <p className="morpho-label">Amenazas principales</p>
                  <ul>
                    {threats.map((t, i) => (
                      <li key={i}><MdWarning /> {t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
            )}

          </div>

          {/* RIGHT COLUMN */}
          <div className="taxon-right-col">

            {/* ── Ecology ── */}
            {(ecoItems.length > 0 || has(species.reproduction)) && (
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <MdEco /> Biología y ecología
              </h2>
              {ecoItems.length > 0 && (
                <div className="taxon-eco-grid">
                  {ecoItems.map(([label, value]) => (
                    <div className="eco-item" key={label}>
                      <span className="morpho-label">{label}</span>
                      <p>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {has(species.reproduction) && (
                <div className="taxon-repro-block">
                  <MdWaterDrop />
                  <div>
                    <strong>Reproducción</strong>
                    <p>{species.reproduction}</p>
                  </div>
                </div>
              )}
            </section>
            )}

            {/* ── Fuentes: todas en un solo bloque ── */}
            <SourcesCard species={species} />

            {/* ── Observations counter + link ── */}
            <section className="taxon-section card taxon-obs-summary">
              <h2 className="taxon-section-title">
                <MdLocationOn /> Registros en Anura
              </h2>
              <p className="taxon-obs-count">
                <span>{observations.length}</span> {observations.length === 1 ? 'observación registrada' : 'observaciones registradas'}
              </p>
              <button
                className="btn-browse-all"
                onClick={() => navigate(browseUrl)}
              >
                Ver todas las fotos <MdArrowForward />
              </button>
            </section>

          </div>
        </div>

        {/* ── Distribution Map ── */}
        {combinedPoints.length > 0 && (
          <section className="taxon-map-section">
            <h2 className="taxon-section-title">
              <MdMap /> Distribución y Ecología
            </h2>
            
            <div className={`taxon-map-wrapper mode-${mapMode}`}>
              <MapContainer
                center={[4.5709, -74.2973]}
                zoom={5}
                scrollWheelZoom={false}
                className="taxon-leaflet-map"
              >
                {mapMode === 'geographic' && (
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap'
                  />
                )}
                
                {mapMode === 'heatmap' && (
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; CARTO'
                  />
                )}
                
                {mapMode === 'altitudinal' && (
                  <TileLayer
                    url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenTopoMap'
                  />
                )}

                {mapMode === 'heatmap' ? (
                  <HeatmapLayer data={combinedPoints} />
                ) : (
                  <GridDensityLayer
                    data={combinedPoints}
                    mapMode={mapMode}
                    getImageUrl={getImageUrl}
                  />
                )}
              </MapContainer>
            </div>

            <div className="taxon-map-controls">
              <button 
                className={`map-ctrl-btn ${mapMode === 'geographic' ? 'active' : ''}`}
                onClick={() => setMapMode('geographic')}
              >
                <MdPublic /> Distribución Geográfica
              </button>
              <button 
                className={`map-ctrl-btn ${mapMode === 'heatmap' ? 'active' : ''}`}
                onClick={() => setMapMode('heatmap')}
              >
                <MdLocalFireDepartment /> Mapa de Calor
              </button>
              <button 
                className={`map-ctrl-btn ${mapMode === 'altitudinal' ? 'active' : ''}`}
                onClick={() => setMapMode('altitudinal')}
              >
                <MdLandscape /> Altitudinal / Ecológico
              </button>
            </div>
          </section>
        )}

        {/* ── Recent observations grid ── */}
        {observations.length > 0 && (
          <section className="taxon-obs-section">
            <div className="taxon-obs-header">
              <h2 className="taxon-section-title">
                <MdCalendarToday /> Observaciones recientes
              </h2>
              <Link to={browseUrl} className="taxon-see-all-link">
                Ver todas <MdArrowForward />
              </Link>
            </div>
            <div className="taxon-obs-grid">
              {observations.slice(0, 6).map(obs => (
                <div
                  key={obs.id}
                  className="taxon-obs-card"
                  onClick={() => navigate(`/explorer/${obs.id}`)}
                >
                  <div className="taxon-obs-img">
                    <FallbackImage
                      src={getImageUrl(obs.thumbnail_key)}
                      alt={obs.common_name || species.commonName}
                    />
                  </div>
                  <div className="taxon-obs-body">
                    <strong>{obs.common_name || species.commonName}</strong>
                    <span className="obs-meta">
                      <MdCalendarToday />
                      {new Date(obs.created_at).toLocaleDateString('es-CO')}
                    </span>
                    {obs.place_guess && (
                      <span className="obs-meta">
                        <MdLocationOn /> {obs.place_guess}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
