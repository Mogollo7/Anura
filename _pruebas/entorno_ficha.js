// Entorno de prueba de la Ficha: auth de mentira (super), geo de mentira (altitud = lat*1000),
// dataset-service contra anura_ficha y el admin en :3101. Nada toca producción.
const http = require('http');
const { spawn } = require('child_process');
const USER_ID = 'd81f2281-6086-435e-9de6-603f766fdf5e';
const cuenta = { id: 'acc-ficha', name: 'Cuenta de prueba', email: 'prueba@anura.test', isSuperAdmin: true, permissions: {}, createdAt: '2026-09-28', userId: USER_ID };
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/api/panel/me')) return res.end(JSON.stringify({ account: cuenta }));
  if (req.url.startsWith('/api/panel/accounts')) return res.end(JSON.stringify({ accounts: [cuenta] }));
  res.statusCode = 404; res.end('{}');
}).listen(39111, '127.0.0.1');
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/api/geo/altitude') {
    const lat = Number(u.searchParams.get('lat'));
    setTimeout(() => res.end(JSON.stringify({ lat, altitude_m: Math.round(lat * 1000), source: 'opentopodata:srtm30m' })), 150);
    return;
  }
  if (u.pathname.endsWith('/ubicar')) { let b = ''; req.on('data', (c) => (b += c)); return req.on('end', () => res.end(JSON.stringify({ municipios: JSON.parse(b).puntos.map(() => '05001') }))); }
  res.statusCode = 404; res.end('{}');
}).listen(39112, '127.0.0.1');
const dataset = spawn(process.execPath, ['src/index.js'], {
  cwd: 'D:/server/Anura/services/dataset-service',
  env: { ...process.env, PORT: '39110', DATABASE_URL: 'postgres://postgres:prueba@127.0.0.1:55432/anura_ficha',
    AUTH_SERVICE_URL: 'http://127.0.0.1:39111', GEO_SERVICE_URL: 'http://127.0.0.1:39112',
    MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39009', MINIO_ROOT_USER: 'p', MINIO_ROOT_PASSWORD: 'ppppppppp', MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:39009' },
  stdio: 'inherit',
});
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const admin = spawn(npx, ['next', 'dev', '-p', '3101'], {
  cwd: 'D:/server/Anura/admin',
  env: { ...process.env, AUTH_SERVICE_URL: 'http://127.0.0.1:39111', DATASET_SERVICE_URL: 'http://127.0.0.1:39110',
    OBSERVATION_SERVICE_URL: 'http://127.0.0.1:39002', NOTIFICATION_SERVICE_URL: 'http://127.0.0.1:39006',
    THUMBNAIL_SERVICE_URL: 'http://127.0.0.1:39004', NEXT_DIST_DIR: '.next-ficha' },
  stdio: 'inherit', shell: true,
});
const salir = () => { dataset.kill(); admin.kill(); process.exit(0); };
process.on('SIGINT', salir); process.on('SIGTERM', salir);
