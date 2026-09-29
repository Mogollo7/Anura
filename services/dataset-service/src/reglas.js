/**
 * Reglas del dataset en el servidor: espejo EXACTO de admin/src/lib/dataset/reglas.ts. Una sola
 * definición para Ficha, Validación técnica y el compilador de paquetes; la prueba del bloque 4
 * compara estos números con reglas.ts para que no diverjan.
 *
 * Foto activa = foto de la especie sin exclusión vigente (invalidar una observación excluye sus
 * fotos). Individuo = observación distinta entre esas fotos.
 */
const MIN_FOTOS_ENTRENABLE = 10;
const MIN_INDIVIDUOS = 3;

const esEntrenable = (m) => m.fotos_activas >= MIN_FOTOS_ENTRENABLE && m.individuos >= MIN_INDIVIDUOS;

module.exports = { MIN_FOTOS_ENTRENABLE, MIN_INDIVIDUOS, esEntrenable };
