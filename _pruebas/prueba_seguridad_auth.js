// Prueba de seguridad de auth-service (despliegue-seguridad). Base desechable anura_despliegue, rol auth_service.
// Uso: node prueba_seguridad_auth.js [ruta-a-auth-service/src]   (por defecto, el código actual)
// Con el código de HEAD demuestra el fallo; con el actual, que ya no ocurre.
const path = require('path');
const assert = require('assert');
const SRC = path.resolve(process.argv[2] || 'D:/server/Anura/services/auth-service/src');
process.env.DATABASE_URL = 'postgres://auth_service:p@127.0.0.1:55432/anura_despliegue';
process.env.JWT_SECRET = 'prueba-seguridad';
const { Pool } = require('D:/server/Anura/_pruebas/node_modules/pg');
const jwt = require('D:/server/Anura/_pruebas/node_modules/jsonwebtoken');
const admin = new Pool({ connectionString: 'postgres://postgres:prueba@127.0.0.1:55432/anura_despliegue' });
const authService = require(path.join(SRC, 'services/authService.js'));
const panelService = require(path.join(SRC, 'services/panelService.js'));

const SUPER = 'sebastianmartinez06.js@gmail.com'; // sembrado por phase3.sql
let ok = 0;
async function limpiar() {
  const quien = "SELECT id FROM auth.users WHERE email ILIKE '%@seg.test' OR lower(email) = $1";
  await admin.query(`DELETE FROM audit.log WHERE actor_id IN (${quien})`, [SUPER]).catch(() => {});
  await admin.query('UPDATE auth.panel_accounts SET user_id = NULL WHERE lower(email) = $1', [SUPER]);
  await admin.query("DELETE FROM auth.panel_accounts WHERE email LIKE '%@seg.test'");
  await admin.query("DELETE FROM auth.users WHERE email ILIKE '%@seg.test' OR lower(email) = $1", [SUPER]);
}
const t = async (nombre, fn) => { try { await fn(); ok++; console.log('  ok  ', nombre); } catch (e) { console.log('  FALLA', nombre, '->', e.message.split('\n')[0]); process.exitCode = 1; } };
const decodificar = (token) => jwt.verify(token, process.env.JWT_SECRET);

(async () => {
  await limpiar();

  console.log('Panel: la cuenta es de una persona, no de un correo');
  const real = await authService.registrar({ email: SUPER, password: 'clave-larga-1', username: 'super_real' });
  const loginReal = await authService.login({ email: SUPER, password: 'clave-larga-1' });
  await t('la dueña entra al panel y queda atada a su user_id', async () => {
    const acc = await panelService.getMe(decodificar(loginReal.token));
    assert.ok(acc && acc.isSuperAdmin);
    assert.strictEqual(acc.userId, real.id);
  });
  await t('registrarse con el mismo correo en otras mayúsculas NO crea otra cuenta', async () => {
    let creada = null;
    try { creada = await authService.registrar({ email: SUPER.toUpperCase(), password: 'x-larga-2', username: 'intruso' }); } catch (e) { assert.match(e.message, /ya está registrado/); }
    assert.strictEqual(creada, null, 'se creó una segunda cuenta con el correo de la super usuaria');
  });
  await t('aun si esa segunda cuenta existiera (dato viejo), su token NO abre el panel', async () => {
    const { rows: [u] } = await admin.query(
      "INSERT INTO auth.users (username, email, password_hash) VALUES ('intruso_viejo', $1, 'x') RETURNING id, email", [SUPER.toUpperCase()]);
    const tokenIntruso = jwt.sign({ id: u.id, email: u.email, username: 'intruso_viejo', role: 'user' }, process.env.JWT_SECRET);
    const acc = await panelService.getMe(decodificar(tokenIntruso));
    assert.strictEqual(acc, null, 'el intruso heredó la cuenta del panel de la super usuaria');
    await admin.query('DELETE FROM auth.users WHERE id = $1', [u.id]);
  });
  await t('el login con otras mayúsculas encuentra a la dueña (no a un duplicado)', async () => {
    const r = await authService.login({ email: SUPER.toUpperCase(), password: 'clave-larga-1' });
    assert.strictEqual(r.user.id, real.id);
  });

  await t('crear cuenta del panel para alguien YA registrada la ata en el acto', async () => {
    const u = await authService.registrar({ email: 'ana@seg.test', password: 'clave-larga-3', username: 'ana_seg' });
    const cuenta = await panelService.create({ name: 'Ana', email: 'ana@seg.test', template: 'herpetologo' }, { id: null, userId: real.id });
    assert.strictEqual(cuenta.userId, u.id);
  });
  await t('cuenta del panel de alguien que aún no se registra: la primera persona con ese correo la toma, y solo ella', async () => {
    await panelService.create({ name: 'Beto', email: 'beto@seg.test', template: 'herpetologo' }, { id: null, userId: real.id });
    const beto = await authService.registrar({ email: 'Beto@seg.test', password: 'clave-larga-4', username: 'beto_seg' });
    const tk = jwt.sign({ id: beto.id, email: beto.email }, process.env.JWT_SECRET);
    const acc = await panelService.getMe(decodificar(tk));
    assert.ok(acc && acc.userId === beto.id);
    // otra cuenta con el correo en otras mayúsculas ya no puede
    const { rows: [otra] } = await admin.query("INSERT INTO auth.users (username, email, password_hash) VALUES ('beto_dup', 'BETO@seg.test', 'x') RETURNING id");
    assert.strictEqual(await panelService.getMe({ id: otra.id, email: 'BETO@seg.test' }), null);
  });

  console.log('Perfil público');
  await t('GET /api/auth/public/:username no devuelve correo ni datos internos', async () => {
    const p = await authService.getPublicProfile('super_real');
    assert.deepStrictEqual(Object.keys(p.user).sort(), ['biography', 'id', 'profile_image', 'role', 'username']);
    assert.ok(!JSON.stringify(p).includes('@'), 'el correo salió en el perfil público');
  });

  console.log('Arranque');
  const { spawnSync } = require('child_process');
  for (const [nombre, cmd] of [
    ['auth-service', `require(${JSON.stringify(path.join(SRC, 'core/config.js'))})`],
  ]) {
    await t(`${nombre} no arranca sin JWT_SECRET`, async () => {
      const env = { ...process.env }; delete env.JWT_SECRET;
      const r = spawnSync(process.execPath, ['-e', cmd], { env, encoding: 'utf8' });
      assert.strictEqual(r.status, 1, `salió con ${r.status}`);
    });
  }

  await limpiar();
  await admin.end();
  console.log(process.exitCode ? `\nHAY FALLAS (${ok} bien)` : `\nTODO BIEN: ${ok} comprobaciones`);
  process.exit(process.exitCode || 0);
})().catch((e) => { console.error(e); process.exit(1); });
