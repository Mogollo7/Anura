// Entorno del agente "recorrido": auth de mentira (dos cuentas de prueba, según el id del JWT),
// stubs mínimos de observation/notification/thumbnail (solo con entorno_recorrido.stubs presente),
// geo-service real (axios de mentira), dataset-service contra la base anura_recorrido y el admin en :3107.
// Puertos 39230-39239. Nada toca producción.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CON_STUBS = fs.existsSync(path.join(__dirname, 'entorno_recorrido.stubs'));
const cuentas = {
  'd81f2281-6086-435e-9de6-603f766fdf5e': { id: 'acc-a', name: 'Cuenta A', email: 'a@anura.test' },
  'e2e2e2e2-6086-435e-9de6-603f766fdf5e': { id: 'acc-b', name: 'Cuenta B', email: 'b@anura.test' },
};
const cuentaDe = (auth) => {
  try {
    const id = JSON.parse(Buffer.from(auth.split(' ')[1].split('.')[1], 'base64url').toString()).id;
    const c = cuentas[id];
    return c && { ...c, isSuperAdmin: true, permissions: {}, createdAt: '2026-09-29', userId: id };
  } catch { return null; }
};

const json = (res, obj, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

// auth de mentira (:39231)
http.createServer((req, res) => {
  const c = cuentaDe(req.headers.authorization || '');
  if (req.url.startsWith('/health')) return json(res, { ok: true });
  if (req.url.startsWith('/api/panel/me')) return c ? json(res, { account: c }) : json(res, { message: 'sin sesión' }, 401);
  if (req.url.startsWith('/api/panel/accounts')) return json(res, { accounts: Object.keys(cuentas).map((id) => cuentaDe('x.' + Buffer.from(JSON.stringify({ id })).toString('base64url') + '.y')) });
  if (CON_STUBS) {
    if (req.url.startsWith('/api/panel/usuarios')) return json(res, { usuarios: [] });
    if (req.url.startsWith('/api/panel/dispositivos')) return json(res, { dispositivos: [] });
    if (req.url.startsWith('/api/panel/auditoria')) return json(res, { entradas: [] });
    if (req.url.startsWith('/api/panel/actividad')) return json(res, { series: { actividad: [], usuarios: [], observaciones: [], identificaciones: [], sincronizaciones: [], paquetes: [] }, geo: { total: 0, points: [] } });
  }
  json(res, { message: 'no existe en el auth de prueba' }, 404);
}).listen(39231, '127.0.0.1', () => console.log('auth de prueba en :39231'));

// geo-service REAL (límites DANE y point-in-polygon locales) en :39232; solo axios va sustituido por una elevación
// de mentira (recorrido_shim) para no salir a internet. Sin DATABASE_URL: sin caché de altitudes.
const geoProc = spawn(process.execPath, ['src/index.js'], {
  cwd: 'D:/server/Anura/services/geo-service',
  env: { ...process.env, PORT: '39232', NODE_PATH: [path.join(__dirname, 'recorrido_shim/node_modules'), 'D:/server/Anura/services/dataset-service/node_modules'].join(path.delimiter) },
  stdio: 'inherit',
});

if (CON_STUBS) {
  // observation-service (:39233) y notification-service (:39236): JSON vacío.
  http.createServer((req, res) => {
    if (req.url.startsWith('/health')) return json(res, { ok: true });
    if (req.url.startsWith('/api/observations/panel')) return json(res, { observaciones: [] });
    json(res, {});
  }).listen(39233, '127.0.0.1');
  http.createServer((req, res) => {
    if (req.url.startsWith('/health')) return json(res, { ok: true });
    if (req.url.startsWith('/api/notifications/panel/avisos')) return json(res, { avisos: [] });
    json(res, {});
  }).listen(39236, '127.0.0.1');
}

const dataset = spawn(process.execPath, ['src/index.js'], {
  cwd: 'D:/server/Anura/services/dataset-service',
  env: {
    ...process.env,
    PORT: '39230',
    WORKER_TOKEN: 'token-prueba-recorrido',
    DATABASE_URL: 'postgres://postgres:prueba@127.0.0.1:55432/anura_recorrido',
    AUTH_SERVICE_URL: 'http://127.0.0.1:39231',
    GEO_SERVICE_URL: 'http://127.0.0.1:39232',
    MINIO_ENDPOINT: '127.0.0.1',
    MINIO_PORT: '39239',
    MINIO_ROOT_USER: 'prueba',
    MINIO_ROOT_PASSWORD: 'prueba-prueba',
    MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:39239',
    DATASET_BUCKET: 'anura-dataset',
  },
  stdio: 'inherit',
});

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const admin = spawn(npx, ['next', 'dev', '-p', '3107'], {
  cwd: 'D:/server/Anura/admin',
  env: {
    ...process.env,
    AUTH_SERVICE_URL: 'http://127.0.0.1:39231',
    DATASET_SERVICE_URL: 'http://127.0.0.1:39230',
    OBSERVATION_SERVICE_URL: 'http://127.0.0.1:39233',
    NOTIFICATION_SERVICE_URL: 'http://127.0.0.1:39236',
    THUMBNAIL_SERVICE_URL: 'http://127.0.0.1:39234',
    NEXT_DIST_DIR: '.next-recorrido',
  },
  stdio: 'inherit',
  shell: true,
});

const salir = () => { dataset.kill(); geoProc.kill(); admin.kill(); process.exit(0); };
process.on('SIGINT', salir);
process.on('SIGTERM', salir);
