// Entorno de prueba aislado: auth de mentira (super usuario), dataset-service local contra la
// base desechable, y el admin en :3099 apuntando a ambos. Nada toca producción.
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const USER_ID = 'd81f2281-6086-435e-9de6-603f766fdf5e';
const cuenta = {
  id: 'acc-prueba',
  name: 'Cuenta de prueba',
  email: 'prueba@anura.test',
  isSuperAdmin: true,
  permissions: {},
  createdAt: '2026-09-28',
  userId: USER_ID,
};

http
  .createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/api/panel/me')) return res.end(JSON.stringify({ account: cuenta }));
    if (req.url.startsWith('/api/panel/accounts')) return res.end(JSON.stringify({ accounts: [cuenta] }));
    res.statusCode = 404;
    res.end(JSON.stringify({ message: 'no existe en el auth de prueba' }));
  })
  .listen(39131, '127.0.0.1', () => console.log('auth de prueba en :39131'));

// geo de prueba: todo punto cae en Medellín (05001).
http.createServer((req, res) => {
  let c = '';
  req.on('data', (d) => (c += d));
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    const { puntos = [] } = JSON.parse(c || '{}');
    res.end(JSON.stringify({ municipios: puntos.map(() => '05001') }));
  });
}).listen(39132, '127.0.0.1');

const dataset = spawn(process.execPath, ['src/index.js'], {
  cwd: 'D:/server/Anura/services/dataset-service',
  env: {
    ...process.env,
    PORT: '39130',
    DATABASE_URL: 'postgres://postgres:prueba@127.0.0.1:55432/anura_release',
    AUTH_SERVICE_URL: 'http://127.0.0.1:39131',
    GEO_SERVICE_URL: 'http://127.0.0.1:39132',
    MINIO_ENDPOINT: '127.0.0.1',
    MINIO_PORT: '39139',
    MINIO_ROOT_USER: 'prueba',
    MINIO_ROOT_PASSWORD: 'prueba-prueba',
    MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:39139', DATASET_BUCKET: 'anura-dataset',
  },
  stdio: 'inherit',
});

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const admin = spawn(npx, ['next', 'dev', '-p', '3103'], {
  cwd: 'D:/server/Anura/admin',
  env: {
    ...process.env,
    AUTH_SERVICE_URL: 'http://127.0.0.1:39131',
    DATASET_SERVICE_URL: 'http://127.0.0.1:39130',
    OBSERVATION_SERVICE_URL: 'http://127.0.0.1:39002',
    NOTIFICATION_SERVICE_URL: 'http://127.0.0.1:39006',
    THUMBNAIL_SERVICE_URL: 'http://127.0.0.1:39004',
    NEXT_DIST_DIR: '.next-release',
  },
  stdio: 'inherit',
  shell: true,
});

const salir = () => {
  dataset.kill();
  admin.kill();
  process.exit(0);
};
process.on('SIGINT', salir);
process.on('SIGTERM', salir);
