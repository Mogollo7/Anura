/**
 * Firma del catálogo de contenido (K2): manifest + sha256 + firma, mismo mecanismo que va a
 * usar C1 para los paquetes, pero en su propio canal — el contenido se actualiza más seguido
 * que el paquete de identificación y no debe forzar ninguna recompilación.
 *
 * - `CONTENT_MANIFEST_PRIVATE_KEY_B64` (.env): PEM PKCS8 de una clave Ed25519, en base64 para
 *   que quepa en una sola línea de .env. Se genera una vez (ver .env.example) y nunca se
 *   imprime ni se manda a la app: solo firma en el servidor.
 * - La clave PÚBLICA correspondiente va embebida en la app (`ContentCatalog.kt`) y la web
 *   (`publishedCatalog.js`), no se sirve por este mismo servidor: si viajara por el mismo
 *   canal que firma, quien controlara el canal podría cambiar el catálogo y su clave a la vez,
 *   y la firma no protegería nada. Es el mismo patrón que el sha256 del encoder (`CONTRATO`).
 *
 * Qué se firma: el texto exacto que `GET /api/dataset/publico/catalogo` va a mandar, cacheado
 * por versión (el campo `generado` cambiaba en cada request si no se cacheaba, lo que hacía
 * fallar la firma en la segunda descarga aunque nada hubiera cambiado). Cambia de versión, y
 * por lo tanto de firma, solo cuando cambia el contenido publicado o los destacados vigentes.
 */
const crypto = require('crypto');

let privateKey = null;
try {
  const b64 = process.env.CONTENT_MANIFEST_PRIVATE_KEY_B64;
  if (b64) privateKey = crypto.createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'pem' });
} catch (err) {
  console.error('CONTENT_MANIFEST_PRIVATE_KEY_B64 inválida:', err.message);
}

let cache = null; // { version, cuerpoTexto, sha256, generado, firma }

/**
 * `contenido()` debe devolver { version, ...restoDelCuerpo } donde `version` identifica el
 * contenido (sha256 de especies+destacados, ya lo calcula contenido.catalogo). Si `version` no
 * cambió desde la última vez, se reusa el mismo texto y la misma firma — así una descarga
 * repetida del mismo contenido siempre trae el mismo sha256, y la firma sigue siendo válida.
 */
async function firmado(contenido) {
  // `generado` de `contenido` es el instante en que se calculó esa consulta, no el de la
  // versión firmada: se descarta y se reemplaza por el de la caché (fijo mientras no cambie
  // `version`), si no cada descarga tendría un texto distinto y la firma nunca coincidiría.
  const { version, generado: _generadoDeLaConsulta, ...resto } = contenido;
  if (cache && cache.version === version) return cache;

  const generado = new Date().toISOString();
  const cuerpoTexto = JSON.stringify({ version, generado, ...resto });
  const sha256 = crypto.createHash('sha256').update(cuerpoTexto).digest('hex');
  const firma = privateKey ? crypto.sign(null, Buffer.from(sha256, 'utf8'), privateKey).toString('base64') : null;

  cache = { version, cuerpoTexto, sha256, generado, firma };
  return cache;
}

/** true si hay clave para firmar (falta configurar en desarrollo local es aceptable; en producción es un error). */
const puedeFirmar = () => !!privateKey;

module.exports = { firmado, puedeFirmar };
