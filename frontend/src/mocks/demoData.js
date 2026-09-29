import { SPECIES_FALLBACK } from '../species/taxonFallbackData'
import { DEMO_MEDIA_PREFIX, DEMO_USERNAME } from '../lib/demoMode'

// Especies con foto local en public/ (el resto sale sin foto a propósito:
// también hay que ver cómo se ve una tarjeta sin imagen).
const LOCAL_PHOTOS = new Set([
  'Dendrobates truncatus', 'Dendropsophus bogerti', 'Dendropsophus microcephalus',
  'Hyloscirtus palmeri', 'Leucostethus fraterdanieli', 'Pristimantis achatinus',
  'Pristimantis paisa', 'Pristimantis penelopus', 'Rhinella alata', 'Rhinella horribilis',
])

// Lugares reales de Antioquia (piloto del catálogo) con coordenadas aproximadas.
const PLACES = [
  { name: 'Reserva Río Claro, Puerto Triunfo', lat: 5.905, lon: -74.859, alt: 450 },
  { name: 'Jardín, Antioquia', lat: 5.598, lon: -75.819, alt: 1750 },
  { name: 'Parque Arví, Medellín', lat: 6.281, lon: -75.498, alt: 2500 },
  { name: 'Cañón del río Porce', lat: 6.763, lon: -75.142, alt: 900 },
  { name: 'Santa Fe de Antioquia', lat: 6.556, lon: -75.827, alt: 550 },
  { name: 'San Carlos, Antioquia', lat: 6.187, lon: -74.994, alt: 1000 },
  { name: 'Urrao, Páramo del Sol', lat: 6.317, lon: -76.136, alt: 3200 },
  { name: 'Amalfi, Antioquia', lat: 6.909, lon: -75.077, alt: 1550 },
]

const NOTES = [
  'Encontrada en hojarasca junto a la quebrada, activa después de la lluvia.',
  'Vocalizando desde la vegetación baja a unos 2 m del agua.',
  'Ejemplar juvenil, se dejó en el mismo lugar después de la foto.',
  'Varios individuos en el mismo charco temporal.',
  '',
]

const STRESS_TEXT = {
  place: 'Vereda La Esperanza del Alto de San Juan de los Andes, corregimiento de Santa Rita, municipio de Santo Domingo, Antioquia, Colombia',
  username: 'explorador_con_un_nombre_de_usuario_extremadamente_largo_sin_espacios_2026',
  note: 'Observación registrada durante un muestreo nocturno de encuentro visual (VES) en un transecto de 200 metros a lo largo de la quebrada principal. El individuo estaba perchado sobre una hoja de Heliconia a aproximadamente 1,2 metros del suelo, con coloración dorsal más oscura de lo habitual, posiblemente por la baja temperatura (16 °C) y la humedad relativa cercana al 95 %. Se tomaron fotografías dorsales, ventrales y laterales antes de liberarlo exactamente en el mismo punto. '.repeat(3).trim(),
  bio: 'Bióloga de campo apasionada por los anfibios de los Andes colombianos, con más de diez años de experiencia en muestreos nocturnos, bioacústica y monitoreo participativo en comunidades rurales de Antioquia, Chocó y el Eje Cafetero.',
  longWord: 'Supercalifragilisticoespialidosoranitadelbosquenublado',
}

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function avatar(initials, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="hsl(${hue},45%,42%)"/><text x="50%" y="54%" font-family="Arial" font-size="38" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function speciesCatalog() {
  return Object.entries(SPECIES_FALLBACK)
    .filter(([key]) => key !== 'pristimantis acanthinus') // alias de achatinus
    .map(([key, sp], i) => ({
      key,
      taxon_id: 1000 + i,
      scientific_name: sp.scientificName,
      common_name: sp.commonName,
      genus: sp.genus,
      species: sp.speciesEpithet,
      family: sp.family,
      order_name: sp.orderName,
      class_name: sp.className,
      photo: LOCAL_PHOTOS.has(sp.scientificName) ? `${DEMO_MEDIA_PREFIX}${sp.scientificName}.webp` : null,
    }))
}

function buildUsers(scenario) {
  const base = [
    { username: DEMO_USERNAME, bio: 'Registro anfibios en el oriente antioqueño los fines de semana.', hue: 140, withAvatar: true },
    { username: 'sebastianmartinez06.js', bio: 'Estudiante de biología. Bioacústica de ranas.', hue: 200, withAvatar: true },
    { username: 'jhonjonajameson_354', bio: '', hue: 20, withAvatar: false },
    { username: 'lau.herpeto', bio: 'Monitoreo participativo en Jardín.', hue: 300, withAvatar: true },
    { username: 'camilo_rios', bio: '', hue: 45, withAvatar: false },
    { username: 'ana-maria.b', bio: 'Guía de aviturismo, ahora también anuros.', hue: 260, withAvatar: true },
  ]
  if (scenario === 'stress') {
    base.push({ username: STRESS_TEXT.username, bio: STRESS_TEXT.bio, hue: 0, withAvatar: false })
    base[0].bio = STRESS_TEXT.bio
  }
  return base.map((u, i) => ({
    id: i === 0 ? 'demo-1' : `demo-u${i + 1}`,
    username: u.username,
    email: `${u.username.slice(0, 20)}@ejemplo.org`,
    biography: u.bio,
    role: 'user',
    profile_image: u.withAvatar ? avatar(u.username.slice(0, 2).toUpperCase(), u.hue) : null,
    created_at: new Date(Date.UTC(2025, i, 3 + i)).toISOString(),
  }))
}

function buildObservations(scenario, species, users) {
  const rand = mulberry32(scenario === 'stress' ? 77 : 42)
  const count = scenario === 'stress' ? 150 : 40
  const now = Date.UTC(2026, 8, 24, 18)
  const pick = (arr) => arr[Math.floor(rand() * arr.length)]
  const list = []

  for (let i = 0; i < count; i++) {
    const sp = species[i % species.length]
    const user = i < 6 ? users[0] : pick(users)
    const place = pick(PLACES)
    const created = new Date(now - Math.floor(rand() * 200 * 24) * 3600 * 1000 - i * 60000)
    const obs = {
      id: `demo-obs-${String(i + 1).padStart(3, '0')}`,
      taxon_id: sp.taxon_id,
      ai_class: sp.scientific_name.replace(/ /g, '_'),
      scientific_name: sp.scientific_name,
      common_name: sp.common_name,
      species: sp.species,
      genus: sp.genus,
      family: sp.family,
      order_name: sp.order_name,
      class_name: sp.class_name,
      thumbnail_key: sp.photo,
      image_key: null,
      audio_key: null,
      audio_duration_ms: null,
      place_guess: place.name,
      lat: +(place.lat + (rand() - 0.5) * 0.04).toFixed(5),
      lon: +(place.lon + (rand() - 0.5) * 0.04).toFixed(5),
      altitude_m: place.alt + Math.round((rand() - 0.5) * 120),
      created_at: created.toISOString(),
      recorded_at: created.toISOString(),
      username: user.username,
      profile_image: user.profile_image,
      is_private: user.username === DEMO_USERNAME ? i % 4 === 3 : false,
      notes: pick(NOTES),
      quality_grade: rand() > 0.3 ? 'research' : 'needs_id',
    }

    // Algunas observaciones traen audio (canto grabado en el registro):
    // unas pocas solo con audio (sin foto), la mayoría foto + audio, como
    // en Android (audioPath es independiente de photoTokens).
    const audioSlot = i % 9
    if (audioSlot === 0) {
      obs.thumbnail_key = null
      obs.audio_key = `demo-audio-${obs.id}`
      obs.audio_duration_ms = 8000 + Math.round(rand() * 10000)
    } else if (audioSlot === 1) {
      obs.audio_key = `demo-audio-${obs.id}`
      obs.audio_duration_ms = 6000 + Math.round(rand() * 8000)
    }

    if (scenario === 'stress') {
      const v = i % 6
      if (v === 0) { obs.place_guess = STRESS_TEXT.place; obs.notes = STRESS_TEXT.note }
      if (v === 1) { obs.common_name = null; obs.thumbnail_key = null }
      if (v === 2) { obs.lat = null; obs.lon = null; obs.place_guess = null; obs.altitude_m = null }
      if (v === 3) { obs.common_name = `${sp.common_name} ${STRESS_TEXT.longWord}` }
      if (v === 4) {
        Object.assign(obs, {
          ai_class: null, common_name: null, scientific_name: null, taxon_id: null, thumbnail_key: null,
          species: null, genus: null, family: null, order_name: null, class_name: null,
        })
      }
    }
    list.push(obs)
  }
  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

/** Conjunto de datos completo de un escenario (se genera una vez por carga). */
export function buildDemoDataset(scenario) {
  if (scenario === 'empty' || scenario === 'error') {
    return { species: [], users: buildUsers('normal').slice(0, 1), observations: [], follows: new Set(), favorites: new Set() }
  }
  const species = speciesCatalog()
  const users = buildUsers(scenario)
  const observations = buildObservations(scenario, species, users)
  const favorites = new Set(observations.filter((o) => o.username !== DEMO_USERNAME).slice(0, 5).map((o) => o.id))
  const follows = new Set(['sebastianmartinez06.js', 'lau.herpeto'])
  return { species, users, observations, follows, favorites }
}
