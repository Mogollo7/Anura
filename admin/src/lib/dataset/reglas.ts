/**
 * Reglas del dataset que el panel aplica en varias pantallas. Una sola definición: si una
 * cambia, cambia en Curación, Ficha, Centroides, Validación técnica y el compilador a la vez.
 * `MIN_INDIVIDUOS` es el mismo umbral que usa dataset-service (centroides.js) para calcular
 * un centroide regional propio en vez de prestar el global.
 */
export const MIN_FOTOS_ENTRENABLE = 10;
export const MIN_INDIVIDUOS = 3;
/** Especies con al menos esta cantidad de individuos van al grupo A de Mahalanobis. */
export const GRUPO_A_MIN_INDIVIDUOS = 200;

export function esEntrenable(m: { fotosActivas: number; individuos: number }) {
  return m.fotosActivas >= MIN_FOTOS_ENTRENABLE && m.individuos >= MIN_INDIVIDUOS;
}
