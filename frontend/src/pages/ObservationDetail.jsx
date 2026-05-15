import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { FaArrowLeft, FaLocationDot, FaNoteSticky, FaTriangleExclamation, FaUser, FaHeart, FaRegHeart, FaCircleNotch } from 'react-icons/fa6';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { usePreferencesStore } from '../store/preferencesStore';
import { obsIdKey } from '../lib/observationIds';
import './ObservationDetail.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

const normalizeSpeciesKey = (value) => {
  if (!value) return ''
  return String(value)
    .trim()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// Fallback local para evitar “-” cuando la API no trae taxonomía completa
// (la UI también usa esto para construir la vista según preferences.mode).
const SPECIES_FALLBACK = {
  'rhinella horribilis': {
    scientificName: 'Rhinella horribilis (Cope, 1862)',
    commonName: 'Rhinella horribilis',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Bufonidae',
    genus: 'Rhinella',
    speciesEpithet: 'horribilis',
    synonym: 'Bufo marinus / B. horribilis',
    iucn: 'LC',
    altitudeTypicalRange: { min: 0, max: 1500 }, // msnm
  },
  'rhinella alata': {
    scientificName: 'Rhinella alata (Cope, 1868)',
    commonName: 'Rhinella alata',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Bufonidae',
    genus: 'Rhinella',
    speciesEpithet: 'alata',
    iucn: 'LC',
    altitudeTypicalRange: { min: 0, max: 900 },
  },
  'pristimantis achatinus': {
    scientificName: 'Pristimantis achatinus (Cope, 1868)',
    commonName: 'Pristimantis achatinus',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Strabomantidae',
    genus: 'Pristimantis',
    speciesEpithet: 'achatinus',
    iucn: 'LC',
    altitudeTypicalRange: { min: 0, max: 2200 },
  },
  'pristimantis paisa': {
    scientificName: 'Pristimantis paisa (Lynch & Duellman, 1997)',
    commonName: 'Pristimantis paisa',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Strabomantidae',
    genus: 'Pristimantis',
    speciesEpithet: 'paisa',
    iucn: 'VU',
    altitudeTypicalRange: { min: 1500, max: 2400 },
  },
  'pristimantis penelopus': {
    scientificName: 'Pristimantis penelopus (Lynch, 1980)',
    commonName: 'Pristimantis penelopus',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Strabomantidae',
    genus: 'Pristimantis',
    speciesEpithet: 'penelopus',
    iucn: 'LC',
    altitudeTypicalRange: { min: 1200, max: 2600 },
  },
  'dendrobates truncatus': {
    scientificName: 'Dendrobates truncatus (Cope, 1861)',
    commonName: 'Dendrobates truncatus',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Dendrobatidae',
    genus: 'Dendrobates',
    speciesEpithet: 'truncatus',
    iucn: 'LC',
    altitudeTypicalRange: { min: 0, max: 1200 },
  },
  'leucostethus fraterdanieli': {
    scientificName: 'Leucostethus fraterdanieli (Myers & Daly, 1976)',
    commonName: 'Leucostethus fraterdanieli',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Dendrobatidae',
    genus: 'Leucostethus',
    speciesEpithet: 'fraterdanieli',
    iucn: 'EN',
    altitudeTypicalRange: { min: 400, max: 1100 },
  },
  'dendropsophus bogerti': {
    scientificName: 'Dendropsophus bogerti (Cochran & Goin, 1961)',
    commonName: 'Dendropsophus bogerti',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Hylidae',
    genus: 'Dendropsophus',
    speciesEpithet: 'bogerti',
    iucn: 'LC',
    altitudeTypicalRange: { min: 0, max: 1000 },
  },
  'dendropsophus microcephalus': {
    scientificName: 'Dendropsophus microcephalus (Cope, 1886)',
    commonName: 'Dendropsophus microcephalus',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Hylidae',
    genus: 'Dendropsophus',
    speciesEpithet: 'microcephalus',
    iucn: 'LC',
    altitudeTypicalRange: { min: 0, max: 1200 },
  },
  'hyloscirtus palmeri': {
    scientificName: 'Hyloscirtus palmeri (Boulenger, 1908)',
    commonName: 'Hyloscirtus palmeri',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Hylidae',
    genus: 'Hyloscirtus',
    speciesEpithet: 'palmeri',
    iucn: 'NT',
    altitudeTypicalRange: { min: 500, max: 2000 },
  },
}

const EDUCATION_CONTENT = {
  'rhinella horribilis': {
    whatIs:
      'El sapo gigante o sapo marino es el anfibio más grande de Colombia. Sus glándulas parotoides producen veneno que puede dañar mascotas. Muy adaptable, vive cerca de humanos.',
    steps: [
      {
        title: 'Identificar por tamaño grande',
        sub: 'R. horribilis destaca por su tamaño grande frente a otros anuros comunes.',
      },
      {
        title: 'Buscar parotoides prominentes',
        sub: 'Observa las glándulas parotoides (detrás de los ojos) claramente visibles.',
      },
      {
        title: 'Revisar piel rugosa parda',
        sub: 'La piel suele verse rugosa y de coloración parda.',
      },
    ],
    curiosity:
      'Sus glándulas parotoides pueden dañar mascotas: evita manipular y prioriza observación a distancia.',
  },
  'rhinella alata': {
    whatIs:
      'El sapo de flancos manchados es un bufonido pequeño de tierras bajas. Se distingue del sapo marino por su menor tamaño y las manchas laterales características. Habita bordes de quebrada y hojarasca húmeda.',
    steps: [
      {
        title: 'Observar tamaño reducido vs R. horribilis',
        sub: 'Fíjate en que es un bufonido pequeño comparado con R. horribilis.',
      },
      {
        title: 'Buscar manchas en los flancos',
        sub: 'Identifica las manchas laterales características.',
      },
      {
        title: 'Buscar cerca de corrientes de agua',
        sub: 'Observa si el registro ocurre cerca de quebradas, corrientes y hojarasca húmeda.',
      },
    ],
    curiosity:
      'El patrón de flancos (manchas laterales) suele ser el mejor “rasgo visual” para diferenciarlo.',
  },
  'pristimantis achatinus': {
    whatIs:
      'Esta ranita de lluvia se reproduce sin pasar por renacuajo: sus huevos eclosionan directamente como ranitas pequeñas. Se encuentra en bosques andinos y es muy común en jardines y cultivos.',
    steps: [
      {
        title: 'Desarrollo directo (sin renacuajo)',
        sub: 'En el grupo, los huevos eclosionan directamente como ranitas pequeñas; eso guía la expectativa de microhábitat terrestre.',
      },
      {
        title: 'Dedos con discos adhesivos pequeños',
        sub: 'Busca dedos con discos adhesivos pequeños (adaptación para moverse en microhábitats).',
      },
      {
        title: 'Canto nocturno repetitivo y dorso café variable',
        sub: 'El canto nocturno puede ser repetitivo; el dorso suele ser café con patrón variable.',
      },
    ],
    curiosity:
      'La ausencia de fase larvaria acuática reduce la dependencia de agua abierta durante la reproducción.',
  },
  'pristimantis paisa': {
    whatIs:
      'La ranita paisa es endémica de Antioquia, lo que significa que no existe en ningún otro lugar del mundo. Está amenazada por la pérdida de bosque andino. Cada registro es importante para su conservación.',
    steps: [
      {
        title: 'Identificarla por tamaño pequeño',
        sub: 'Es pequeña: observa de cerca antes de descartarla.',
      },
      {
        title: 'Buscar ojos dorados prominentes',
        sub: 'Los ojos dorados suelen ser una pista clara.',
      },
      {
        title: 'Verificar hábitat: bosques de niebla (sobre 1500 msnm)',
        sub: 'Habita exclusivamente en bosques de niebla sobre 1500 msnm.',
      },
    ],
    curiosity:
      'Al ser endémica y restringida, documentar bien coords y microhábitat ayuda a su conservación.',
  },
  'pristimantis penelopus': {
    whatIs:
      'Otra ranita de desarrollo directo, con un patrón dorsal muy variable que puede confundirse con otras especies del mismo género. Vive en bosques andinos húmedos y es activa de noche.',
    steps: [
      {
        title: 'Buscar en vegetación baja cerca de quebradas',
        sub: 'Revisa vegetación baja en zonas con quebradas cercanas y humedad.',
      },
      {
        title: 'Identificar por canto de notas cortas y agudas',
        sub: 'Escucha el canto: notas cortas y agudas suelen ser la pista principal.',
      },
      {
        title: 'Tamaño mediano para el género',
        sub: 'Ten en cuenta que el tamaño es mediano frente a otras especies del mismo grupo.',
      },
    ],
    curiosity:
      'Por la variabilidad dorsal, el canto y el microhábitat son evidencia clave.',
  },
  'dendrobates truncatus': {
    whatIs:
      'La rana dardo amarilla es una de las especies más coloridas de Colombia. Su color brillante avisa a los depredadores que es tóxica. No es peligrosa al tocarla en condiciones normales, pero no se debe llevar a la boca. Muy buscada por fotógrafos de naturaleza.',
    steps: [
      {
        title: 'Coloración amarilla o naranja con manchas negras',
        sub: 'Es inconfundible por el patrón cromático (amarillo/naranja + manchas negras).',
      },
      {
        title: 'Actividad diurna',
        sub: 'Suele estar activa durante el día.',
      },
      {
        title: 'Tamaño pequeño (< 4 cm)',
        sub: 'Para la identificación, ten en cuenta que es pequeña (menos de 4 cm).',
      },
    ],
    curiosity:
      'El color brillante funciona como señal de advertencia; no la acerques a la boca.',
  },
  'leucostethus fraterdanieli': {
    whatIs:
      'Esta rana dardo es una de las más amenazadas de Colombia y lleva el nombre del hermano de un científico colombiano. Vive solo en pequeñas áreas de bosque húmedo en Antioquia y está en peligro por la deforestación. Si la encontraste, es un registro muy valioso.',
    steps: [
      {
        title: 'Coloración oscura con manchas azuladas o verdosas',
        sub: 'Busca el patrón de manchas azuladas/verdosas sobre un fondo oscuro.',
      },
      {
        title: 'Tamaño pequeño',
        sub: 'Es una rana pequeña; mantén distancia y observa con calma.',
      },
      {
        title: 'Activa en hojarasca diurna',
        sub: 'Puede encontrarse en hojarasca durante el día.',
      },
    ],
    curiosity:
      'Al ser amenazada y de distribución restringida, cada registro bien documentado suma mucho.',
  },
  'dendropsophus bogerti': {
    whatIs:
      'Esta ranita trepadora pasa la mayor parte de su vida en la vegetación sobre el agua. Es nocturna y su canto es el sonido típico de las noches tropicales cerca de estanques y ríos. Los machos cantan para atraer hembras.',
    steps: [
      {
        title: 'Dedos con discos adhesivos grandes',
        sub: 'Revisa si los dedos tienen discos adhesivos grandes (adaptación para trepar).',
      },
      {
        title: 'Ojos grandes con pupila horizontal',
        sub: 'Los ojos son grandes y la pupila suele ser horizontal.',
      },
      {
        title: 'Actividad nocturna cerca del agua',
        sub: 'Busca dorso verde o café claro y confírmalo de noche junto a estanques o ríos.',
      },
    ],
    curiosity:
      'Los machos cantan para atraer hembras: si escuchas, sigue el sonido alrededor del borde de agua.',
  },
  'dendropsophus microcephalus': {
    whatIs:
      'La ranita cabeza pequeña es una especie muy común de tierras bajas que se adapta bien a zonas intervenidas como arrozales y potreros inundados. Tiene uno de los cantos más escuchados en noches lluviosas de Colombia.',
    steps: [
      {
        title: 'Cabeza notoriamente pequeña vs el cuerpo',
        sub: 'Es un rasgo diagnóstico: observa la proporción de la cabeza.',
      },
      {
        title: 'Dorso amarillento o café con línea dorsolateral pálida',
        sub: 'El dorso suele ser amarillento/café con una línea pálida a lo largo del dorso.',
      },
      {
        title: 'Tamaño: menos de 3 cm',
        sub: 'Para el género, ten en cuenta que suele medir menos de 3 cm de longitud.',
      },
    ],
    curiosity:
      'Es indicadora de humedales intervenidos: cuando hay agua superficial e intervención, puede ser frecuente.',
  },
  'hyloscirtus palmeri': {
    whatIs:
      'La rana torrenticola de Palmer es una rana grande y llamativa que vive exclusivamente en quebradas de agua rápida y limpia en bosques de montaña. Su presencia indica que el agua está en buen estado. Es difícil de ver porque se camufla en las rocas.',
    steps: [
      {
        title: 'Asociación obligatoria con quebradas de corriente rápida',
        sub: 'Revisa si el registro está junto a agua rápida y limpia en bosques de montaña.',
      },
      {
        title: 'Coloración verde brillante con manchas oscuras',
        sub: 'Puede presentar verde brillante con manchas oscuras (camuflaje en rocas).',
      },
      {
        title: 'Ojos grandes rojizos y camuflaje en rocas',
        sub: 'Busca ojos rojizos grandes y ten en cuenta que puede pasar desapercibida por el camuflaje.',
      },
    ],
    curiosity:
      'Es una bioindicadora de calidad hídrica: un registro en quebrada suele sugerir buen estado del agua.',
  },
}

const SCIENTIFIC_CONTENT = {
  'rhinella alata': {
    text:
      'Amphibia · Anura · Bufonidae · Rhinella alata (Cope, 1868). Rango altitudinal 0–900 msnm. Distribución: tierras bajas del Pacífico y región Caribe colombiana. Parámetros de validación: presencia de cresta cefálica reducida, diferenciación morfológica con R. horribilis por tamaño parotoideas y patrón dorsal.',
  },
  'rhinella horribilis': {
    text:
      'Amphibia · Anura · Bufonidae · Rhinella horribilis (Cope, 1862). sinónimo Bufo marinus / Bufo horribilis. Rango 0–1500 msnm. Alerta si el registro supera el rango típico documentado (1500 msnm). Diferenciación obligatoria con R. alata por tamaño y con R. marina por distribución geográfica.',
  },
  'pristimantis achatinus': {
    text:
      'Amphibia · Anura · Strabomantidae · Pristimantis achatinus (Cope, 1868). Desarrollo directo, sin estadio larvario acuático. Rango 0–2200 msnm. Alta variabilidad morfológica intraespecífica; validación requiere cotejo con series de referencia o análisis molecular para evitar confusión con especies crípticas del complejo achatinus.',
  },
  'pristimantis paisa': {
    text:
      'Amphibia · Anura · Strabomantidae · Pristimantis paisa (Lynch & Duellman, 1997). Estado IUCN: VU. Endémica de la cordillera Central de Antioquia. Rango 1500–2400 msnm. Prioridad para validación morfológica: confirmar patrón de la región gular, presencia de tubérculo metatarsal interno, y localidad dentro del rango conocido. Registro fuera del rango altitudinal o geográfico requiere revisión experta.',
  },
  'pristimantis penelopus': {
    text:
      'Amphibia · Anura · Strabomantidae · Pristimantis penelopus (Lynch, 1980). Rango 1200–2600 msnm. Distribución en cordilleras Central y Occidental de Colombia. Alta similitud con P. achatinus en zonas de simpatría; validación requiere revisión del patrón de la membrana timpánica, relación ancho/diámetro del tímpano, y preferiblemente bioacústica comparativa.',
  },
  'dendrobates truncatus': {
    text:
      'Amphibia · Anura · Dendrobatidae · Dendrobates truncatus (Cope, 1861). Aposematismo obligatorio; coloración amarillo-naranja con negro. Rango 0–1200 msnm. Distribución: región Caribe y valles interandinos bajos de Colombia. Alcaloides cutáneos (pumiliotoxinas) de origen dietario. Validación: confirmar localidad dentro del rango conocido; registros sobre 1200 msnm o fuera del Caribe / valle del Magdalena requieren revisión. Diferenciación con D. auratus y otras congéneres por patrón cromático y distribución geográfica.',
  },
  'leucostethus fraterdanieli': {
    text:
      'Amphibia · Anura · Dendrobatidae · Leucostethus fraterdanieli (Myers & Daly, 1976). Estado IUCN: EN. Endémica de Antioquia, distribución muy restringida. Todo registro es de alto valor científico. Validación obligatoria: fotografía del patrón dorsal completo, coordenadas precisas, altitud. Rango conocido 400–1100 msnm. Morfología diferencial con Allobates y otros dendrobátidos simpátricos por presencia de glándulas femorales y patrón cromático.',
  },
  'dendropsophus bogerti': {
    text:
      'Amphibia · Anura · Hylidae · Dendropsophus bogerti (Cochran & Goin, 1961). Rango 0–1000 msnm. Distribución: región Caribe y valles bajos colombianos. Validación: diferenciación de D. microcephalus por tamaño de la cabeza relativo al cuerpo, patrón del canto (frecuencia dominante y duración de nota), y localidad geográfica. Uso de bioacústica recomendado para confirmación en zona de simpatría.',
  },
  'dendropsophus microcephalus': {
    text:
      'Amphibia · Anura · Hylidae · Dendropsophus microcephalus (Cope, 1886). Rango 0–1200 msnm. Distribución amplia desde México hasta Argentina; en Colombia en todas las tierras bajas. Especie indicadora de humedales intervenidos. Validación: cabeza pequeña como carácter diagnóstico principal; confirmar ausencia de patrón reticulado en flancos que caracteriza a D. bogerti. Bioacústica: pulsos de canto más rápidos que D. bogerti.',
  },
  'hyloscirtus palmeri': {
    text:
      'Amphibia · Anura · Hylidae · Hyloscirtus palmeri (Boulenger, 1908). Estado IUCN: NT. Rango 500–2000 msnm. Distribución: cordilleras Occidental y Central de Colombia y Ecuador. Especie estrictamente asociada a ríos y quebradas de corriente rápida; bioindicadora de calidad hídrica. Validación: confirmar microhábitat torrenticola, patrón cromático verde con reticulado oscuro, y localidad dentro del rango conocido. Registros fuera de contexto ribereño o por encima de 2000 msnm requieren documentación fotográfica detallada.',
  },
}

const resolveFallbackSpecies = ({ aiClass, species }) => {
  const key = normalizeSpeciesKey(aiClass)
  if (SPECIES_FALLBACK[key]) return SPECIES_FALLBACK[key]

  // A veces la predicción puede venir solo como “epíteto” (p.ej. "horribilis")
  const epithetKey = normalizeSpeciesKey(species)
  if (epithetKey) {
    const match = Object.values(SPECIES_FALLBACK).find((v) => v.speciesEpithet === epithetKey)
    if (match) return match
  }

  // Intento adicional: si aiClass es "Genus epíteto" pero llega con espacios raros
  const parts = key.split(' ').filter(Boolean)
  if (parts.length >= 2) {
    const guess = `${parts[0]} ${parts[1]}`
    if (SPECIES_FALLBACK[guess]) return SPECIES_FALLBACK[guess]
  }

  return null
}

const tunnelThumb = (key, size = 'medium') => {
  if (!key) return '';
  const filename = String(key).split('/').pop();
  return `${API_BASE}/api/explorer/thumbnail/${size}/${filename}`;
};

const mediaUrl = (path) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  return `${base}${p}`;
};

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function ObservationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { preferences } = usePreferencesStore();
  const [obs, setObs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [highResLoaded, setHighResLoaded] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  const token = localStorage.getItem('anura_token');
  const isLoggedIn = !!token && token !== 'null' && token !== 'undefined';

  const mode = preferences?.mode || 'standard';
  const fallbackSpecies = resolveFallbackSpecies({ aiClass: obs?.ai_class, species: obs?.species })
  const commonName =
    obs?.common_name ||
    fallbackSpecies?.commonName ||
    fallbackSpecies?.scientificName?.replace(/\s*\(.*\)\s*$/, '') ||
    obs?.ai_class?.replace(/_/g, ' ') ||
    'Sin identificar'

  const scientificName =
    fallbackSpecies?.scientificName ||
    obs?.ai_class?.replace(/_/g, ' ') ||
    'Sin identificar'

  const taxonomy = {
    className: obs?.class_name || fallbackSpecies?.className || '-',
    orderName: obs?.order_name || fallbackSpecies?.orderName || '-',
    family: obs?.family || fallbackSpecies?.family || '-',
    genus: obs?.genus || fallbackSpecies?.genus || '-',
    speciesEpithet: fallbackSpecies?.speciesEpithet || '',
    synonym: fallbackSpecies?.synonym,
    iucn: fallbackSpecies?.iucn,
    altitudeTypicalRange: fallbackSpecies?.altitudeTypicalRange,
  }

  const educationKey = normalizeSpeciesKey(`${taxonomy.genus} ${taxonomy.speciesEpithet}`)
  const educationContent = EDUCATION_CONTENT[educationKey]
  const scientificContent = SCIENTIFIC_CONTENT[educationKey]

  const scrollToMap = () => {
    const el = document.getElementById('obs-map-card')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleShare = async () => {
    const url = window.location.href
    try {
      // Prefer native share if available
      if (navigator.share) {
        await navigator.share({ title: 'Anura', url })
        return
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        alert('Enlace copiado al portapapeles')
        return
      }
      window.prompt('Copia el enlace:', url)
    } catch (e) {
      // noop: share is optional
      console.warn('Share failed:', e?.message || e)
    }
  }

  useEffect(() => {
    fetchObservation();
    if (isLoggedIn) fetchLikedStatus();
  }, [id, isLoggedIn]);

  const fetchLikedStatus = async () => {
    const idKey = obsIdKey(id);
    try {
      const res = await fetch(`${API_BASE}/api/explorer/favorites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const likedIds = await res.json();
        const set = new Set(Array.isArray(likedIds) ? likedIds.map(obsIdKey) : []);
        setIsLiked(set.has(idKey));
      }
    } catch (e) { console.error('Error fetching liked status:', e); }
  };

  const handleHeart = async () => {
    const idKey = obsIdKey(id);
    if (!isLoggedIn) {
      alert('Inicia sesión para guardar favoritos');
      return;
    }
    setLikeLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/explorer/favorites/${encodeURIComponent(idKey)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { liked } = await res.json();
        setIsLiked(liked);
      }
    } catch (e) {
      console.error('Error toggling favorite:', e);
    } finally {
      setLikeLoading(false);
    }
  };

  useEffect(() => {
    setAvatarLoadError(false)
  }, [obs?.profile_image]);

  const fetchObservation = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/explorer/observation/${id}`);
      if (res.ok) {
        const data = await res.json();
        setObs(data);
      } else {
        setError('No se pudo encontrar la observación');
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="detail-loading">Cargando detalles del hallazgo...</div>;
  if (error) return (
    <div className="detail-error">
      <p><FaTriangleExclamation aria-hidden /> {error}</p>
      <button onClick={() => navigate('/explorer')} className="btn-primary">Volver al Explorador</button>
    </div>
  );

  return (
    <div className="obs-detail-view theme-aware">
      <header className="detail-header">
        <button className="btn-back" onClick={() => navigate('/explorer')}><FaArrowLeft aria-hidden /> Volver al Explorador</button>
        <h1>Detalle de Observación #{id}</h1>
      </header>

      <div className="detail-container container">
        <div className="detail-main-grid">
          
          {/* Columna Izquierda: Imagen y Taxonomía */}
          <div className="detail-card card glassmorphism">
            <div className="detail-image-wrapper">
              {/* Progressive Loading: Thumbnail first, then high-res */}
              <img
                src={tunnelThumb(obs.thumbnail_key, 'medium')}
                alt="Miniatura"
                className={`detail-thumb-placeholder ${highResLoaded ? 'hidden' : ''}`}
                onError={(e) => {
                  e.target.src = `${API_BASE}/${obs.thumbnail_key}`;
                }}
              />
              <img
                src={`${API_BASE}/${obs.image_key}`}
                alt="Hallazgo"
                className={`detail-hero-img ${highResLoaded ? 'loaded' : 'loading'}`}
                onLoad={() => setHighResLoaded(true)}
                onError={() => setHighResLoaded(true)}
              />
              {!highResLoaded && <div className="img-loader-spinner"></div>}
            </div>
            
            <div className="detail-info-section">
              <div className="detail-taxonomy">
                <p className="detail-label">Identificación</p>
                <h2 className="detail-common-name">{commonName}</h2>
                <p className="detail-scientific-name"><i>{scientificName}</i></p>
                
                <div className="taxonomical-hierarchy">
                  <div className="tax-item"><span>Clase</span><strong>{taxonomy.className}</strong></div>
                  <div className="tax-item"><span>Orden</span><strong>{taxonomy.orderName}</strong></div>
                  <div className="tax-item"><span>Familia</span><strong>{taxonomy.family}</strong></div>
                  <div className="tax-item"><span>Género</span><strong>{taxonomy.genus}</strong></div>
                </div>

                {mode === 'standard' && (
                  <div className="detail-standard-block">
                    <div className="detail-standard-row">
                      <span className="detail-standard-label">Familia</span>
                      <strong>{taxonomy.family}</strong>
                      <span className="detail-standard-label">Estado IUCN</span>
                      <strong>{taxonomy.iucn || 'N/D'}</strong>
                    </div>

                    <div className="detail-standard-row">
                      <span className="detail-standard-label">Latitud</span>
                      <strong>{obs?.lat != null ? obs.lat.toFixed(4) : 'N/A'}</strong>
                      <span className="detail-standard-label">Longitud</span>
                      <strong>{obs?.lon != null ? obs.lon.toFixed(4) : 'N/A'}</strong>
                      <span className="detail-standard-label">Altitud</span>
                      <strong>
                        {obs?.altitude_m != null && obs?.altitude_m !== ''
                          ? `${Number(obs.altitude_m).toFixed(0)} m`
                          : 'Sin dato'}
                      </strong>
                    </div>

                    <div className="detail-standard-actions">
                      <button type="button" className={`btn-secondary btn-small heart-detail-btn ${isLiked ? 'liked' : ''}`} onClick={handleHeart} disabled={likeLoading}>
                        {likeLoading ? <FaCircleNotch className="fa-spin" /> : (isLiked ? <FaHeart /> : <FaRegHeart />)}
                        {isLiked ? ' Quitar de favoritos' : ' Favorito'}
                      </button>
                      <button type="button" className="btn-secondary btn-small" onClick={scrollToMap}>
                        Ver mapa
                      </button>
                      <button type="button" className="btn-secondary btn-small" onClick={handleShare}>
                        Compartir
                      </button>
                    </div>
                  </div>
                )}

                {mode === 'educational' && (
                  <div className="detail-mode-block">
                    <p className="detail-mode-title">Modo educativo — aprende sobre esta especie paso a paso</p>
                    {educationContent ? (
                      <>
                        <h3>¿Qué es esta especie?</h3>
                        <p className="detail-mode-text">{educationContent.whatIs}</p>

                        <h3>Como aprender a identificarla</h3>
                        <ol className="detail-steps">
                          {educationContent.steps.map((s, idx) => (
                            <li key={idx}>
                              <strong>{s.title}</strong>
                              <div className="detail-step-sub">{s.sub}</div>
                            </li>
                          ))}
                        </ol>

                        <div className="detail-curiosity">
                          <strong>Dato curioso</strong>
                          <div className="detail-step-sub">{educationContent.curiosity}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3>¿Qué es esta especie?</h3>
                        <p className="detail-mode-text">
                          Usa el contexto de tu registro y la jerarquía taxonómica (Clase/Orden/Familia/Género) para orientar la identificación en campo.
                        </p>

                        <h3>Como aprender a identificarla</h3>
                        <ol className="detail-steps">
                          <li>
                            <strong>Confirma el grupo</strong>
                            <div className="detail-step-sub">Revisa Clase/Orden/Familia/Género para acotar rasgos probables.</div>
                          </li>
                          <li>
                            <strong>Compara con el hábitat</strong>
                            <div className="detail-step-sub">Ubicación y altitud ayudan a evaluar si el registro encaja.</div>
                          </li>
                          <li>
                            <strong>Observa rasgos visibles</strong>
                            <div className="detail-step-sub">Textura de piel, postura y microhábitat observado.</div>
                          </li>
                        </ol>

                        <div className="detail-curiosity">
                          <strong>Dato curioso</strong>
                          <div className="detail-step-sub">Mantén precaución: evita tocar hasta confirmar la especie.</div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {mode === 'scientific' && (
                  <div className="detail-mode-block">
                    <p className="detail-mode-title">Modo científico — identificación y validación</p>

                    {taxonomy.genus === 'Rhinella' && taxonomy.speciesEpithet === 'horribilis' && (
                      <div className="detail-alert">
                        Alerta altitudinal:{' '}
                        {obs?.altitude_m != null && obs.altitude_m !== ''
                          ? `El registro (${Number(obs.altitude_m)} msnm) supera el rango típico (1500 msnm). Requiere validación.`
                          : 'Registro sin altitud suficiente para validación altitudinal.'}
                      </div>
                    )}

                    {scientificContent && (
                      <div className="detail-scientific-template">
                        <p className="detail-scientific-text">{scientificContent.text}</p>
                      </div>
                    )}

                    <h3>Identificación taxonómica</h3>
                    <div className="scientific-tax-grid">
                      <div className="scientific-row"><span>Clase</span><strong>{taxonomy.className}</strong></div>
                      <div className="scientific-row"><span>Orden</span><strong>{taxonomy.orderName}</strong></div>
                      <div className="scientific-row"><span>Familia</span><strong>{taxonomy.family}</strong></div>
                      <div className="scientific-row"><span>Género</span><strong>{taxonomy.genus}</strong></div>
                      <div className="scientific-row"><span>Especie</span><strong>{taxonomy.speciesEpithet || '-'}</strong></div>
                      {fallbackSpecies?.synonym ? (
                        <div className="scientific-row"><span>Sinónimo</span><strong>{fallbackSpecies.synonym}</strong></div>
                      ) : null}
                    </div>

                    <h3>Datos del registro</h3>
                    <div className="scientific-tax-grid">
                      <div className="scientific-row"><span>Latitud</span><strong>{obs?.lat != null ? obs.lat : 'N/A'}</strong></div>
                      <div className="scientific-row"><span>Longitud</span><strong>{obs?.lon != null ? obs.lon : 'N/A'}</strong></div>
                      <div className="scientific-row"><span>Altitud</span><strong>{obs?.altitude_m != null && obs.altitude_m !== '' ? `${Number(obs.altitude_m)} msnm` : 'N/D'}</strong></div>
                      <div className="scientific-row"><span>Datum</span><strong>WGS84</strong></div>
                    </div>

                    <h3>Parámetros de validación</h3>
                    <div className="scientific-tax-grid">
                      <div className="scientific-row"><span>Rango alt. típico</span><strong>{taxonomy.altitudeTypicalRange ? `${taxonomy.altitudeTypicalRange.min} – ${taxonomy.altitudeTypicalRange.max} msnm` : 'N/D'}</strong></div>
                      <div className="scientific-row">
                        <span>Estado IUCN</span>
                        <strong>{taxonomy.iucn || 'N/D'}</strong>
                      </div>
                      <div className="scientific-row">
                        <span>Verificación</span>
                        <strong>Pendiente</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="detail-user-card">
                <div className="user-avatar-detail" onClick={() => navigate(`/people/${obs.username}`)} style={{ cursor: 'pointer' }}>
                  {obs.profile_image && !avatarLoadError ? (
                    <img
                      src={mediaUrl(obs.profile_image)}
                      alt="Avatar"
                      onError={() => setAvatarLoadError(true)}
                    />
                  ) : (
                    <span className="avatar-placeholder"><FaUser aria-hidden /></span>
                  )}
                </div>
                <div className="user-meta-detail">
                  <p className="username-detail">
                    Subido por <strong onClick={() => navigate(`/people/${obs.username}`)} className="detail-user-link">{obs.username}</strong>
                  </p>
                  <p className="date-detail">Fecha: {new Date(obs.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Columna Derecha: Mapa y Contexto */}
          <div className="detail-side-column">
            <div className="detail-card card glassmorphism map-card-detail" id="obs-map-card">
              <h3><FaLocationDot aria-hidden /> Ubicación y Geo-contexto</h3>
              <div className="detail-map-wrapper">
                {obs.lat && obs.lon ? (
                  <MapContainer center={[obs.lat, obs.lon]} zoom={13} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[obs.lat, obs.lon]}>
                      <Popup>Ubicación exacta</Popup>
                    </Marker>
                  </MapContainer>
                ) : (
                  <div className="no-coords">No hay coordenadas disponibles</div>
                )}
              </div>
              <div className="geo-stats">
                <div className="stat">
                  <span>Altitud (msnm, OpenTopoData)</span>
                  <strong>
                    {obs.altitude_m != null && obs.altitude_m !== ''
                      ? `${Number(obs.altitude_m).toFixed(0)} m`
                      : 'Sin dato'}
                  </strong>
                </div>
                <div className="stat">
                  <span>Latitud</span>
                  <strong>{obs.lat?.toFixed(4) || 'N/A'}</strong>
                </div>
                <div className="stat">
                  <span>Longitud</span>
                  <strong>{obs.lon?.toFixed(4) || 'N/A'}</strong>
                </div>
              </div>
            </div>

            <div className="detail-card card glassmorphism notes-card">
              <h3><FaNoteSticky aria-hidden /> Notas de campo</h3>
              <p className="obs-notes-text">
                {obs.notes || "El observador no proporcionó notas adicionales para este registro."}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
