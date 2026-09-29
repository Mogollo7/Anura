import { useMemo } from 'react'
import { usePublishedSpeciesList } from './publishedCatalog'

// Catálogo de taxones para el @mención de comentarios — mismo concepto que
// CommentTaxonCatalog en ObservationCommentModels.kt, derivado solo de las
// fichas publicadas en Admin → Contenido. Sin fichas publicadas, no hay sugerencias.

function uniqueBy(items, key) {
  const seen = new Set()
  return items.filter((it) => {
    const k = key(it)
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Especies, géneros y familias a partir de las entradas del catálogo publicado. */
export function buildTaxonCatalog(especies) {
  const entries = uniqueBy(especies ?? [], (e) => e.nombre_cientifico).map((e) => ({
    scientificName: e.nombre_cientifico,
    commonName: e.nombre_comun || '',
    genus: e.genero || e.nombre_cientifico.split(' ')[0] || null,
    family: e.familia || null,
  }))
  return [
    ...entries.map((s) => ({
      id: `sp-${s.scientificName.toLowerCase().replace(/\s+/g, '-')}`,
      scientificName: s.scientificName,
      commonName: s.commonName,
      rank: 'species',
    })),
    ...uniqueBy(entries, (s) => s.genus).map((s) => ({
      id: `gn-${s.genus.toLowerCase()}`,
      scientificName: s.genus,
      commonName: `Género ${s.genus}`,
      rank: 'genus',
    })),
    ...uniqueBy(entries, (s) => s.family).map((s) => ({
      id: `fm-${s.family.toLowerCase()}`,
      scientificName: s.family,
      commonName: `Familia ${s.family}`,
      rank: 'family',
    })),
  ]
}

/** Catálogo de taxones para mencionar, cargado del catálogo publicado. */
export function useTaxonCatalog() {
  const { list } = usePublishedSpeciesList()
  return useMemo(() => buildTaxonCatalog(list), [list])
}

export const RANK_LABEL = { species: 'Especie', genus: 'Género', family: 'Familia' }

/** El texto después del último "@" en curso, o null si no hay mención activa. */
export function mentionQuery(text) {
  const at = text.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/\s/.test(text[at - 1])) return null
  const raw = text.slice(at + 1)
  if (raw.includes('\n') || raw.includes(' ')) return null
  return raw
}

export function filterTaxa(catalog, query) {
  const q = query.trim().toLowerCase()
  if (!q) return catalog.slice(0, 5)
  return catalog.filter(
    (t) => t.scientificName.toLowerCase().includes(q) || t.commonName.toLowerCase().includes(q),
  ).slice(0, 8)
}

export function insertTaxonMention(text, taxon) {
  const at = text.lastIndexOf('@')
  const prefix = at >= 0 ? text.slice(0, at) : text
  return `${prefix}@${taxon.scientificName} `
}
