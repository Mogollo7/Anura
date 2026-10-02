/**
 * Freno a los intentos fallidos de entrar (y de crear cuentas en bloque). Importa porque el Admin
 * ahora es público y comparte /api/auth/login con la web y la app.
 *
 * Cuenta SOLO los intentos que fallaron (respuesta 4xx distinta de 429): quien entra bien no se
 * bloquea a sí mismo, y un éxito borra el contador de esa cuenta. Memoria del proceso: hay un solo
 * auth-service; si algún día hay varios, este mismo contrato se pasa a Redis sin tocar las rutas.
 *
 *   por cuenta + IP : 8 fallos cada 10 min  → frena adivinar la contraseña de UNA cuenta
 *   por IP          : 40 fallos cada 10 min → frena probar muchas cuentas desde un sitio
 */
const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_CUENTA = 8;
const MAX_POR_IP = 40;
const MAX_ENTRADAS = 20000;

const intentos = new Map(); // clave -> number[] (marcas de tiempo de los fallos)

const ahora = () => Date.now();
function fallosVigentes(clave) {
  const lista = (intentos.get(clave) || []).filter((t) => ahora() - t < VENTANA_MS);
  if (lista.length) intentos.set(clave, lista);
  else intentos.delete(clave);
  return lista;
}

function barrer() {
  if (intentos.size <= MAX_ENTRADAS) return;
  for (const clave of intentos.keys()) fallosVigentes(clave);
  // Si aun así sigue lleno (ataque), se suelta lo más viejo en vez de crecer sin límite.
  while (intentos.size > MAX_ENTRADAS) intentos.delete(intentos.keys().next().value);
}

/** IP real: Cloudflare la manda en CF-Connecting-IP; si no, el primer X-Forwarded-For. */
function ipDe(req) {
  const h = req.headers;
  const ip = (h['cf-connecting-ip'] || h['x-forwarded-for'] || req.socket?.remoteAddress || 'desconocida').toString().split(',')[0].trim();
  return ip || 'desconocida';
}

function limitarIntentos(nombre) {
  return (req, res, next) => {
    const ip = ipDe(req);
    const id = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 200) : '';
    const clavePorIp = `${nombre}:ip:${ip}`;
    const clavePorCuenta = id ? `${nombre}:cta:${ip}:${id}` : null;

    const pasadosIp = fallosVigentes(clavePorIp);
    const pasadosCuenta = clavePorCuenta ? fallosVigentes(clavePorCuenta) : [];
    if (pasadosIp.length >= MAX_POR_IP || pasadosCuenta.length >= MAX_POR_CUENTA) {
      const mas = Math.max(
        pasadosIp.length >= MAX_POR_IP ? pasadosIp[0] : 0,
        pasadosCuenta.length >= MAX_POR_CUENTA ? pasadosCuenta[0] : 0,
      );
      const espera = Math.max(1, Math.ceil((mas + VENTANA_MS - ahora()) / 1000));
      res.set('Retry-After', String(espera));
      return res.status(429).send({ message: `Demasiados intentos. Espera ${Math.ceil(espera / 60)} min y vuelve a intentarlo.` });
    }

    res.on('finish', () => {
      if (res.statusCode === 429) return;
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (clavePorCuenta) intentos.delete(clavePorCuenta);
        return;
      }
      if (res.statusCode >= 400 && res.statusCode < 500) {
        for (const clave of [clavePorIp, clavePorCuenta]) {
          if (!clave) continue;
          const lista = intentos.get(clave) || [];
          lista.push(ahora());
          intentos.set(clave, lista);
        }
        barrer();
      }
    });
    next();
  };
}

module.exports = { limitarIntentos, ipDe, _intentos: intentos, LIMITES: { MAX_POR_CUENTA, MAX_POR_IP, VENTANA_MS } };
