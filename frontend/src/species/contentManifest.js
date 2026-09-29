// Verifica la firma Ed25519 del manifiesto del catálogo de contenido (K2: manifest + sha256 +
// firma, mismo mecanismo que usará C1 para los paquetes). Con Web Crypto (SubtleCrypto), sin
// dependencias.
//
// La clave pública está embebida aquí a propósito, no se pide al servidor: si viajara por el
// mismo canal que firma el contenido, quien controlara ese canal podría cambiar el catálogo y
// la clave a la vez, y la firma dejaría de proteger nada (mismo principio que el sha256 del
// encoder, `CONTRATO` en services/ai-service/app/worker/embeddings.py). Es la mitad pública de
// la clave que solo vive en `CONTENT_MANIFEST_PRIVATE_KEY_B64` en el .env del servidor — ver
// services/dataset-service/src/manifiesto.js. La misma clave está embebida en la app
// (ContentManifestVerifier.kt). Rotarla exige publicar una versión nueva de los dos.
const CONTENT_PUBLIC_KEY_B64 = 'IVPJ+qhfUUcbwK8T7Z0V+L5uZCwjjeg9PU/QIuL1NNY='

function base64ToBytes(b64) {
  const bin = atob(b64)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

let clavePublica = null
async function clave() {
  if (!clavePublica) {
    clavePublica = crypto.subtle.importKey('raw', base64ToBytes(CONTENT_PUBLIC_KEY_B64), { name: 'Ed25519' }, false, ['verify'])
  }
  return clavePublica
}

/**
 * 'valida' | 'invalida' | 'sin_soporte'. `sin_soporte` es el único caso donde el llamador puede
 * decidir seguir sin verificar (navegador sin Ed25519 en Web Crypto); `invalida` siempre se
 * descarta.
 */
export async function verifyManifest(manifiesto) {
  if (!manifiesto?.firma) return 'invalida'
  if (!globalThis.crypto?.subtle) return 'sin_soporte'
  try {
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      await clave(),
      base64ToBytes(manifiesto.firma),
      new TextEncoder().encode(manifiesto.sha256)
    )
    return ok ? 'valida' : 'invalida'
  } catch {
    // Ed25519 no soportado en Web Crypto de este navegador (algoritmo desconocido), no un
    // rechazo de la firma en sí.
    return 'sin_soporte'
  }
}
