import L from 'leaflet'

// Parche del icono por defecto de Leaflet, roto por cómo los bundlers (Vite)
// resuelven las rutas de sus imágenes. Antes se repetía este mismo bloque en
// Explorer.jsx, ObservationDetail.jsx y TaxonDetail.jsx; ahora se aplica una
// sola vez, en main.jsx, antes de que cualquier mapa se monte.
export function patchLeafletDefaultIcon() {
  delete L.Icon.Default.prototype._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  })
}
