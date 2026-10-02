const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { limitarIntentos, _intentos, LIMITES } = require('../src/middleware/rateLimit');

function llamar(mw, { email = 'a@b.co', ip = '1.2.3.4', status = 401 } = {}) {
  const res = new EventEmitter();
  let bloqueado = null;
  res.set = () => {};
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => { bloqueado = { status: res.statusCode, body: b }; return res; };
  const req = { headers: { 'cf-connecting-ip': ip }, body: { email }, socket: {} };
  let paso = false;
  mw(req, res, () => { paso = true; });
  if (paso) { res.statusCode = status; res.emit('finish'); }
  return { paso, bloqueado };
}

test('bloquea al noveno fallo de la misma cuenta, pero no a otra cuenta', () => {
  _intentos.clear();
  const mw = limitarIntentos('login');
  for (let i = 0; i < LIMITES.MAX_POR_CUENTA; i++) assert.equal(llamar(mw).paso, true);
  const noveno = llamar(mw);
  assert.equal(noveno.paso, false);
  assert.equal(noveno.bloqueado.status, 429);
  assert.equal(llamar(mw, { email: 'otra@b.co' }).paso, true);
});

test('un éxito borra el contador de la cuenta', () => {
  _intentos.clear();
  const mw = limitarIntentos('login');
  for (let i = 0; i < LIMITES.MAX_POR_CUENTA - 1; i++) llamar(mw);
  assert.equal(llamar(mw, { status: 200 }).paso, true);
  for (let i = 0; i < LIMITES.MAX_POR_CUENTA; i++) assert.equal(llamar(mw).paso, true);
});

test('probar muchas cuentas desde una IP también se frena', () => {
  _intentos.clear();
  const mw = limitarIntentos('login');
  for (let i = 0; i < LIMITES.MAX_POR_IP; i++) assert.equal(llamar(mw, { email: `u${i}@b.co` }).paso, true);
  assert.equal(llamar(mw, { email: 'nuevo@b.co' }).paso, false);
  assert.equal(llamar(mw, { email: 'nuevo@b.co', ip: '9.9.9.9' }).paso, true);
});

test('un 429 no cuenta como fallo nuevo', () => {
  _intentos.clear();
  const mw = limitarIntentos('login');
  for (let i = 0; i < LIMITES.MAX_POR_CUENTA; i++) llamar(mw);
  for (let i = 0; i < 20; i++) llamar(mw);
  assert.equal(_intentos.get('login:cta:1.2.3.4:a@b.co').length, LIMITES.MAX_POR_CUENTA);
});
