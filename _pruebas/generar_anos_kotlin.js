// Genera el recurso de prueba de Android: un ANOS v1 pequeño (dim 4, 3 especies) con el codificador del
// servidor (osrModelo.js) y las distancias esperadas con mahalanobis.js (el mismo cálculo que la calibración).
//   node D:/server/Anura/_pruebas/generar_anos_kotlin.js
// Salida: anura-android/app/src/test/resources/osr/anos_servidor_dim4.{bin,json} (determinista).
const fs = require('fs');
const DS = 'D:/server/Anura/services/dataset-service/src';
const M = require(`${DS}/mahalanobis.js`);
const { codificar } = require(`${DS}/osrModelo.js`);

const dim = 4;
const ids = ['COL_ANURA_0001', 'COL_ANURA_0002', 'COL_ANURA_0003'];
// Precisión simétrica definida positiva: AᵀA + I con A entera (sin aleatoriedad).
const A = [[1, 2, 0, 1], [0, 1, 1, 0], [2, 0, 1, 1], [1, 1, 0, 2]];
const P = new Float64Array(dim * dim);
for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) {
  let s = i === j ? 1 : 0;
  for (let k = 0; k < dim; k++) s += A[k][i] * A[k][j];
  P[i * dim + j] = s / 7; // escala para que las distancias queden cerca de 1
}
const medias = [[0.5, -0.25, 1.125, 0], [-1, 0.75, 0.0625, 2], [0.3333333333333333, 1.5, -2, 0.1]].map((f) => Float64Array.from(f));
const tau = 1.75;
const mediasBuf = Buffer.concat(medias.map((f) => Buffer.from(f.buffer)));
const precisionBuf = Buffer.from(P.buffer);
const modelo = codificar({ dim, tau, precision: precisionBuf, medias: mediasBuf, ids });

const muestras = [
  [0.5, -0.25, 1.125, 0], [-0.9, 0.7, 0.1, 1.9], [0.4, 1.4, -1.9, 0.2], [3, 3, 3, 3], [-0.2, 0.1, 0.5, 0.9],
].map((x, i) => {
  const { distancia, indice } = M.minimaConPrecision(Float64Array.from(x), medias, P, dim);
  return { nombre: `muestra_${i + 1}`, embedding: x, distancia, centroide_mas_cercano: ids[indice], acepta: distancia <= tau };
});
const fuera = '/d/Anura/anura-android/app/src/test/resources/osr'.replace(/^\/d\//, 'D:/');
fs.writeFileSync(`${fuera}/anos_servidor_dim4.bin`, modelo.data);
fs.writeFileSync(`${fuera}/anos_servidor_dim4.json`, `${JSON.stringify({
  formato: modelo.formato, dim, k: ids.length, tau, ids, size_bytes: modelo.size_bytes, sha256: modelo.sha256, muestras,
}, null, 2)}\n`);
console.log(`${modelo.size_bytes} bytes, sha256 ${modelo.sha256}`);
console.log(muestras.map((m) => `${m.nombre}: d=${m.distancia.toFixed(6)} → ${m.centroide_mas_cercano} ${m.acepta ? 'ACEPTA' : 'RECHAZA'}`).join('\n'));
