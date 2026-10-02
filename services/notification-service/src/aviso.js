/**
 * Avisos enriquecidos: validación del envío, el resumen que ve el teléfono y la página pública
 * (como un correo: texto, enlaces e imagen). Funciones puras, sin base de datos: se prueban solas
 * (test/aviso.test.js).
 *
 * El teléfono NO cambia: sigue leyendo title/body de notifications.notifications. Si el aviso trae
 * algo que ahí no cabe (texto largo, enlaces, imagen), el body lleva un resumen y el enlace
 * <PUBLIC_BASE_URL>/a/<token> con el contenido completo.
 */
const crypto = require('crypto');

const LIMITES = {
  titulo: 80,
  cuerpo: 4000,
  enlaces: 5,
  enlaceTexto: 60,
  enlaceUrl: 500,
  imagenBytes: 2 * 1024 * 1024,
  destinatarios: 500,
  /** Lo que se escribe tal cual en el body del teléfono cuando no hay nada más que mostrar. */
  cuerpoTelefono: 500,
  /** Resumen cuando el aviso es más que eso. */
  resumenTelefono: 300,
};

const falla = (mensaje, status = 400) => Object.assign(new Error(mensaje), { status });

const MIME_POR_FIRMA = [
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['image/gif', (b) => b.length > 6 && ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1'))],
  ['image/webp', (b) => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
];

/** URL http(s) válida y sin credenciales embebidas; devuelve la URL normalizada o lanza. */
function urlSegura(texto, campo) {
  let u;
  try {
    u = new URL(String(texto).trim());
  } catch {
    throw falla(`${campo}: no es una dirección válida.`);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw falla(`${campo}: solo se admiten enlaces http o https.`);
  if (u.username || u.password) throw falla(`${campo}: la dirección no puede llevar usuario ni contraseña.`);
  const s = u.toString();
  if (s.length > LIMITES.enlaceUrl) throw falla(`${campo}: la dirección es demasiado larga (máximo ${LIMITES.enlaceUrl}).`);
  return s;
}

function limpiarEnlaces(enlaces) {
  if (enlaces == null) return [];
  if (!Array.isArray(enlaces)) throw falla('Los enlaces van en una lista.');
  if (enlaces.length > LIMITES.enlaces) throw falla(`Hasta ${LIMITES.enlaces} enlaces por aviso.`);
  return enlaces.map((e, i) => {
    const n = i + 1;
    const url = urlSegura(e?.url ?? '', `Enlace ${n}`);
    const texto = typeof e?.texto === 'string' ? e.texto.trim() : '';
    if (!texto) throw falla(`Enlace ${n}: escribe el texto del botón.`);
    if (texto.length > LIMITES.enlaceTexto) throw falla(`Enlace ${n}: el texto va hasta ${LIMITES.enlaceTexto} caracteres.`);
    return { texto, url };
  });
}

/** { mime, base64 } → { mime, bytes, sha256 }. El tipo se decide por los bytes, no por lo que diga el cliente. */
function limpiarImagen(imagen) {
  if (imagen == null) return null;
  if (typeof imagen !== 'object' || typeof imagen.base64 !== 'string') throw falla('La imagen no llegó completa.');
  const b64 = imagen.base64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw falla('La imagen no está bien codificada.');
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length === 0) throw falla('La imagen está vacía.');
  if (bytes.length > LIMITES.imagenBytes) throw falla(`La imagen pesa más de ${LIMITES.imagenBytes / 1024 / 1024} MB.`, 413);
  const hallado = MIME_POR_FIRMA.find(([, ok]) => ok(bytes));
  if (!hallado) throw falla('La imagen debe ser JPG, PNG, WebP o GIF.');
  return { mime: hallado[0], bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

/** Normaliza y valida el cuerpo de POST /panel/avisos. No toca la base. */
function validarEnvio(body) {
  const b = body || {};
  const titulo = typeof b.titulo === 'string' ? b.titulo.trim() : '';
  const cuerpo = typeof b.cuerpo === 'string' ? b.cuerpo.replace(/\r\n/g, '\n').trim() : '';
  if (!titulo || titulo.length > LIMITES.titulo) throw falla(`El título va de 1 a ${LIMITES.titulo} caracteres.`);
  if (cuerpo.length > LIMITES.cuerpo) throw falla(`El mensaje va hasta ${LIMITES.cuerpo} caracteres.`);

  const destino = b.destino;
  if (!['todos', 'usuario', 'usuarios'].includes(destino)) throw falla('Elige a quién va el aviso.');
  let usuarioIds = [];
  if (destino === 'usuario') {
    if (!b.usuario_id) throw falla('Elige el usuario.');
    usuarioIds = [String(b.usuario_id)];
  } else if (destino === 'usuarios') {
    if (!Array.isArray(b.usuario_ids) || b.usuario_ids.length === 0) throw falla('Elige al menos un usuario.');
    usuarioIds = [...new Set(b.usuario_ids.map(String))];
    if (usuarioIds.length > LIMITES.destinatarios) throw falla(`Hasta ${LIMITES.destinatarios} usuarios por aviso.`);
  }

  const enlaces = limpiarEnlaces(b.enlaces);
  const imagen = limpiarImagen(b.imagen);
  const imagenUrl = b.imagen_url ? urlSegura(b.imagen_url, 'Imagen') : null;
  if (imagen && imagenUrl) throw falla('Usa una imagen subida o una dirección, no las dos.');
  if (imagenUrl && !imagenUrl.startsWith('https://')) throw falla('Imagen: la dirección debe ser https.');

  return { titulo, cuerpo, destino, usuarioIds, enlaces, imagen, imagenUrl, dryRun: b.vista_previa === true };
}

/** ¿Hay algo que el teléfono no puede mostrar en title/body? */
const esRico = (e) => e.cuerpo.length > LIMITES.cuerpoTelefono || e.enlaces.length > 0 || !!e.imagen || !!e.imagenUrl;

/** Corta en el último espacio antes del límite, sin dejar la frase a medias de forma fea. */
function resumir(texto, max) {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.lastIndexOf(' ', max - 1);
  return `${limpio.slice(0, corte > max * 0.6 ? corte : max - 1).replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** El body que se guarda para el teléfono y la web. */
function cuerpoTelefono(envio, url) {
  if (!esRico(envio)) return envio.cuerpo;
  const base = envio.cuerpo ? resumir(envio.cuerpo, LIMITES.resumenTelefono) : '';
  const extras = [];
  if (envio.imagen || envio.imagenUrl) extras.push('imagen');
  if (envio.enlaces.length) extras.push(envio.enlaces.length === 1 ? '1 enlace' : `${envio.enlaces.length} enlaces`);
  const pie = `Ver completo${extras.length ? ` (${extras.join(' y ')})` : ''}: ${url}`;
  return base ? `${base}\n\n${pie}` : pie;
}

const nuevoToken = () => crypto.randomBytes(16).toString('base64url');

// ── Página pública (como un correo) ──────────────────────────────────────────

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Escapa y convierte las URL http(s) sueltas del texto en enlaces. */
function textoAHtml(texto) {
  const parrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return parrafos.map((p) => {
    const html = esc(p).replace(/\n/g, '<br>').replace(/https?:\/\/[^\s<]+/g, (m) => {
      // esc() ya convirtió & en &amp;; los signos finales no son parte de la URL.
      const fin = m.match(/[.,;:!?)]+$/)?.[0] ?? '';
      const url = fin ? m.slice(0, -fin.length) : m;
      let href;
      try {
        href = new URL(url.replace(/&amp;/g, '&')).toString();
      } catch {
        return m;
      }
      return `<a href="${esc(href)}" rel="noopener noreferrer nofollow" target="_blank">${url}</a>${fin}`;
    });
    return `<p>${html}</p>`;
  }).join('\n');
}

/** HTML completo del aviso. `imagenSrc` ya es una URL segura (ruta interna o https). */
function paginaAviso(a, imagenSrc) {
  const botones = a.enlaces.map((e) =>
    `<a class="btn" href="${esc(e.url)}" rel="noopener noreferrer nofollow" target="_blank">${esc(e.texto)}</a>`).join('\n');
  const fecha = new Date(a.created_at).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' });
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(a.titulo)} · ANURA</title>
<style>
  :root { color-scheme: light dark; --bg:#eef5ee; --card:#fff; --ink:#1b1c1e; --mut:#5f6368; --acc:#1f7a33; --line:#d7e3d8; --btn:#fff; }
  @media (prefers-color-scheme: dark) { :root { --bg:#101411; --card:#1a1f1b; --ink:#f1f4f1; --mut:#a7b0a8; --acc:#4fbf6b; --line:#2b332c; --btn:#0b1d10; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:620px; margin:0 auto; padding:24px 16px 48px; }
  .marca { font-weight:800; letter-spacing:.08em; color:var(--acc); font-size:14px; margin:0 0 16px; }
  article { background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  article img { display:block; width:100%; height:auto; max-height:420px; object-fit:cover; background:var(--line); }
  .cuerpo { padding:24px; }
  h1 { font-size:24px; line-height:1.25; margin:0 0 6px; }
  .meta { color:var(--mut); font-size:13px; margin:0 0 18px; }
  p { margin:0 0 14px; overflow-wrap:anywhere; }
  a { color:var(--acc); }
  .btns { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }
  .btn { display:inline-block; background:var(--acc); color:var(--btn); text-decoration:none; font-weight:600; padding:10px 18px; border-radius:10px; }
  footer { color:var(--mut); font-size:12px; text-align:center; margin-top:20px; }
</style>
</head>
<body>
<main>
  <p class="marca">ANURA</p>
  <article>
    ${imagenSrc ? `<img src="${esc(imagenSrc)}" alt="" loading="lazy">` : ''}
    <div class="cuerpo">
      <h1>${esc(a.titulo)}</h1>
      <p class="meta">${esc(fecha)}${a.autor ? ` · ${esc(a.autor)}` : ''}</p>
      ${textoAHtml(a.cuerpo)}
      ${botones ? `<div class="btns">\n${botones}\n</div>` : ''}
    </div>
  </article>
  <footer>Aviso de ANURA</footer>
</main>
</body>
</html>`;
}

module.exports = { LIMITES, validarEnvio, esRico, resumir, cuerpoTelefono, nuevoToken, paginaAviso, textoAHtml, urlSegura, falla };
