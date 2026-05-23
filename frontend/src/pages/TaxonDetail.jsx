import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  FaArrowLeft, FaArrowRight, FaFrog, FaLocationDot, FaCalendarDays,
  FaTriangleExclamation, FaShield, FaMountain, FaMicroscope,
  FaLeaf, FaDroplet, FaBook, FaStar, FaMapLocationDot, FaFire, FaMountainSun, FaGlobe, FaUser
} from 'react-icons/fa6';
import L from 'leaflet';
import 'leaflet.heat';
import { MapContainer, TileLayer, CircleMarker, Marker, Rectangle, useMap, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './TaxonDetail.css';
import LoadingSpinner from '../components/LoadingSpinner';
import BackButton from '../components/BackButton';

const API_BASE = import.meta.env.VITE_API_URL || '';

const mediaUrl = (path) => {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  const p = path.startsWith('/') ? path : `/${path}`
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE
  return `${base}${p}`
}

const getRelativeTime = (dateString) => {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} año${years > 1 ? 's' : ''}`;
  if (months > 0) return `${months} mes${months > 1 ? 'es' : ''}`;
  if (weeks > 0) return `${weeks} semana${weeks > 1 ? 's' : ''}`;
  if (days > 0) return `${days} día${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''}`;
  if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
  return 'ahora';
};

const SafeAvatar = ({ src, alt, placeholderClassName }) => {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return <span className={placeholderClassName || 'avatar-micro'}><FaUser aria-hidden /></span>
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

function HeatmapLayer({ data }) {
  const map = useMap();
  useEffect(() => {
    if (!data || data.length === 0) return;
    const points = data.map(pt => [pt.decimalLatitude, pt.decimalLongitude, 1]);
    const heat = L.heatLayer(points, { 
      radius: 20, 
      blur: 15, 
      maxZoom: 10,
      gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
    }).addTo(map);

    return () => {
      map.removeLayer(heat);
    };
  }, [data, map]);
  return null;
}

function GridDensityLayer({ data, mapMode, navigate, getImageUrl, getRelativeTime, mediaUrl }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const handleZoom = () => {
      setZoom(map.getZoom());
    };
    map.on('zoomend', handleZoom);
    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map]);

  // Determine grid cell size in degrees based on zoom level
  let cellSize = 0.5;
  if (zoom <= 3) cellSize = 4.0;
  else if (zoom === 4) cellSize = 2.0;
  else if (zoom === 5) cellSize = 1.0;
  else if (zoom === 6) cellSize = 0.5;
  else if (zoom === 7) cellSize = 0.25;
  else if (zoom === 8) cellSize = 0.1;
  else if (zoom === 9) cellSize = 0.05;
  else if (zoom === 10) cellSize = 0.02;
  else if (zoom === 11) cellSize = 0.01;
  else if (zoom === 12) cellSize = 0.005;
  else if (zoom === 13) cellSize = 0.002;
  else cellSize = 0; // Zoom >= 14 shows individual markers!

  // If cellSize is 0, we render individual markers
  if (cellSize === 0) {
    return (
      <>
        {data.map((pt, i) => {
          let color = pt.isUserSubmitted ? '#2ecc71' : '#e74c3c';
          const size = pt.isUserSubmitted ? 14 : 10;
          const strokeColor = pt.isUserSubmitted ? '#27ae60' : '#ffffff';

          if (mapMode === 'altitudinal') {
            color = pt.isUserSubmitted ? '#2ecc71' : (pt.decimalLatitude > 8 ? '#f39c12' : '#8e44ad');
          }

          const squareIcon = L.divIcon({
            className: 'square-marker-icon',
            html: `<div style="background-color: ${color}; width: ${size}px; height: ${size}px; border: 1.5px solid ${strokeColor}; box-shadow: 0 1px 3px rgba(0,0,0,0.3); border-radius: 2px;"></div>`,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            popupAnchor: [0, -size / 2]
          });

          return (
            <Marker
              key={i}
              position={[pt.decimalLatitude, pt.decimalLongitude]}
              icon={squareIcon}
            >
              {pt.isUserSubmitted ? (
                <Popup className="inat-popup-wrapper">
                  <div className="inat-popup" onClick={() => navigate(`/explorer/${pt.id}`)}>
                    {/* Column 1: Image */}
                    <div className="popup-image">
                      <img src={getImageUrl(pt.thumbnail_key, 'small')} alt={pt.ai_class || 'Rana'} />
                    </div>

                    {/* Column 2: Details */}
                    <div className="popup-col-center">
                      <h4 className="common-name">{pt.common_name || pt.ai_class?.replace(/_/g, ' ') || 'Sin identificar'}</h4>
                      <span className="scientific-name">({pt.ai_class ? pt.ai_class.replace(/_/g, ' ') : 'Sin identificar'})</span>
                      <span className="date-full">{new Date(pt.recorded_at || pt.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </div>

                    {/* Column 3: Meta */}
                    <div className="popup-col-right">
                      <div className="avatar-top-right" onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/people/${pt.username}`);
                      }} style={{ cursor: 'pointer' }}>
                        <SafeAvatar
                          src={pt.profile_image ? mediaUrl(pt.profile_image) : ''}
                          alt="u"
                          placeholderClassName="avatar-micro"
                        />
                      </div>
                      <div className="time-bottom-right">
                        <FaCalendarDays aria-hidden /> {getRelativeTime(pt.created_at)}
                      </div>
                    </div>
                  </div>
                </Popup>
              ) : (
                <Popup>
                  <div style={{ fontSize: '13px' }}>
                    <strong>Registro Científico (GBIF)</strong><br/>
                    <span style={{ fontSize: '11px', color: '#888' }}>
                      Lat: {pt.decimalLatitude.toFixed(5)}, Lon: {pt.decimalLongitude.toFixed(5)}
                    </span>
                  </div>
                </Popup>
              )}
            </Marker>
          );
        })}
      </>
    );
  }

  // Otherwise, bin the points
  const bins = {};
  data.forEach(pt => {
    const cellLat = Math.floor(pt.decimalLatitude / cellSize) * cellSize;
    const cellLon = Math.floor(pt.decimalLongitude / cellSize) * cellSize;
    const key = `${cellLat.toFixed(6)},${cellLon.toFixed(6)}`;
    
    if (!bins[key]) {
      bins[key] = {
        lat: cellLat,
        lon: cellLon,
        points: [],
        userCount: 0,
        scientificCount: 0
      };
    }
    bins[key].points.push(pt);
    if (pt.isUserSubmitted) {
      bins[key].userCount++;
    } else {
      bins[key].scientificCount++;
    }
  });

  const cells = Object.values(bins);
  const maxPoints = Math.max(...cells.map(c => c.points.length));

  return (
    <>
      {cells.map((cell, idx) => {
        const bounds = [
          [cell.lat, cell.lon],
          [cell.lat + cellSize, cell.lon + cellSize]
        ];

        const count = cell.points.length;
        const ratio = count / maxPoints;
        
        let color = '#e74c3c'; // Scientific default
        if (mapMode === 'altitudinal') {
          color = '#8e44ad';
        } else if (cell.userCount > cell.scientificCount) {
          color = '#2ecc71';
        }

        const opacity = 0.3 + ratio * 0.55;

        return (
          <Rectangle
            key={idx}
            bounds={bounds}
            pathOptions={{
              color: color,
              weight: 1,
              fillColor: color,
              fillOpacity: opacity,
              stroke: true
            }}
          >
            <Popup>
              <div style={{ fontSize: '13px', lineHeight: '1.4' }}>
                <strong style={{ color: color }}>Cuadrícula de Densidad</strong><br/>
                <span>Total registros: <strong>{count}</strong></span><br/>
                {cell.userCount > 0 && <span>• Observaciones Anura: {cell.userCount}<br/></span>}
                {cell.scientificCount > 0 && <span>• Registros GBIF: {cell.scientificCount}<br/></span>}
                <span style={{ fontSize: '11px', color: '#888' }}>
                  Área: {cell.lat.toFixed(3)}° a {(cell.lat + cellSize).toFixed(3)}° Lat<br/>
                  {cell.lon.toFixed(3)}° a {(cell.lon + cellSize).toFixed(3)}° Lon
                </span>
              </div>
            </Popup>
          </Rectangle>
        );
      })}
    </>
  );
}

// ── Fallback species data (same pattern as ObservationDetail) ──
const SPECIES_FALLBACK = {
  'leucostethus fraterdanieli': {
    scientificName: 'Leucostethus fraterdanieli',
    author: 'Myers & Daly, 1976',
    commonName: 'Rana dardo de Daniel',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Dendrobatidae',
    genus: 'Leucostethus',
    speciesEpithet: 'fraterdanieli',
    iucn: 'EN',
    endemic: true,
    altitudeRange: { min: 400, max: 1100 },
    habitat: 'Bosque húmedo tropical, hojarasca',
    activity: 'Diurna',
    diet: 'Pequeños artrópodos (ácaros, colémbolos)',
    reproduction: 'Desarrollo directo — huevos terrestres, sin estadio larvario acuático',
    curiosity: 'Lleva el nombre del hermano de un científico colombiano. Cada registro es de alto valor para la ciencia.',
    threats: ['Deforestación', 'Pérdida de hábitat', 'Quitridiomicosis'],
    distribution: 'Endémica de Antioquia, Colombia — distribución muy restringida',
    whatIs: 'Leucostethus fraterdanieli es una rana pequeña de la familia Dendrobatidae, caracterizada por su coloración discreta en tonos marrones y líneas claras a lo largo del cuerpo. Habita bosques húmedos tropicales de Colombia, generalmente cerca de quebradas y zonas con abundante hojarasca. Es una especie diurna que se alimenta de pequeños invertebrados y cumple un papel importante en el equilibrio ecológico de los ecosistemas donde vive.',
    synonyms: [],
    morphology: {
      dorsal: 'Fondo oscuro con manchas azuladas o verdosas en dorso y flancos',
      ventral: 'Vientre oscuro con leve iridiscencia',
      size: 'LHC: ♂ 16–19 mm · ♀ 18–22 mm',
      diagnostics: ['Patrón de manchas azuladas / verdosas', 'Glándulas femorales presentes', 'Tamaño pequeño'],
    },
  },
  'rhinella horribilis': {
    scientificName: 'Rhinella horribilis',
    author: 'Cope, 1862',
    commonName: 'Sapo gigante',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Bufonidae',
    genus: 'Rhinella',
    speciesEpithet: 'horribilis',
    iucn: 'LC',
    endemic: false,
    altitudeRange: { min: 0, max: 1500 },
    habitat: 'Áreas abiertas, jardines, bordes de bosque',
    activity: 'Nocturna',
    diet: 'Insectos, invertebrados',
    reproduction: 'Reproducción acuática — desove en cadenas en cuerpos de agua',
    curiosity: 'Sus glándulas parotoides producen veneno que puede dañar mascotas. Es el anfibio más grande de Colombia.',
    threats: ['Tráfico de mascotas', 'Atropellamiento vial'],
    distribution: 'Amplia: tierras bajas tropicales de América',
    whatIs: 'El sapo de caña mesoamericano (Rhinella horribilis) es una de las especies de anfibios que componen el género Rhinella, que se incluye en la familia de los bufónidos. Este anuro es de tamaño grande y de hábitos terrestres. Se distribuye de manera nativa desde el extremo sur de Estados Unidos por el norte, hasta el extremo norte del Perú por el sur. Durante décadas fue considerado un sinónimo más moderno del sapo de caña amazónico (R. marina), hasta que en 2016 se lo rehabilitó como especie plena.',
    synonyms: ['Bufo marinus', 'Bufo horribilis'],
    morphology: {
      dorsal: 'Piel rugosa parda a grisácea',
      ventral: 'Vientre claro con manchas oscuras',
      size: 'LHC: ♂ hasta 17 cm · ♀ hasta 24 cm',
      diagnostics: ['Parotoides muy prominentes', 'Tamaño grande', 'Piel rugosa parda'],
    },
  },
  'dendrobates truncatus': {
    scientificName: 'Dendrobates truncatus',
    author: 'Cope, 1861',
    commonName: 'Rana dardo amarilla',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Dendrobatidae',
    genus: 'Dendrobates',
    speciesEpithet: 'truncatus',
    iucn: 'LC',
    endemic: false,
    altitudeRange: { min: 0, max: 1200 },
    habitat: 'Bosque húmedo, hojarasca',
    activity: 'Diurna',
    diet: 'Ácaros, colémbolos',
    reproduction: 'Desarrollo directo — huevos terrestres',
    curiosity: 'El color brillante funciona como señal de advertencia (aposematismo) para los depredadores.',
    threats: ['Pérdida de hábitat', 'Comercio ilegal'],
    distribution: 'Colombia: región Caribe y valles interandinos',
    whatIs: 'Dendrobates truncatus es una rana pequeña de colores llamativos perteneciente a la familia Dendrobatidae. Presenta tonalidades negras con líneas o manchas amarillas, verdes o azuladas que advierten sobre su toxicidad. Habita bosques húmedos tropicales, especialmente en Colombia, donde vive cerca del suelo entre la hojarasca y zonas húmedas. Se alimenta principalmente de pequeños insectos y otros artrópodos.',
    synonyms: [],
    morphology: {
      dorsal: 'Amarillo o naranja brillante con manchas negras',
      ventral: 'Amarillo pálido con manchas negras',
      size: 'LHC: 2.5–3.5 cm',
      diagnostics: ['Coloración aposemática amarillo-negro', 'Tamaño pequeño', 'Discos adhesivos'],
    },
  },
  'rhinella alata': {
    scientificName: 'Rhinella alata',
    author: 'Cope, 1868',
    commonName: 'Rhinella alata',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Bufonidae',
    genus: 'Rhinella',
    speciesEpithet: 'alata',
    iucn: 'LC',
    endemic: false,
    altitudeRange: { min: 0, max: 900 },
    habitat: 'Bosques húmedos tropicales, hojarasca',
    activity: 'Terrestre',
    diet: 'Pequeños invertebrados',
    reproduction: 'Desove en cuerpos de agua',
    curiosity: 'Se caracteriza por su cuerpo robusto y una distintiva cresta o “ala” sobre la cabeza.',
    threats: ['Destrucción de hábitat'],
    distribution: 'Tierras bajas del Pacífico y región Caribe de Colombia y Centroamérica',
    whatIs: 'Rhinella alata es un sapo pequeño de hábitos terrestres perteneciente a la familia Bufonidae. Se caracteriza por su cuerpo robusto, coloración café o marrón con patrones oscuros y una distintiva cresta o “ala” sobre la cabeza. Habita bosques húmedos tropicales de Centroamérica y parte del norte de Sudamérica, donde suele encontrarse entre la hojarasca alimentándose de pequeños invertebrados.',
    synonyms: [],
    morphology: {
      dorsal: 'Café o marrón con patrones oscuros',
      ventral: 'Vientre claro',
      size: 'Pequeño',
      diagnostics: ['Cresta cefálica o "ala" sobre la cabeza'],
    },
  },
  'pristimantis achatinus': {
    scientificName: 'Pristimantis achatinus',
    author: 'Cope, 1868',
    commonName: 'Cutín Común de Occidente',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Craugastoridae',
    genus: 'Pristimantis',
    speciesEpithet: 'achatinus',
    iucn: 'LC',
    endemic: false,
    altitudeRange: { min: 10, max: 1900 },
    habitat: 'Bosques húmedos, plantaciones, jardines',
    activity: 'Nocturna',
    diet: 'Insectos',
    reproduction: 'Desarrollo directo',
    curiosity: 'A diferencia de otras ranas, no pasa por la etapa de renacuajo en el agua; sus huevos tienen desarrollo directo.',
    threats: ['Degradación de hábitat'],
    distribution: 'Colombia, Ecuador y Panamá',
    whatIs: 'Pristimantis achatinus es una especie de anfibio anuro de la familia Craugastoridae. Se encuentra en Colombia, Ecuador y Panamá. Su hábitat natural son los bosques húmedos subtropicales o tropicales de tierras bajas, bosques húmedos de montañas tropicales o subtropicales, plantaciones, jardines rurales, áreas urbanas y zonas previamente boscosas ahora muy degradadas.',
    synonyms: [],
    morphology: {
      dorsal: 'Coloración variable de amarillo a café oscuro',
      ventral: 'Completamente liso',
      size: '♂ 30-40 mm · ♀ 48-64 mm',
      diagnostics: ['Vientre liso', 'Primer dedo de la mano más largo que el segundo'],
    },
  },
  'pristimantis acanthinus': {
    scientificName: 'Pristimantis achatinus',
    author: 'Cope, 1868',
    commonName: 'Cutín Común de Occidente',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Craugastoridae',
    genus: 'Pristimantis',
    speciesEpithet: 'achatinus',
    iucn: 'LC',
    endemic: false,
    altitudeRange: { min: 10, max: 1900 },
    habitat: 'Bosques húmedos, plantaciones, jardines',
    activity: 'Nocturna',
    diet: 'Insectos',
    reproduction: 'Desarrollo directo',
    curiosity: 'A diferencia de otras ranas, no pasa por la etapa de renacuajo en el agua; sus huevos tienen desarrollo directo.',
    threats: ['Degradación de hábitat'],
    distribution: 'Colombia, Ecuador y Panamá',
    whatIs: 'Pristimantis achatinus es una especie de anfibio anuro de la familia Craugastoridae. Se encuentra en Colombia, Ecuador y Panamá. Su hábitat natural son los bosques húmedos subtropicales o tropicales de tierras bajas, bosques húmedos de montañas tropicales o subtropicales, plantaciones, jardines rurales, áreas urbanas y zonas previamente boscosas ahora muy degradadas.',
    synonyms: [],
    morphology: {
      dorsal: 'Coloración variable de amarillo a café oscuro',
      ventral: 'Completamente liso',
      size: '♂ 30-40 mm · ♀ 48-64 mm',
      diagnostics: ['Vientre liso', 'Primer dedo de la mano más largo que el segundo'],
    },
  },
  'pristimantis paisa': {
    scientificName: 'Pristimantis paisa',
    author: 'Lynch & Duellman, 1997',
    commonName: 'Pristimantis paisa',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Craugastoridae',
    genus: 'Pristimantis',
    speciesEpithet: 'paisa',
    iucn: 'VU',
    endemic: true,
    altitudeRange: { min: 1800, max: 3100 },
    habitat: 'Bosques montanos húmedos',
    activity: 'Nocturna',
    diet: 'Pequeños insectos',
    reproduction: 'Desarrollo directo',
    curiosity: 'Es endémica de la cordillera Central de Antioquia.',
    threats: ['Pérdida y degradación de hábitat'],
    distribution: 'Antioquia, Colombia',
    whatIs: 'Pristimantis paisa es una especie de anfibio anuro endémica del departamento de Antioquia, Colombia, perteneciente a la familia Craugastoridae. Habita bosques montanos húmedos entre los 1800 y 3100 metros de altitud, donde presenta hábitos nocturnos. Esta rana cumple un papel importante en el equilibrio ecológico de los ecosistemas andinos, aunque actualmente enfrenta amenazas debido a la pérdida y degradación de su hábitat natural.',
    synonyms: [],
    morphology: {
      dorsal: 'Piel lisa o finamente granular',
      ventral: 'Grisáceo',
      size: 'Pequeño',
      diagnostics: ['Endémica de Antioquia', 'Bosques montanos sobre 1800 msnm'],
    },
  },
  'pristimantis penelopus': {
    scientificName: 'Pristimantis penelopus',
    author: 'Lynch, 1980',
    commonName: 'Pristimantis penelopus',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Craugastoridae',
    genus: 'Pristimantis',
    speciesEpithet: 'penelopus',
    iucn: 'LC',
    endemic: true,
    altitudeRange: { min: 1180, max: 1500 },
    habitat: 'Bosques montanos',
    activity: 'Nocturna',
    diet: 'Pequeños artrópodos',
    reproduction: 'Desarrollo directo',
    curiosity: 'Es endémica de la ladera oriental de la Cordillera Central en Colombia.',
    threats: ['Deforestación'],
    distribution: 'Antioquia, Tolima y Caldas, Colombia',
    whatIs: 'Pristimantis penelopus es una especie de anfibio anuro de la familia Craugastoridae. Esta especie es endémica de la ladera oriental de la Cordillera Central en Colombia. Habita en los departamentos de Antioquia, Tolima y Caldas entre 1 180 y 1 500 m de altitud.',
    synonyms: [],
    morphology: {
      dorsal: 'Coloración parda',
      ventral: 'Liso',
      size: 'Pequeño',
      diagnostics: ['Endémica de la Cordillera Central', 'Habita entre 1180 y 1500 m'],
    },
  },
  'dendropsophus bogerti': {
    scientificName: 'Dendropsophus bogerti',
    author: 'Cochran & Goin, 1961',
    commonName: 'Rana arborícola de Bogert',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Hylidae',
    genus: 'Dendropsophus',
    speciesEpithet: 'bogerti',
    iucn: 'LC',
    endemic: true,
    altitudeRange: { min: 0, max: 1000 },
    habitat: 'Montanos secos, marismas, estanques',
    activity: 'Nocturna',
    diet: 'Pequeños insectos',
    reproduction: 'Desove en cuerpos de agua lénticos',
    curiosity: 'Los machos emiten un canto nocturno característico para atraer a las hembras desde la vegetación.',
    threats: ['Destrucción de humedales'],
    distribution: 'Valles y tierras bajas de Colombia',
    whatIs: 'Dendropsophus bogerti es una especie de anfibios de la familia Hylidae. Es endémica de Colombia. Sus hábitats naturales incluyen montanos secos, marismas de agua dulce, corrientes intermitentes de agua, tierra arable, pastos, plantaciones, jardines rurales, áreas urbanas, zonas previamente boscosas ahora muy degradadas, estanques y tierras de irrigación.',
    synonyms: [],
    morphology: {
      dorsal: 'Verde o café claro',
      ventral: 'Vientre liso blanquecino',
      size: 'LHC: 2.0-3.0 cm',
      diagnostics: ['Dedos con discos adhesivos grandes', 'Ojos prominentes'],
    },
  },
  'dendropsophus microcephalus': {
    scientificName: 'Dendropsophus microcephalus',
    author: 'Cope, 1886',
    commonName: 'Ranita mísera',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Hylidae',
    genus: 'Dendropsophus',
    speciesEpithet: 'microcephalus',
    iucn: 'LC',
    endemic: false,
    altitudeRange: { min: 0, max: 1200 },
    habitat: 'Zonas abiertas inundables, vegetación baja',
    activity: 'Nocturna',
    diet: 'Pequeños insectos',
    reproduction: 'Desove en cuerpos de agua temporales',
    curiosity: 'Esta especie puede someterse a un cambio de color del día (tostado/amarillo con manchas oscuras) a la noche (amarillo claro).',
    threats: ['Contaminación de fuentes de agua'],
    distribution: 'Amplia desde México hasta el norte de Sudamérica',
    whatIs: 'La ranita mísera (Dendropsophus microcephalus) es una especie de anfibio de la familia Hylidae. La cabeza es plana y el hocico es redondeado y corto. Los ojos tienen pupilas elípticas dispuestas horizontalmente. Las fosas nasales están dirigidas lateralmente y el área entre las fosas nasales es algo cóncava. Esta especie puede someterse a un cambio de color. Durante la noche, el dorso es de color amarillo claro con varias marcas de color marrón o marrón claro. Durante el día, el dorso es de color tostado, amarillo o marrón claro con manchas más oscuras marrones o rojas.',
    synonyms: [],
    morphology: {
      dorsal: 'Cambio cromático (amarillo claro de noche, tostado de día)',
      ventral: 'Amarillo con muslos uniformemente amarillos',
      size: 'LHC: < 3 cm',
      diagnostics: ['Cabeza pequeña y plana', 'Muslos amarillos con línea marrón'],
    },
  },
  'hyloscirtus palmeri': {
    scientificName: 'Hyloscirtus palmeri',
    author: 'Boulenger, 1908',
    commonName: 'Rana torrente de Palmer',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Hylidae',
    genus: 'Hyloscirtus',
    speciesEpithet: 'palmeri',
    iucn: 'NT',
    endemic: false,
    altitudeRange: { min: 500, max: 2000 },
    habitat: 'Ríos, riachuelos y quebradas torrentosas',
    activity: 'Nocturna / Crepuscular',
    diet: 'Insectos asociados a cuerpos de agua',
    reproduction: 'Desove en riachuelos de corriente rápida',
    curiosity: 'Está estrictamente asociada a quebradas de corriente rápida y sirve como excelente bioindicadora de la calidad del agua.',
    threats: ['Destrucción de hábitat ribereño', 'Contaminación del agua'],
    distribution: 'Colombia, Costa Rica, Ecuador y Panamá',
    whatIs: 'La rana torrente de Palmer o rana arborícola de Palmer (Hyloscirtus palmeri) es una especie de anfibios de la familia Hylidae. Habita en Colombia, Costa Rica, Ecuador y Panamá. Sus hábitats naturales incluyen bosques tropicales o subtropicales secos y a baja altitud, montanos secos y ríos. Está amenazada por la destrucción de su hábitat natural.',
    synonyms: [],
    morphology: {
      dorsal: 'Dorso verde con reticulado oscuro',
      ventral: 'Vientre con tonos claros',
      size: 'LHC: 3.5-5.0 cm',
      diagnostics: ['Asociada a corrientes rápidas', 'Patrón de color verde reticulado'],
    },
  },
};;

const IUCN_COLORS = {
  LC: { bg: '#2f7d32', label: 'Preocupación menor' },
  NT: { bg: '#558b2f', label: 'Casi amenazada' },
  VU: { bg: '#f57f17', label: 'Vulnerable' },
  EN: { bg: '#e65100', label: 'En peligro' },
  CR: { bg: '#b71c1c', label: 'En peligro crítico' },
  EW: { bg: '#37474f', label: 'Extinta en estado silvestre' },
  EX: { bg: '#212121', label: 'Extinta' },
  DD: { bg: '#78909c', label: 'Datos insuficientes' },
};

const normalizeKey = (v) =>
  String(v || '').trim().replace(/_/g, ' ').replace(/\s+/g, ' ').toLowerCase();

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
  const species = SPECIES_FALLBACK[speciesKey] || {
    scientificName: slugPart,
    commonName: slugPart,
    className: '-',
    orderName: '-',
    family: '-',
    genus: slugPart.split(' ')[0] || '-',
    speciesEpithet: slugPart.split(' ')[1] || '-',
    iucn: 'DD',
    endemic: false,
    altitudeRange: null,
    habitat: '-',
    activity: '-',
    diet: '-',
    reproduction: '-',
    curiosity: '-',
    threats: [],
    distribution: '-',
    whatIs: 'Información no disponible aún en esta versión.',
    synonyms: [],
    morphology: { dorsal: '-', ventral: '-', size: '-', diagnostics: [] },
  };

  const iucnInfo = IUCN_COLORS[species.iucn] || IUCN_COLORS['DD'];

  useEffect(() => {
    fetchTaxonObservations();
    fetchMapData();
  }, [taxonIdSlug]);

  const fetchMapData = async () => {
    try {
      const g = species.genus?.toLowerCase() || '';
      const e = species.speciesEpithet?.toLowerCase() || '';
      if (!g || !e || g === '-' || e === '-') return;
      
      const res = await fetch(`/data/distribution/${g}_${e}.json`);
      if (res.ok) {
        const data = await res.json();
        setMapData(data);
      }
    } catch (err) {
      console.error('Error fetching map data:', err);
    }
  };

  const fetchTaxonObservations = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/explorer/feed`);
      if (res.ok) {
        const data = await res.json();
        const filtered = data.filter(obs => {
          const k = normalizeKey(obs.ai_class || obs.common_name || '');
          return k === speciesKey || k.includes(speciesKey) || speciesKey.includes(k);
        });
        setObservations(filtered);
      }
    } catch (err) {
      console.error('Error fetching taxon observations:', err);
    } finally {
      setLoading(false);
    }
  };

  const getImageUrl = (key, size = 'medium') => {
    if (!key) return '';
    const filename = String(key).split('/').pop();
    return `${API_BASE}/api/explorer/thumbnail/${size}/${filename}`;
  };

  const getFullImageUrl = (key) => {
    if (!key) return '';
    if (/^https?:\/\//i.test(key)) return key;
    const p = key.startsWith('/') ? key : `/${key}`;
    const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
    return `${base}${p}`;
  };

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
  const browseUrl = `/taxa/${taxonIdSlug}/browse_photos`;

  if (loading && observations.length === 0)
    return <LoadingSpinner text={`Cargando datos de ${species.commonName}...`} />;

  if (error)
    return (
      <div className="taxon-error">
        <FaTriangleExclamation />
        <p>{error}</p>
        <button className="btn-back" onClick={() => navigate(-1)}>
          <FaArrowLeft /> Volver
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
                <img
                  src={getFullImageUrl(heroObs.image_key)}
                  alt={species.commonName}
                  className="taxon-hero-img"
                  onClick={() => navigate(`/explorer/${heroObs.id}`)}
                />
              ) : (
                <div className="taxon-hero-placeholder">
                  <FaFrog />
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
                  <img
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
                  <img
                    src={getImageUrl(galleryObs[5].thumbnail_key, 'medium')}
                    alt="más"
                    className="taxon-thumb-img taxon-thumb-bg"
                  />
                )}
                <div className="taxon-thumb-more-overlay">
                  <FaArrowRight className="taxon-more-icon" />
                </div>
              </div>
            </div>
          </div>

          {/* Right: Description / What is card */}
          <div className="taxon-gallery-side-card">
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <FaBook /> ¿Qué es esta especie?
              </h2>
              <p className="taxon-what-is">{species.whatIs}</p>

              <div className="taxon-curiosity">
                <FaStar />
                <div>
                  <strong>Dato curioso</strong>
                  <p>{species.curiosity}</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════ */}
      <main className="taxon-main container">

        {/* ── Quick facts bar ── */}
        <div className="taxon-facts-bar">
          <div className="taxon-fact-chip">
            <FaShield style={{ color: iucnInfo.bg }} />
            <div>
              <span className="fact-label">Estado IUCN</span>
              <strong style={{ color: iucnInfo.bg }}>{species.iucn} — {iucnInfo.label}</strong>
            </div>
          </div>
          {species.altitudeRange && (
            <div className="taxon-fact-chip">
              <FaMountain />
              <div>
                <span className="fact-label">Altitud</span>
                <strong>{species.altitudeRange.min} – {species.altitudeRange.max} m</strong>
              </div>
            </div>
          )}
          <div className="taxon-fact-chip">
            <FaLeaf />
            <div>
              <span className="fact-label">Endemismo</span>
              <strong>{species.endemic ? 'Endémica' : 'No endémica'}</strong>
            </div>
          </div>
          <div className="taxon-fact-chip">
            <FaFrog />
            <div>
              <span className="fact-label">Actividad</span>
              <strong>{species.activity}</strong>
            </div>
          </div>
        </div>

        <div className="taxon-content-grid">

          {/* LEFT COLUMN */}
          <div className="taxon-left-col">

            {/* ── 1. Taxonomy ── */}
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <FaMicroscope /> Taxonomía y clasificación
              </h2>
              <div className="taxon-tax-table">
                <div className="tax-row"><span>Clase</span><strong>{species.className}</strong></div>
                <div className="tax-row"><span>Orden</span><strong>{species.orderName}</strong></div>
                <div className="tax-row"><span>Familia</span><strong>{species.family}</strong></div>
                <div className="tax-row"><span>Género</span><strong><i>{species.genus}</i></strong></div>
                <div className="tax-row"><span>Especie</span><strong><i>{species.speciesEpithet}</i></strong></div>
                <div className="tax-row"><span>Autor / año</span><strong>{species.author || '-'}</strong></div>
                {species.synonyms && species.synonyms.length > 0 && (
                  <div className="tax-row tax-row-synonyms">
                    <span>Sinónimos</span>
                    <strong>{species.synonyms.join(', ')}</strong>
                  </div>
                )}
              </div>
            </section>

            {/* ── 2. Morphological description ── */}
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <FaFrog /> Descripción morfológica
              </h2>
              <div className="taxon-morpho-grid">
                <div className="morpho-item">
                  <span className="morpho-label">Tamaño</span>
                  <p>{species.morphology.size}</p>
                </div>
                <div className="morpho-item">
                  <span className="morpho-label">Coloración dorsal</span>
                  <p>{species.morphology.dorsal}</p>
                </div>
                <div className="morpho-item">
                  <span className="morpho-label">Coloración ventral</span>
                  <p>{species.morphology.ventral}</p>
                </div>
              </div>
              {species.morphology.diagnostics.length > 0 && (
                <div className="morpho-diagnostics">
                  <span className="morpho-label">Caracteres diagnósticos</span>
                  <ul>
                    {species.morphology.diagnostics.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* ── 3. Conservation ── */}
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <FaShield /> Estado de conservación
              </h2>
              <div
                className="iucn-badge-large"
                style={{ background: iucnInfo.bg }}
              >
                <span className="iucn-code">{species.iucn}</span>
                <span className="iucn-label">{iucnInfo.label}</span>
              </div>
              {species.threats.length > 0 && (
                <div className="threat-list">
                  <p className="morpho-label">Amenazas principales</p>
                  <ul>
                    {species.threats.map((t, i) => (
                      <li key={i}><FaTriangleExclamation /> {t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

          </div>

          {/* RIGHT COLUMN */}
          <div className="taxon-right-col">

            {/* ── Ecology ── */}
            <section className="taxon-section card">
              <h2 className="taxon-section-title">
                <FaLeaf /> Biología y ecología
              </h2>
              <div className="taxon-eco-grid">
                <div className="eco-item">
                  <span className="morpho-label">Microhábitat</span>
                  <p>{species.habitat}</p>
                </div>
                <div className="eco-item">
                  <span className="morpho-label">Dieta</span>
                  <p>{species.diet}</p>
                </div>
                <div className="eco-item">
                  <span className="morpho-label">Actividad</span>
                  <p>{species.activity}</p>
                </div>
                <div className="eco-item">
                  <span className="morpho-label">Distribución</span>
                  <p>{species.distribution}</p>
                </div>
              </div>

              <div className="taxon-repro-block">
                <FaDroplet />
                <div>
                  <strong>Reproducción</strong>
                  <p>{species.reproduction}</p>
                </div>
              </div>
            </section>

            {/* ── Observations counter + link ── */}
            <section className="taxon-section card taxon-obs-summary">
              <h2 className="taxon-section-title">
                <FaLocationDot /> Registros en Anura
              </h2>
              <p className="taxon-obs-count">
                <span>{observations.length}</span> observación{observations.length !== 1 ? 'es' : ''} registrada{observations.length !== 1 ? 's' : ''}
              </p>
              <button
                className="btn-browse-all"
                onClick={() => navigate(browseUrl)}
              >
                Ver todas las fotos <FaArrowRight />
              </button>
            </section>

          </div>
        </div>

        {/* ── Distribution Map ── */}
        {combinedPoints.length > 0 && (
          <section className="taxon-map-section">
            <h2 className="taxon-section-title">
              <FaMapLocationDot /> Distribución y Ecología
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
                    navigate={navigate}
                    getImageUrl={getImageUrl}
                    getRelativeTime={getRelativeTime}
                    mediaUrl={mediaUrl}
                  />
                )}
              </MapContainer>
            </div>

            <div className="taxon-map-controls">
              <button 
                className={`map-ctrl-btn ${mapMode === 'geographic' ? 'active' : ''}`}
                onClick={() => setMapMode('geographic')}
              >
                <FaGlobe /> Distribución Geográfica
              </button>
              <button 
                className={`map-ctrl-btn ${mapMode === 'heatmap' ? 'active' : ''}`}
                onClick={() => setMapMode('heatmap')}
              >
                <FaFire /> Mapa de Calor
              </button>
              <button 
                className={`map-ctrl-btn ${mapMode === 'altitudinal' ? 'active' : ''}`}
                onClick={() => setMapMode('altitudinal')}
              >
                <FaMountainSun /> Altitudinal / Ecológico
              </button>
            </div>
          </section>
        )}

        {/* ── Recent observations grid ── */}
        {observations.length > 0 && (
          <section className="taxon-obs-section">
            <div className="taxon-obs-header">
              <h2 className="taxon-section-title">
                <FaCalendarDays /> Observaciones recientes
              </h2>
              <Link to={browseUrl} className="taxon-see-all-link">
                Ver todas <FaArrowRight />
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
                    <img
                      src={getImageUrl(obs.thumbnail_key)}
                      alt={obs.common_name || species.commonName}
                    />
                  </div>
                  <div className="taxon-obs-body">
                    <strong>{obs.common_name || species.commonName}</strong>
                    <span className="obs-meta">
                      <FaCalendarDays />
                      {new Date(obs.created_at).toLocaleDateString('es-CO')}
                    </span>
                    {obs.place_guess && (
                      <span className="obs-meta">
                        <FaLocationDot /> {obs.place_guess}
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
