/**
 * Matemática del rechazo Open Set, la misma que el teléfono (OpenSetModel.kt) y que el vault
 * (tools/catalog/build_covariance_release.py + fase13_calibrate_selection.py):
 *
 * - Covarianza compartida: sklearn.covariance.ledoit_wolf(X_centrado, assume_centered=True),
 *   con X_centrado = cada vector de entrenamiento menos la media de SU especie.
 * - Puntaje = distancia de Mahalanobis MÍNIMA a las medias de las especies del paquete.
 * - τ al KAR p = percentil p de los puntajes de las conocidas de calibración (numpy, lineal).
 * - AUROC = roc_auc_score(desconocida = 1, puntaje): P(puntaje desconocida > puntaje conocida).
 *
 * Todo en doble precisión, como el teléfono. Sin dependencias.
 */

/** Media cruda (sin normalizar) de un conjunto de vectores. */
function media(vectores, dim) {
  const m = new Float64Array(dim);
  for (const v of vectores) for (let d = 0; d < dim; d++) m[d] += v[d];
  for (let d = 0; d < dim; d++) m[d] /= vectores.length || 1;
  return m;
}

/**
 * Ledoit-Wolf de sklearn con assume_centered=True. `filas` ya centradas.
 * Devuelve { cov (Float64Array dim×dim), shrinkage }.
 */
function ledoitWolf(filas, dim) {
  const n = filas.length;
  if (n < 2) throw Object.assign(new Error('Hacen falta al menos 2 vectores de entrenamiento para la covarianza'), { status: 409 });
  const S = new Float64Array(dim * dim);
  let beta_ = 0;
  for (const x of filas) {
    let n2 = 0;
    for (let i = 0; i < dim; i++) {
      const xi = x[i];
      if (xi === 0) continue;
      n2 += xi * xi;
      const fila = i * dim;
      for (let j = i; j < dim; j++) S[fila + j] += xi * x[j];
    }
    beta_ += n2 * n2; // Σ_k ‖x_k‖⁴ = sum(X2ᵀ·X2)
  }
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      const v = S[i * dim + j] / n;
      S[i * dim + j] = v;
      S[j * dim + i] = v;
    }
  }
  let traza = 0;
  for (let i = 0; i < dim; i++) traza += S[i * dim + i];
  const mu = traza / dim;
  let delta_ = 0;
  for (let k = 0; k < S.length; k++) delta_ += S[k] * S[k]; // ‖S‖²_F = sum((XᵀX)²)/n²
  let beta = (1 / (dim * n)) * (beta_ / n - delta_);
  let delta = (delta_ - 2 * mu * traza + dim * mu * mu) / dim;
  beta = Math.min(beta, delta);
  const shrinkage = beta === 0 ? 0 : beta / delta;
  const cov = new Float64Array(dim * dim);
  for (let k = 0; k < S.length; k++) cov[k] = (1 - shrinkage) * S[k];
  for (let i = 0; i < dim; i++) cov[i * dim + i] += shrinkage * mu;
  return { cov, shrinkage };
}

/** Cholesky: cov = L·Lᵀ, L triangular inferior (fila mayor). */
function cholesky(cov, dim) {
  const L = new Float64Array(dim * dim);
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j <= i; j++) {
      let s = cov[i * dim + j];
      for (let k = 0; k < j; k++) s -= L[i * dim + k] * L[j * dim + k];
      if (i === j) {
        if (!(s > 0)) throw Object.assign(new Error('La covarianza no es definida positiva: faltan vectores de entrenamiento'), { status: 409 });
        L[i * dim + i] = Math.sqrt(s);
      } else {
        L[i * dim + j] = s / L[j * dim + j];
      }
    }
  }
  return L;
}

/** z = L⁻¹·x (sustitución hacia adelante). ‖z_a − z_b‖ = distancia de Mahalanobis entre a y b. */
function blanquear(L, x, dim) {
  const z = new Float64Array(dim);
  for (let i = 0; i < dim; i++) {
    let s = x[i];
    const fila = i * dim;
    for (let k = 0; k < i; k++) s -= L[fila + k] * z[k];
    z[i] = s / L[fila + i];
  }
  return z;
}

/** Precisión = cov⁻¹ = L⁻ᵀ·L⁻¹, simétrica: lo que viaja al teléfono. */
function precisionDe(L, dim) {
  const inv = new Float64Array(dim * dim); // L⁻¹, triangular inferior
  for (let j = 0; j < dim; j++) {
    inv[j * dim + j] = 1 / L[j * dim + j];
    for (let i = j + 1; i < dim; i++) {
      let s = 0;
      for (let k = j; k < i; k++) s -= L[i * dim + k] * inv[k * dim + j];
      inv[i * dim + j] = s / L[i * dim + i];
    }
  }
  const P = new Float64Array(dim * dim);
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      let s = 0;
      for (let k = j; k < dim; k++) s += inv[k * dim + i] * inv[k * dim + j];
      P[i * dim + j] = s;
      P[j * dim + i] = s;
    }
  }
  return P;
}

/** Distancia mínima (y a cuál) entre un vector blanqueado y medias blanqueadas. */
function minima(z, mediasBlancas) {
  let mejor = Infinity;
  let k = -1;
  mediasBlancas.forEach((m, i) => {
    let d2 = 0;
    for (let d = 0; d < z.length; d++) {
      const t = z[d] - m[d];
      d2 += t * t;
    }
    if (d2 < mejor) {
      mejor = d2;
      k = i;
    }
  });
  return { distancia: Math.sqrt(Math.max(0, mejor)), indice: k };
}

/** El cálculo exacto de OpenSetModel.score: √min_k (x − μ_k)ᵀ P (x − μ_k). */
function minimaConPrecision(x, medias, P, dim) {
  const diff = new Float64Array(dim);
  let mejor = Infinity;
  let k = -1;
  medias.forEach((mu, i) => {
    for (let d = 0; d < dim; d++) diff[d] = x[d] - mu[d];
    let d2 = 0;
    for (let a = 0; a < dim; a++) {
      const fila = a * dim;
      let acc = 0;
      for (let b = 0; b < dim; b++) acc += P[fila + b] * diff[b];
      d2 += diff[a] * acc;
    }
    if (d2 < mejor) {
      mejor = d2;
      k = i;
    }
  });
  return { distancia: Math.sqrt(Math.max(0, mejor)), indice: k };
}

/** numpy.percentile(xs, p) con interpolación lineal (el default). p en [0, 100]. */
function percentil(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (p / 100) * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** roc_auc_score con desconocida = positiva y el puntaje tal cual (más distancia = más desconocida). */
function auroc(conocidas, desconocidas) {
  if (!conocidas.length || !desconocidas.length) return null;
  const todos = [...conocidas.map((v) => [v, 0]), ...desconocidas.map((v) => [v, 1])].sort((a, b) => a[0] - b[0]);
  let rangos = 0;
  for (let i = 0; i < todos.length;) {
    let j = i;
    while (j + 1 < todos.length && todos[j + 1][0] === todos[i][0]) j++;
    const promedio = (i + j) / 2 + 1;
    for (let t = i; t <= j; t++) if (todos[t][1] === 1) rangos += promedio;
    i = j + 1;
  }
  const n1 = desconocidas.length;
  const n0 = conocidas.length;
  return (rangos - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

/** Fracción de puntajes ≤ τ (aceptados). */
function tasa(xs, tau) {
  if (!xs.length) return null;
  let n = 0;
  for (const x of xs) if (x <= tau) n++;
  return n / xs.length;
}

const aBytes = (arr) => Buffer.from(Float64Array.from(arr).buffer);
const deBytes = (buf) => new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

module.exports = {
  media, ledoitWolf, cholesky, blanquear, precisionDe, minima, minimaConPrecision,
  percentil, auroc, tasa, aBytes, deBytes,
};
