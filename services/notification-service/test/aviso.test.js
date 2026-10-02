const test = require('node:test');
const assert = require('node:assert/strict');
const a = require('../src/aviso');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const base = { titulo: 'Hola', destino: 'todos' };

test('un aviso corto va tal cual al teléfono, sin enlace', () => {
  const e = a.validarEnvio({ ...base, cuerpo: 'Mensaje corto' });
  assert.equal(a.esRico(e), false);
  assert.equal(a.cuerpoTelefono(e, 'https://x/a/t'), 'Mensaje corto');
});

test('texto largo, enlaces o imagen son ricos: el teléfono recibe resumen + enlace', () => {
  const largo = 'palabra '.repeat(200);
  const e = a.validarEnvio({ ...base, cuerpo: largo, enlaces: [{ texto: 'Ver', url: 'https://anura.juanlabs.me/x' }] });
  assert.equal(a.esRico(e), true);
  const body = a.cuerpoTelefono(e, 'https://anura.juanlabs.me/a/tok');
  assert.match(body, /Ver completo \(1 enlace\): https:\/\/anura\.juanlabs\.me\/a\/tok$/);
  assert.ok(body.length < 460, `largo ${body.length}`);
  assert.match(body, /…\n\n/);
});

test('solo imagen: el teléfono lo dice', () => {
  const e = a.validarEnvio({ ...base, imagen: { base64: PNG.toString('base64') } });
  assert.equal(e.imagen.mime, 'image/png');
  assert.match(a.cuerpoTelefono(e, 'https://x/a/t'), /^Ver completo \(imagen\): /);
});

test('rechaza lo que no debe', () => {
  const malo = (extra, re) => assert.throws(() => a.validarEnvio({ ...base, ...extra }), re);
  malo({ titulo: '' }, /título/);
  malo({ titulo: 'x'.repeat(81) }, /título/);
  malo({ destino: 'otro' }, /a quién/);
  malo({ destino: 'usuario' }, /Elige el usuario/);
  malo({ destino: 'usuarios', usuario_ids: [] }, /al menos un usuario/);
  malo({ enlaces: [{ texto: 'x', url: 'javascript:alert(1)' }] }, /http o https/);
  malo({ enlaces: [{ texto: 'x', url: 'https://u:p@sitio.com' }] }, /usuario ni contraseña/);
  malo({ enlaces: [{ texto: '', url: 'https://sitio.com' }] }, /texto del botón/);
  malo({ enlaces: Array(6).fill({ texto: 'a', url: 'https://a.com' }) }, /Hasta 5/);
  malo({ imagen: { base64: Buffer.from('no soy una imagen').toString('base64') } }, /JPG, PNG, WebP o GIF/);
  malo({ imagen: { base64: 'a'.repeat(3 * 1024 * 1024) } }, /pesa más/);
  malo({ imagen_url: 'http://sitio.com/a.png' }, /https/);
  malo({ imagen_url: 'https://sitio.com/a.png', imagen: { base64: PNG.toString('base64') } }, /no las dos/);
});

test('el tipo de imagen se decide por los bytes, no por el cliente', () => {
  const e = a.validarEnvio({ ...base, imagen: { mime: 'image/jpeg', base64: `data:image/jpeg;base64,${PNG.toString('base64')}` } });
  assert.equal(e.imagen.mime, 'image/png');
});

test('la página escapa HTML y solo enlaza http(s)', () => {
  const html = a.paginaAviso({
    titulo: '<script>alert(1)</script>', cuerpo: 'Mira https://anura.juanlabs.me/x?a=1&b=2. Fin <b>x</b>',
    enlaces: [{ texto: '"><img src=x onerror=1>', url: 'https://sitio.com/?q=1&r=2' }], autor: 'Ana', created_at: new Date('2026-09-30T12:00:00Z'),
  }, null);
  assert.ok(!html.includes('<script>alert'));
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(!/<img src=x/.test(html));
  assert.match(html, /href="https:\/\/anura\.juanlabs\.me\/x\?a=1&amp;b=2"/);
  assert.match(html, /rel="noopener noreferrer nofollow"/);
  assert.match(html, /noindex/);
});

test('resumir corta en palabra y añade …', () => {
  const r = a.resumir('uno dos tres cuatro cinco seis siete ocho nueve diez', 25);
  assert.ok(r.endsWith('…') && r.length <= 26, r);
  assert.equal(a.resumir('corto', 25), 'corto');
});

test('los tokens son largos y distintos', () => {
  const t = new Set(Array.from({ length: 200 }, a.nuevoToken));
  assert.equal(t.size, 200);
  assert.ok([...t].every((x) => /^[A-Za-z0-9_-]{22}$/.test(x)));
});
