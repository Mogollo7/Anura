// Catálogo de contenido publicado (K): las fichas que el herpetólogo aprobó en
// Admin → Contenido. Lo sirve dataset-service en /api/dataset/publico/catalogo
// (sin sesión; solo la copia publicada y solo fotos con licencia CC).
//
// Regla de la ficha pública: la web muestra SOLO lo publicado — un campo vacío
// no se muestra y nada se completa con datos escritos a mano. Una especie sin
// ficha publicada muestra solo su nombre y un aviso de que falta la ficha.

import { useEffect, useState } from 'react'
import { API_BASE } from '../services/api'
import { normalizeKey } from '../lib/format'
import { verifyManifest } from './contentManifest'

let pedido = null

/**
 * Una sola descarga por sesión de página. K2: primero el manifiesto firmado
 * (/publico/manifiesto), se verifica su firma Ed25519 y que el sha256 del catálogo bajado sea
 * el que se firmó; recién ahí se usa. Si algo no cuadra (o falla la red), devuelve null y la web
 * se comporta como si no hubiera fichas publicadas — nunca a medias ni sin verificar.
 */
export function fetchPublishedCatalog() {
  if (!pedido) {
    pedido = cargarVerificado().catch(() => null)
  }
  return pedido
}

async function cargarVerificado() {
  const manifiesto = await fetch(`${API_BASE}/api/dataset/publico/manifiesto`).then((r) => (r.ok ? r.json() : null))
  if (!manifiesto) return null
  const veredicto = await verifyManifest(manifiesto)
  if (veredicto === 'invalida') {
    console.error('Catálogo de contenido: firma inválida, se descarta (posible manipulación).')
    return null
  }
  if (veredicto === 'sin_soporte') {
    console.warn('Catálogo de contenido: este navegador no verifica Ed25519; se usa sin verificar la firma.')
  }
  const cuerpo = await fetch(`${API_BASE}${manifiesto.url}`).then((r) => (r.ok ? r.text() : null))
  if (!cuerpo) return null
  if (veredicto === 'valida') {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cuerpo))
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (sha256 !== manifiesto.sha256) {
      console.error('Catálogo de contenido: el sha256 no coincide con el manifiesto, se descarta.')
      return null
    }
  }
  return JSON.parse(cuerpo)
}

export function publishedPhotoUrl(sha256, ancho = 1080) {
  return `${API_BASE}/api/dataset/publico/fotos/${sha256}?ancho=${ancho}`
}

/** Entrada publicada para un nombre científico (o null si no hay ficha publicada). */
export function usePublishedSpecies(scientificName) {
  const [entry, setEntry] = useState(null)
  const [ready, setReady] = useState(false)
  const key = normalizeKey(scientificName || '')
  useEffect(() => {
    let cancelled = false
    fetchPublishedCatalog().then((cat) => {
      if (cancelled) return
      const found = cat?.especies?.find((e) => normalizeKey(e.nombre_cientifico) === key) || null
      setEntry(found)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [key])
  return { entry, ready }
}

/** Todas las entradas publicadas (lista vacía si no hay catálogo). Misma descarga que usePublishedSpecies. */
export function usePublishedSpeciesList() {
  const [list, setList] = useState([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchPublishedCatalog().then((cat) => {
      if (cancelled) return
      setList(Array.isArray(cat?.especies) ? cat.especies : [])
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return { list, ready }
}

const ACTIVIDAD = {
  diurna: 'Diurna',
  nocturna: 'Nocturna',
  crepuscular: 'Crepuscular',
  diurna_y_nocturna: 'Diurna y nocturna',
}

export const TOXICIDAD = {
  inofensiva: 'Inofensiva',
  toxica_tacto: 'Tóxica al tacto',
  toxica_ingestion: 'Tóxica si se ingiere',
}

function rango(min, max, unidad) {
  if (min != null && max != null) return `${min}–${max} ${unidad}`
  if (min != null) return `desde ${min} ${unidad}`
  if (max != null) return `hasta ${max} ${unidad}`
  return null
}

/** Forma de ficha que usan las páginas, con null donde la ficha publicada no tiene dato. */
export function publishedToSpecies(e) {
  const [genus, ...rest] = e.nombre_cientifico.split(' ')
  const m = e.morfologia || {}
  return {
    published: true,
    version: e.version,
    scientificName: e.nombre_cientifico,
    author: e.autoria || null,
    commonName: e.nombre_comun || e.nombre_cientifico,
    className: 'Amphibia',
    orderName: 'Anura',
    family: e.familia,
    genus: e.genero || genus,
    speciesEpithet: rest.join(' '),
    iucn: e.uicn?.categoria || null,
    iucnYear: e.uicn?.anio || null,
    iucnSource: e.uicn?.fuente || null,
    toxicity: e.toxicidad ? { label: TOXICIDAD[e.toxicidad.nivel], level: e.toxicidad.nivel, note: e.toxicidad.nota || null } : null,
    endemic: e.endemismo ? e.endemismo.endemica : null,
    endemicScope: e.endemismo?.alcance || null,
    altitudeRange: e.altitud_literatura
      ? { min: e.altitud_literatura.min ?? null, max: e.altitud_literatura.max ?? null, source: e.altitud_literatura.fuente || null }
      : null,
    habitat: e.habitat || null,
    activity: ACTIVIDAD[e.actividad] || null,
    diet: e.dieta || null,
    reproduction: e.reproduccion || null,
    curiosity: e.dato_curioso?.valor || null,
    threats: e.amenazas?.lista || [],
    distribution: e.distribucion || null,
    whatIs: e.descripcion || null,
    synonyms: e.sinonimos || [],
    morphology: {
      size: e.lhc ? `Longitud hocico-cloaca: ${rango(e.lhc.min, e.lhc.max, 'mm')}` : null,
      dorsal: m.patron_dorsal || null,
      ventral: m.patron_ventral || null,
      tympanum: m.timpano || null,
      discs: m.discos || null,
      folds: m.pliegues || null,
      webbing: m.membranas || null,
      diagnostics: m.diagnosticos || [],
    },
    photo: e.foto_principal
      ? { url: publishedPhotoUrl(e.foto_principal.sha256), attribution: e.foto_principal.atribucion || null, license: e.foto_principal.licencia }
      : null,
  }
}
