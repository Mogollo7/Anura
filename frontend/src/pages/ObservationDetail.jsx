import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { FaArrowLeft, FaLocationDot, FaNoteSticky, FaTriangleExclamation, FaUser, FaHeart, FaRegHeart, FaCircleNotch, FaLock } from 'react-icons/fa6';
import { FaSearch, FaPalette } from 'react-icons/fa';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { usePreferencesStore } from '../store/preferencesStore';
import { obsIdKey } from '../lib/observationIds';
import './ObservationDetail.css';
import LoadingSpinner from '../components/LoadingSpinner';
import BackButton from '../components/BackButton';

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
    commonName: 'Cutín Común de Occidente',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Craugastoridae',
    genus: 'Pristimantis',
    speciesEpithet: 'achatinus',
    iucn: 'LC',
    altitudeTypicalRange: { min: 10, max: 1900 },
  },
  'pristimantis acanthinus': {
    scientificName: 'Pristimantis achatinus (Cope, 1868)',
    commonName: 'Cutín Común de Occidente',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Craugastoridae',
    genus: 'Pristimantis',
    speciesEpithet: 'achatinus',
    iucn: 'LC',
    altitudeTypicalRange: { min: 10, max: 1900 },
  },
  'pristimantis paisa': {
    scientificName: 'Pristimantis paisa (Lynch & Duellman, 1997)',
    commonName: 'Pristimantis paisa',
    className: 'Amphibia',
    orderName: 'Anura',
    family: 'Craugastoridae',
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
    family: 'Craugastoridae',
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
      'La Pristimantis achatinus es un pequeño y fascinante anfibio neotropical. A diferencia de otras ranas, no pasa por la etapa de renacuajo en el agua; sus huevos tienen desarrollo directo, lo que significa que de ellos nacen directamente ranitas completamente formadas. Es una especie muy adaptable que habita desde bosques hasta cultivos de café y plátano.',
    steps: [
      {
        title: <><FaSearch style={{marginRight: '8px'}} />Características Físicas</>,
        sub: 'El tamaño importa: Es una rana de tamaño mediano-pequeño. Los machos miden entre 30 y 40 mm, mientras que las hembras son notablemente más grandes, alcanzando entre 48 y 64 mm.\nLa textura de la piel: Su espalda (dorso) es lisa o moderadamente rugosa, pero la clave está en su vientre, que es completamente liso (a diferencia de otras primas del género que lo tienen granulado o areolado).\nSin pliegues: No posee tubérculos (pequeños "cuernos") en los párpados ni en los talones.\nSus manos: El primer dedo de su mano es más largo que el segundo, y las puntas de sus dedos tienen discos expandidos para aferrarse a la vegetación.',
      },
      {
        title: <><FaPalette style={{marginRight: '8px'}} />El "Engaño" del Color (Patrón Variable)</>,
        sub: 'Esta especie es un reto porque es "polimórfica" (cambia mucho de color entre individuos). Enséñale a tus usuarios a buscar estos rasgos constantes:\nEl Fondo: Puede ser de color amarillo, gris, café rojizo o café oscuro.\nLas Piernas: La parte posterior de sus muslos es amarilla o gris azulada, siempre decorada con manchas o barras negras bien definidas.\nLos Ojos: Su iris es de color amarillo pálido con finas manchas negras y una franja horizontal roja que lo cruza por el medio.',
      }
    ],
    curiosity:
      '¿Sabías que...? Los machos de esta especie cantan activamente durante la noche desde la vegetación baja (a menos de un metro del suelo) para atraer a las hembras, especialmente en los bordes de riachuelos húmedos.',
    table: [
      { label: 'Nombre Científico', value: 'Pristimantis achatinus' },
      { label: 'Nombres Comunes', value: 'Cutín Común de Occidente, Rana de pastizal, Rana ladrona de Cachabí' },
      { label: 'Distribución', value: 'Desde el este de Panamá, cruzando por Colombia, hasta el occidente de Ecuador. Altitud general: 225-900 msnm.' },
      { label: 'Rango Altitudinal', value: '10 - 1900 msnm (Fuente: Listado de especies de fauna silvestre, en la jurisdicción de los 80 municipios de Corantioquia)' },
      { label: 'Hábitat', value: 'Bosques tropicales, bordes de caminos, potreros y plantaciones (café, cacao, banano).' },
      { label: 'Comportamiento', value: 'Es principalmente terrestre y de actividad nocturna. Durante el día se esconde bajo rocas o troncos húmedos.' },
      { label: 'Estado de Conservación', value: 'Preocupación Menor (LC). Es una especie común y de poblaciones estables.' },
    ],
    images: ['/pristimantis_achatinus_guide.png']
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
      'Rhinella alata es un sapo pequeño de hábitos terrestres perteneciente a la familia Bufonidae. Se caracteriza por su cuerpo robusto, coloración café o marrón con patrones oscuros y una distintiva cresta o “ala” sobre la cabeza. Habita bosques húmedos tropicales de Centroamérica y parte del norte de Sudamérica, donde suele encontrarse entre la hojarasca alimentándose de pequeños invertebrados.',
  },
  'rhinella horribilis': {
    text:
      'El sapo de caña mesoamericano (Rhinella horribilis) es una de las especies de anfibios que componen el género Rhinella, que se incluye en la familia de los bufónidos. Este anuro es de tamaño grande y de hábitos terrestres. Se distribuye de manera nativa desde el extremo sur de Estados Unidos por el norte, hasta el extremo norte del Perú por el sur. Durante décadas fue considerado un sinónimo más moderno del sapo de caña amazónico (R. marina), hasta que en 2016 se lo rehabilitó como especie plena.',
  },
  'pristimantis achatinus': {
    text:
      'Pristimantis achatinus es una especie de anfibio anuro de la familia Craugastoridae. Se encuentra en Colombia, Ecuador y Panamá. Su hábitat natural son los bosques húmedos subtropicales o tropicales de tierras bajas, bosques húmedos de montañas tropicales o subtropicales, plantaciones, gardens rurales, áreas urbanas y zonas previamente boscosas ahora muy degradadas.',
  },
  'pristimantis paisa': {
    text:
      'Pristimantis paisa es una especie de anfibio anuro endémica del departamento de Antioquia, Colombia, perteneciente a la familia Craugastoridae. Habita bosques montanos húmedos entre los 1800 y 3100 metros de altitud, donde presenta hábitos nocturnos. Esta rana cumple un papel importante en el equilibrio ecológico de los ecosistemas andinos, aunque actualmente enfrenta amenazas debido a la pérdida y degradación de su hábitat natural.',
  },
  'pristimantis penelopus': {
    text:
      'Pristimantis penelopus es una especie de anfibio anuro de la familia Craugastoridae. Esta especie es endémica de la ladera oriental de la Cordillera Central en Colombia. Habita en los departamentos de Antioquia, Tolima y Caldas entre 1 180 y 1 500 m de altitud.',
  },
  'dendrobates truncatus': {
    text:
      'Dendrobates truncatus es una rana pequeña de colores llamativos perteneciente a la familia Dendrobatidae. Presenta tonalidades negras con líneas o manchas amarillas, verdes o azuladas que advierten sobre su toxicidad. Habita bosques húmedos tropicales, especialmente en Colombia, donde vive cerca del suelo entre la hojarasca y zonas húmedas. Se alimenta principalmente de pequeños insectos y otros artrópodos.',
  },
  'leucostethus fraterdanieli': {
    text:
      'Leucostethus fraterdanieli es una rana pequeña de la familia Dendrobatidae, caracterizada por su coloración discreta en tonos marrones y líneas claras a lo largo del cuerpo. Habita bosques húmedos tropicales de Colombia, generalmente cerca de quebradas y zonas con abundante hojarasca. Es una especie diurna que se alimenta de pequeños invertebrados y cumple un papel importante en el equilibrio ecológico de los ecosistemas donde vive.',
  },
  'dendropsophus bogerti': {
    text:
      'Dendropsophus bogerti es una especie de anfibios de la familia Hylidae. Es endémica de Colombia. Sus hábitats naturales incluyen montanos secos, marismas de agua dulce, corrientes intermitentes de agua, tierra arable, pastos, plantaciones, jardines rurales, áreas urbanas, zonas previamente boscosas ahora muy degradadas, estanques y tierras de irrigación.',
  },
  'dendropsophus microcephalus': {
    text:
      'La ranita mísera (Dendropsophus microcephalus) es una especie de anfibio de la familia Hylidae.[2] La cabeza es plana y el hocico es redondeado y corto. Los ojos tienen pupilas elípticas dispuestas horizontalmente. Las fosas nasales están dirigidas lateralmente y el área entre las fosas nasales es algo cóncava. Esta especie puede someterse a un cambio de color. Durante la noche, el dorso es de color amarillo claro con varias marcas de color marrón o marrón claro. Durante el día, el dorso es de color tostado, amarillo o marrón claro con manchas más oscuras marrones o rojas. Esta rana tiene uniformemente muslos amarillos con una línea marrón, a menudo rodeadas de una estrecha línea blanca que se extiende desde la fosa nasal para la ventilación.',
  },
  'hyloscirtus palmeri': {
    text:
      'La rana torrente de Palmer o rana arborícola de Palmer (Hyloscirtus palmeri) es una especie de anfibios de la familia Hylidae.[1] Habita en Colombia, Costa Rica, Ecuador y Panamá. Sus hábitats naturales incluyen bosques tropicales o subtropicales secos y a baja altitud, montanos secos y ríos. Está amenazada por la destrucción de su hábitat natural.',
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
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

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

  const isAchatinus = (obs?.ai_class || '').toLowerCase().includes('achatinus') || 
                      (obs?.species || '').toLowerCase().includes('achatinus') ||
                      (obs?.ai_class || '').toLowerCase().includes('acanthinus') || 
                      (obs?.species || '').toLowerCase().includes('acanthinus');

  const taxonomy = {
    className: obs?.class_name || fallbackSpecies?.className || 'Amphibia',
    orderName: obs?.order_name || fallbackSpecies?.orderName || 'Anura',
    family: obs?.family || fallbackSpecies?.family || (isAchatinus ? 'Craugastoridae' : '-'),
    genus: obs?.genus || fallbackSpecies?.genus || (isAchatinus ? 'Pristimantis' : '-'),
    speciesEpithet: fallbackSpecies?.speciesEpithet || (isAchatinus ? 'achatinus' : ''),
    synonym: fallbackSpecies?.synonym,
    iucn: fallbackSpecies?.iucn,
    altitudeTypicalRange: fallbackSpecies?.altitudeTypicalRange,
  }

  let educationKey = normalizeSpeciesKey(`${taxonomy.genus} ${taxonomy.speciesEpithet}`.trim())
  if (educationKey === 'pristimantis acanthinus') educationKey = 'pristimantis achatinus';
  let educationContent = EDUCATION_CONTENT[educationKey]
  if (educationContent && taxonomy.genus && taxonomy.speciesEpithet && taxonomy.genus !== 'Indeterminado') {
    educationContent = { 
      ...educationContent, 
      images: [`/${taxonomy.genus} ${taxonomy.speciesEpithet}.webp`] 
    };
  }
  const scientificContent = SCIENTIFIC_CONTENT[educationKey]

  useEffect(() => {
    if (isLoggedIn && obs?.username) {
      fetchFollowStatus(obs.username);
    }
  }, [obs?.username, isLoggedIn]);

  const fetchFollowStatus = async (username) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/follow/${username}/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.following);
      }
    } catch (e) { console.error('Error fetching follow status:', e); }
  };

  const handleFollow = async () => {
    if (!isLoggedIn) {
      alert('Inicia sesión para seguir a otros exploradores');
      return;
    }
    setFollowLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/follow/${obs.username}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIsFollowing(data.following);
      }
    } catch (e) {
      console.error('Error toggling follow:', e);
    } finally {
      setFollowLoading(false);
    }
  };

  const getTaxonSlug = (taxonId, sciName) => {
    if (!sciName || sciName === 'Sin identificar') return null;
    const id = taxonId || 0;
    const nameSlug = sciName.replace(/\s*\(.*\)\s*$/, '').trim().replace(/\s+/g, '-');
    return `/taxa/${id}-${nameSlug}`;
  };

  const taxonLink = getTaxonSlug(obs?.taxon_id, scientificName);

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
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`${API_BASE}/api/explorer/observation/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setObs(data);
      } else {
        if (res.status === 403) {
          setError('Esta observación es privada');
        } else {
          setError('No se pudo encontrar la observación');
        }
      }
    } catch (err) {
      setError('Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner text="Cargando detalles del hallazgo..." />;
  if (error) return (
    <div className="detail-error">
      <p><FaTriangleExclamation aria-hidden /> {error}</p>
      <button onClick={() => navigate('/explorer')} className="btn-primary">Volver al Explorador</button>
    </div>
  );

  return (
    <div className="obs-detail-view theme-aware">
      <header className="detail-header">
        <div className="container header-flex-row">
          <BackButton to="/explorer" noWrapper className="header-back-inline" />
          <div className="detail-header-titles">
            {taxonLink ? (
              <Link to={taxonLink} className="detail-title-link">
                <h1 className="detail-main-title">
                  {commonName}
                  {obs?.is_private && <FaLock className="title-private-icon" title="Observación privada" style={{ marginLeft: '8px', fontSize: '0.8em', color: '#e67e22', verticalAlign: 'middle' }} />}
                </h1>
                <span className="detail-subtitle">({scientificName})</span>
              </Link>
            ) : (
              <>
                <h1 className="detail-main-title">
                  {commonName}
                  {obs?.is_private && <FaLock className="title-private-icon" title="Observación privada" style={{ marginLeft: '8px', fontSize: '0.8em', color: '#e67e22', verticalAlign: 'middle' }} />}
                </h1>
                <span className="detail-subtitle">({scientificName})</span>
              </>
            )}
          </div>
          <div className="header-actions">
            <button type="button" className={`btn-secondary btn-icon heart-header-btn ${isLiked ? 'liked' : ''}`} onClick={handleHeart} disabled={likeLoading} aria-label="Favorito">
              {likeLoading ? <FaCircleNotch className="fa-spin" /> : (isLiked ? <FaHeart /> : <FaRegHeart />)}
            </button>
          </div>
        </div>
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
                <h2 className="detail-common-name">
                  {taxonLink ? (
                    <Link to={taxonLink} className="taxon-link-hover">{commonName}</Link>
                  ) : commonName}
                </h2>
                <p className="detail-scientific-name">
                  {taxonLink ? (
                    <Link to={taxonLink} className="taxon-link-hover"><i>{scientificName}</i></Link>
                  ) : <i>{scientificName}</i>}
                </p>
                
                <div className="taxonomical-hierarchy">
                  <div className="tax-item"><span>Clase</span><strong>{taxonomy.className}</strong></div>
                  <div className="tax-item"><span>Orden</span><strong>{taxonomy.orderName}</strong></div>
                  <div className="tax-item"><span>Familia</span><strong>{taxonomy.family}</strong></div>
                  <div className="tax-item"><span>Género</span><strong>{taxonomy.genus}</strong></div>
                </div>

                {mode === 'standard' && (
                  <div className="detail-standard-block">
                    {scientificContent ? (
                      <p className="detail-scientific-text-standard">
                        {scientificContent.text}
                        {taxonLink && (
                          <Link to={taxonLink} className="read-more-link"> Leer más...</Link>
                        )}
                      </p>
                    ) : (
                      <p className="detail-scientific-text-standard">No hay información descriptiva disponible para esta especie.</p>
                    )}
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
                        <div className="detail-accordions">
                          {educationContent.steps.map((s, idx) => (
                            <details key={idx} className="educational-accordion">
                              <summary className="accordion-summary"><strong>{s.title}</strong></summary>
                              <div className="accordion-content">
                                {s.sub.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                              </div>
                            </details>
                          ))}
                        </div>

                        {educationContent.table && (
                          <>
                            <h3>Datos de un Vistazo (Ficha Técnica)</h3>
                            <div className="educational-table-wrapper">
                              <table className="educational-table">
                                <tbody>
                                  {educationContent.table.map((row, idx) => (
                                    <tr key={idx}>
                                      <th>{row.label}</th>
                                      <td>{row.value}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}

                        {educationContent.curiosity && (
                          <div className="detail-curiosity">
                            <strong>Dato curioso</strong>
                            <div className="detail-step-sub">{educationContent.curiosity}</div>
                          </div>
                        )}

                        {educationContent.images && (
                          <>
                            <h3>Galería de Variación e Identificación</h3>
                            <div className="educational-gallery">
                              {educationContent.images.map((imgSrc, idx) => (
                                <img key={idx} src={imgSrc} alt={`Guía visual ${idx+1}`} className="educational-img" />
                              ))}
                            </div>
                          </>
                        )}
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

            </div>
          </div>

          {/* Columna Derecha: Mapa y Contexto */}
          <div className="detail-side-column">
            {/* User info at the top of the sidebar */}
            <div className="detail-card card glassmorphism user-sidebar-card">
              <div className="user-sidebar-flex">
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
                  <strong onClick={() => navigate(`/people/${obs.username}`)} className="detail-user-link">{obs.username}</strong>
                  <p className="user-obs-count">{obs.user_obs_count || 0} observaciones</p>
                </div>
                <button 
                  className={`btn-secondary btn-small follow-btn-sidebar ${isFollowing ? 'following' : ''}`} 
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? 'Cargando...' : (isFollowing ? 'Siguiendo' : 'Seguir')}
                </button>
              </div>
              <div className="obs-date-row">
                <span className="date-detail">Observado el {new Date(obs.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
            </div>

            <div className="detail-card card glassmorphism map-card-detail" id="obs-map-card">
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
