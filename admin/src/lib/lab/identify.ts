import type { PackageManifest } from "@/lib/compiler/compile";
import type { ClusterGate, Estado, PackageCalib } from "@/lib/osr/osr";
import { idealFor, pAltitud, percentile, UMBRAL_GEO_DEFAULT } from "@/lib/osr/osr";
import { SUBSTRATO_LABEL, type Substrato } from "@/lib/mock/curation";
import { cosine } from "@/lib/centroids/embedding-sim";

/**
 * Simulador de identificación (plan fase 10, F24). Corre UNA foto —embedding,
 * altitud y sustrato— contra el JSON que ya se publicó. No recalibra y no
 * escribe: si el τ o la cota están mal unidos, se ve aquí antes de que el
 * teléfono lo reciba.
 *
 * Los umbrales salen del release. La geometría (centroides simulados y
 * Mahalanobis) sale de la misma calibración que usó OSR, porque el JSON guarda
 * los vectores como marcador de posición. Mahalanobis se compara y no viaja.
 */

export type ProbeGrupo = PackageCalib["vectores"][number]["grupo"];

export type ProbeGrupoResumen = {
  origen: string;
  nombre: string;
  grupo: ProbeGrupo;
  genero: string;
  familia: string;
  fotos: number;
};

export type IdentifyCode =
  | "00_MATCH_OK"
  | "STATUS_GENUS"
  | "STATUS_FAMILY"
  | "01_OSR_GLOBAL"
  | "02_OSR_CLUSTER"
  | "03_OSR_GEO_FAIL";

export type RamaPaso = {
  capa: "1 · geometría" | "2 · clúster" | "3 · ecología" | "cascada";
  titulo: string;
  detalle: string;
  decidio: boolean;
};

export type IdentifyResult = {
  codigo: IdentifyCode;
  estado: Estado | "OSR_GEO";
  veLaPersona: string;
  alSincronizar: string;
  especie: string | null;
  genero: string | null;
  familia: string | null;
  puntaje: number;
  rama: RamaPaso[];
  esperado: string;
  acierto: boolean;
  geo: {
    aplica: boolean;
    altitud: number;
    mu: number | null;
    sigma: number | null;
    p: number | null;
    umbral: number;
    politica: "rechazo" | "penalizacion";
    fuera: boolean;
    habitat: number | null;
    sustrato: string;
    congeladaEnRelease: boolean;
  };
  terminos: { visual: number; geo: number; habitat: number; wv: number; wg: number; wm: number } | null;
  comparacion: {
    coseno: { acepta: boolean; especie: string | null; similitud: number; tau: number };
    mahalanobis: { acepta: boolean; especie: string | null; distancia: number; tau: number };
    mismaEspecie: boolean;
    mismoVeredicto: boolean;
  };
  capa2: "aplicada" | "no_entraba" | "sin_matriz";
  traza: { norma: number; encoder: string; dim: number; checksumNota: string; foto: number; fotos: number };
};

const PERSONA: Record<IdentifyCode, string> = {
  "00_MATCH_OK": "Especie, ficha y certeza.",
  STATUS_GENUS: "Género, sin especie.",
  STATUS_FAMILY: "Familia, sin género ni especie.",
  "01_OSR_GLOBAL": "Fuera del catálogo de este paquete. Queda guardada para revisión.",
  "02_OSR_CLUSTER": "Se parece al complejo, pero los rasgos no cierran.",
  "03_OSR_GEO_FAIL": "Se parece a una especie, fuera de su cota. No es un alta.",
};

const SYNC: Record<IdentifyCode, string> = {
  "00_MATCH_OK": "Ocurrencia normal. El ciclo no abre un candidato nuevo.",
  STATUS_GENUS: "La app muestra el género. No abre ficha de especie ni publica nada.",
  STATUS_FAMILY: "La app muestra la familia. No abre ficha de especie ni publica nada.",
  "01_OSR_GLOBAL": "Cola de auditoría. Candidata a centroide nuevo. Publicarla es otra decisión, en el compilador.",
  "02_OSR_CLUSTER": "Revisar si el adaptador debe crecer. El simulador no agranda la matriz.",
  "03_OSR_GEO_FAIL": "Revisar el GPS o una expansión de rango. No es un alta automática.",
};

export function listarSondas(calib: PackageCalib): ProbeGrupoResumen[] {
  const map = new Map<string, ProbeGrupoResumen>();
  for (const v of calib.vectores) {
    const prev = map.get(v.origen);
    if (prev) prev.fotos += 1;
    else map.set(v.origen, { origen: v.origen, nombre: v.nombre, grupo: v.grupo, genero: v.genero, familia: v.familia, fotos: 1 });
  }
  const orden: ProbeGrupo[] = ["conocida", "congenere", "fuera_del_paquete", "genero_nuevo", "familia_ausente"];
  return [...map.values()].sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo) || a.nombre.localeCompare(b.nombre, "es"));
}

function decisionDe(manifest: PackageManifest) {
  if (manifest.decision) return { ...manifest.decision, congeladaEnRelease: true as const };
  return { umbral_geo: UMBRAL_GEO_DEFAULT, politica_geo: "rechazo" as const, congeladaEnRelease: false as const };
}

/** Sustrato con mayor prior en el JSON publicado. */
export function sustratoDominante(priors: Record<string, number>): Substrato {
  let best: Substrato = "hojarasca";
  let score = -1;
  for (const key of Object.keys(SUBSTRATO_LABEL) as Substrato[]) {
    const v = priors[SUBSTRATO_LABEL[key]] ?? 0;
    if (v > score) {
      score = v;
      best = key;
    }
  }
  return best;
}

export function identificar(opts: {
  manifest: PackageManifest;
  calib: PackageCalib;
  gates: ClusterGate[];
  origen: string;
  foto: number;
  altitud: number;
  sustrato: Substrato;
}): IdentifyResult {
  const { manifest, calib, gates, origen, altitud, sustrato } = opts;
  const fotos = calib.vectores.filter((v) => v.origen === origen);
  const v = fotos[Math.min(fotos.length - 1, Math.max(0, opts.foto))];
  if (!v) throw new Error("No hay embedding para esa sonda.");

  const pkg = calib.species.map((c) => c.species);
  const tauPorTaxon = new Map(manifest.species_catalog.map((s) => [s.taxon_id, s]));
  const tauGenero = new Map(manifest.genus_nodes.map((g) => [g.genus_id, g.rejection_tau_genus]));
  const tauFamilia = new Map(manifest.family_nodes.map((f) => [f.family_id, f.rejection_tau_family]));
  const decision = decisionDe(manifest);
  const rama: RamaPaso[] = [];

  let best = -1;
  let bestTau = 0;
  pkg.forEach((sp, k) => {
    const entry = tauPorTaxon.get(sp.taxonId);
    if (!entry) return;
    const c = v.cosEsp[k];
    if (c >= entry.rejection_tau && (best < 0 || c > v.cosEsp[best])) {
      best = k;
      bestTau = entry.rejection_tau;
    }
  });

  const ganadora = best >= 0 ? pkg[best] : null;
  const similitud = best >= 0 ? v.cosEsp[best] : Math.max(...v.cosEsp);
  rama.push({
    capa: "1 · geometría",
    titulo: ganadora ? `Dentro del radio de ${ganadora.especie}` : "Ninguna especie supera su τ",
    detalle: ganadora
      ? `Coseno ${similitud.toFixed(3)} ≥ τ ${bestTau.toFixed(3)} congelado en el release (Weibull ya convertida a similitud).`
      : `La similitud más alta fue ${similitud.toFixed(3)} y quedó bajo el τ de esa especie. El camino que viaja es el coseno, no Mahalanobis.`,
    decidio: !ganadora,
  });

  let estado: IdentifyResult["estado"] = "OSR_GLOBAL";
  let especie: string | null = null;
  let genero: string | null = null;
  let familia: string | null = null;
  let capa2: IdentifyResult["capa2"] = "no_entraba";
  let entry = ganadora ? tauPorTaxon.get(ganadora.taxonId) ?? null : null;

  if (ganadora && entry) {
    const cluster = manifest.cryptic_clusters.find((c) => c.especies.includes(ganadora.id));
    if (!cluster) {
      rama.push({
        capa: "2 · clúster",
        titulo: "No pertenece a un complejo publicado",
        detalle: "La capa 2 solo corre si la especie ganadora está en un clúster del release.",
        decidio: false,
      });
      estado = "MATCH_SPECIES";
      especie = ganadora.especie;
      genero = ganadora.genero;
      familia = ganadora.familia;
    } else {
      const gate = gates.find((g) => g.clusterId === cluster.cluster_id);
      if (!gate) {
        capa2 = "sin_matriz";
        rama.push({
          capa: "2 · clúster",
          titulo: `El release nombra ${cluster.cluster_id}, pero esta sesión no tiene su matriz`,
          detalle: `ε congelado ${cluster.epsilon_reconstruction.toFixed(3)}. Sin la matriz entrenada no se inventa un rechazo de clúster: la capa 1 se mantiene.`,
          decidio: false,
        });
        estado = "MATCH_SPECIES";
        especie = ganadora.especie;
        genero = ganadora.genero;
        familia = ganadora.familia;
      } else {
        capa2 = "aplicada";
        const erec = gate.erec(v.x);
        const rechaza = erec > cluster.epsilon_reconstruction;
        rama.push({
          capa: "2 · clúster",
          titulo: rechaza ? `Residuo por encima de ε (${cluster.cluster_id})` : `Residuo dentro de ε (${cluster.cluster_id})`,
          detalle: `E_rec ${erec.toFixed(3)} frente a ε ${cluster.epsilon_reconstruction.toFixed(3)} del release.`,
          decidio: rechaza,
        });
        if (rechaza) {
          estado = "OSR_CLUSTER";
          genero = ganadora.genero;
          entry = null;
        } else {
          estado = "MATCH_SPECIES";
          especie = ganadora.especie;
          genero = ganadora.genero;
          familia = ganadora.familia;
        }
      }
    }
  } else {
    rama.push({
      capa: "2 · clúster",
      titulo: "No hay especie candidata",
      detalle: "Sin un match de especie la capa 2 no tiene complejo donde proyectar.",
      decidio: false,
    });
    let g = -1;
    calib.generos.forEach((node, i) => {
      const tau = tauGenero.get(node.id);
      if (tau === undefined) return;
      if (v.cosGen[i] >= tau && (g < 0 || v.cosGen[i] > v.cosGen[g])) g = i;
    });
    if (g >= 0) {
      estado = "MATCH_GENUS";
      genero = calib.generos[g].id;
      rama.push({
        capa: "cascada",
        titulo: `Cae a ${genero}`,
        detalle: `Coseno al supercentroide ${v.cosGen[g].toFixed(3)} ≥ τ de género ${tauGenero.get(genero)!.toFixed(3)}.`,
        decidio: true,
      });
    } else {
      let f = -1;
      calib.familias.forEach((node, i) => {
        const tau = tauFamilia.get(node.id);
        if (tau === undefined) return;
        if (v.cosFam[i] >= tau && (f < 0 || v.cosFam[i] > v.cosFam[f])) f = i;
      });
      if (f >= 0) {
        estado = "MATCH_FAMILY";
        familia = calib.familias[f].id;
        rama.push({
          capa: "cascada",
          titulo: `Cae a ${familia}`,
          detalle: `Coseno al supercentroide ${v.cosFam[f].toFixed(3)} ≥ τ de familia ${tauFamilia.get(familia)!.toFixed(3)}.`,
          decidio: true,
        });
      } else {
        estado = "OSR_GLOBAL";
        rama.push({
          capa: "cascada",
          titulo: "Rechazo global",
          detalle: "No superó τ de especie, ni de género, ni de familia.",
          decidio: true,
        });
      }
    }
  }

  const labelSustrato = SUBSTRATO_LABEL[sustrato];
  let geo: IdentifyResult["geo"] = {
    aplica: false,
    altitud,
    mu: null,
    sigma: null,
    p: null,
    umbral: decision.umbral_geo,
    politica: decision.politica_geo,
    fuera: false,
    habitat: null,
    sustrato: labelSustrato,
    congeladaEnRelease: decision.congeladaEnRelease,
  };
  let terminos: IdentifyResult["terminos"] = null;

  if (estado === "MATCH_SPECIES" && entry) {
    const mu = entry.context_parameters.altitude_mean_msnm;
    const sigma = entry.context_parameters.altitude_std_dev;
    const p = pAltitud(altitud, mu, sigma);
    const habitat = entry.context_parameters.substrate_priors[labelSustrato] ?? 0;
    const { visual: wv, geo: wg, habitat: wm } = entry.context_parameters.weights;
    const fuera = p < decision.umbral_geo;
    geo = { aplica: true, altitud, mu, sigma, p, umbral: decision.umbral_geo, politica: decision.politica_geo, fuera, habitat, sustrato: labelSustrato, congeladaEnRelease: decision.congeladaEnRelease };
    const visual = similitud;
    terminos = { visual, geo: p, habitat, wv, wg, wm };
    if (fuera && decision.politica_geo === "rechazo") {
      estado = "OSR_GEO";
      rama.push({
        capa: "3 · ecología",
        titulo: "Corte geográfico: el puntaje cae a cero",
        detalle: `P(altitud) ${p.toFixed(3)} < umbral_geo ${decision.umbral_geo} (${altitud.toLocaleString("es-CO")} m, μ ${Math.round(mu)} ± ${Math.round(sigma)}). Política del release: rechazo.`,
        decidio: true,
      });
    } else if (fuera) {
      rama.push({
        capa: "3 · ecología",
        titulo: "La cota penaliza, no rechaza",
        detalle: `P(altitud) ${p.toFixed(3)} < ${decision.umbral_geo}. El puntaje queda wv·coseno + wg·P + wm·P(hábitat) = ${(wv * visual + wg * p + wm * habitat).toFixed(3)}. La especie se mantiene.`,
        decidio: true,
      });
    } else {
      rama.push({
        capa: "3 · ecología",
        titulo: "La cota y el sustrato acompañan",
        detalle: `P(altitud) ${p.toFixed(3)} ≥ ${decision.umbral_geo}. P(${labelSustrato}) ${habitat.toFixed(2)}. Puntaje ${(wv * visual + wg * p + wm * habitat).toFixed(3)}.`,
        decidio: false,
      });
    }
  } else {
    rama.push({
      capa: "3 · ecología",
      titulo: "No se aplica",
      detalle: "La gaussiana de altitud es de una especie. Sin match de especie no hay cota contra la cual cortar.",
      decidio: false,
    });
  }

  const tauMahal = calib.species.map((c) => percentile(c.dTrainMahal, 0.95));
  let bestM = -1;
  v.dMahal.forEach((d, k) => {
    if (d <= tauMahal[k] && (bestM < 0 || d < v.dMahal[bestM])) bestM = k;
  });
  const cosenoEsp = ganadora?.especie ?? null;
  const mahalEsp = bestM >= 0 ? pkg[bestM].especie : null;

  const codigo: IdentifyCode =
    estado === "MATCH_SPECIES"
      ? "00_MATCH_OK"
      : estado === "MATCH_GENUS"
        ? "STATUS_GENUS"
        : estado === "MATCH_FAMILY"
          ? "STATUS_FAMILY"
          : estado === "OSR_CLUSTER"
            ? "02_OSR_CLUSTER"
            : estado === "OSR_GEO"
              ? "03_OSR_GEO_FAIL"
              : "01_OSR_GLOBAL";

  const puntaje =
    terminos && !(geo.fuera && geo.politica === "rechazo")
      ? terminos.wv * terminos.visual + terminos.wg * terminos.geo + terminos.wm * terminos.habitat
      : codigo === "00_MATCH_OK"
        ? similitud
        : 0;

  let esperado = "su especie";
  if (v.grupo !== "conocida") {
    const ideal = idealFor(v.genero, v.familia, pkg);
    esperado = ideal === "MATCH_GENUS" ? `su género (${v.genero})` : ideal === "MATCH_FAMILY" ? `su familia (${v.familia})` : "OSR_GLOBAL";
  } else if (geo.fuera && geo.politica === "rechazo") {
    esperado = "OSR_GEO: la foto es de una especie del paquete, pero la altitud que pusiste cae fuera de su cota";
  }

  const acierto =
    v.grupo === "conocida"
      ? geo.fuera && geo.politica === "rechazo"
        ? codigo === "03_OSR_GEO_FAIL"
        : codigo === "00_MATCH_OK" && especie === v.nombre
      : (esperado.startsWith("su género") && (codigo === "STATUS_GENUS" || codigo === "02_OSR_CLUSTER") && genero === v.genero) ||
        (esperado.startsWith("su familia") && codigo === "STATUS_FAMILY" && familia === v.familia) ||
        (esperado === "OSR_GLOBAL" && codigo === "01_OSR_GLOBAL");

  return {
    codigo,
    estado,
    veLaPersona: PERSONA[codigo],
    alSincronizar: SYNC[codigo],
    especie,
    genero,
    familia,
    puntaje,
    rama,
    esperado,
    acierto,
    geo,
    terminos,
    comparacion: {
      coseno: { acepta: !!ganadora, especie: cosenoEsp, similitud, tau: best >= 0 ? bestTau : 0 },
      mahalanobis: {
        acepta: bestM >= 0,
        especie: mahalEsp,
        distancia: bestM >= 0 ? v.dMahal[bestM] : Math.min(...v.dMahal),
        tau: bestM >= 0 ? tauMahal[bestM] : 0,
      },
      mismaEspecie: cosenoEsp !== null && cosenoEsp === mahalEsp,
      mismoVeredicto: !!ganadora === (bestM >= 0),
    },
    capa2,
    traza: {
      norma: cosine(v.x, v.x),
      encoder: manifest.package_metadata.encoder,
      dim: manifest.package_metadata.embedding_dim,
      checksumNota: "El checksum del release no cambia: esta corrida no escribe.",
      foto: Math.min(fotos.length - 1, Math.max(0, opts.foto)) + 1,
      fotos: fotos.length,
    },
  };
}
