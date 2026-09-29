// Entorno del barrido: auth stub + dataset + notification + observation + geo contra anura_barrido; admin en :3106.
const http = require('http');
const { spawn } = require('child_process');
const USER_ID = 'd81f2281-6086-435e-9de6-603f766fdf5e';
const DB = 'postgres://postgres:prueba@127.0.0.1:55432/anura_barrido';
const cuenta = { id: 'acc-prueba', name: 'Cuenta de prueba', email: 'prueba@anura.test', isSuperAdmin: true, permissions: {}, createdAt: '2026-09-28', userId: USER_ID };
http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/api/panel/me')) return res.end(JSON.stringify({ account: cuenta }));
  if (req.url.startsWith('/api/panel/accounts')) return res.end(JSON.stringify({ accounts: [cuenta] }));
  res.statusCode = 404; res.end(JSON.stringify({ message: 'no existe en el auth de prueba' }));
}).listen(39201, '127.0.0.1', () => console.log('auth de prueba en :39201'));
const base = { ...process.env, DATABASE_URL: DB, AUTH_SERVICE_URL: 'http://127.0.0.1:39201', GEO_SERVICE_URL: 'http://127.0.0.1:39203',
  MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '39209', MINIO_ROOT_USER: 'prueba', MINIO_ROOT_PASSWORD: 'prueba-prueba', MINIO_PUBLIC_ENDPOINT: 'http://127.0.0.1:39209', JWT_SECRET: 'x' };
const hijos = [];
const lanza = (svc, port) => hijos.push(spawn(process.execPath, ['src/index.js'], { cwd: 'D:/server/Anura/services/' + svc, env: { ...base, PORT: String(port) }, stdio: 'inherit' }));
lanza('dataset-service', 39200);
lanza('observation-service', 39202);
lanza('geo-service', 39203);
lanza('notification-service', 39206);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
hijos.push(spawn(npx, ['next', 'dev', '-p', '3106'], { cwd: 'D:/server/Anura/admin', env: { ...base,
  DATASET_SERVICE_URL: 'http://127.0.0.1:39200', OBSERVATION_SERVICE_URL: 'http://127.0.0.1:39202',
  NOTIFICATION_SERVICE_URL: 'http://127.0.0.1:39206', THUMBNAIL_SERVICE_URL: 'http://127.0.0.1:39204', NEXT_DIST_DIR: '.next-barrido' }, stdio: 'inherit', shell: true }));
const salir = () => { hijos.forEach((h) => h.kill()); process.exit(0); };
process.on('SIGINT', salir); process.on('SIGTERM', salir);
