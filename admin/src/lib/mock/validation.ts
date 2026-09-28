import { mulberry32 } from "./rng";
import { getAllSpecies, type SpeciesEntry } from "./catalog";
import { getReferenceStats } from "./reference";
import { getPackages, type PackageSummary } from "./packages";
import { getDepartamento } from "@/lib/packages/departamentos";
import { suggestedSpecies } from "@/lib/packages/constants";

export type ConfusionEntry = { predictedId: string; count: number };

export type SpeciesValidationRow = {
  speciesId: string;
  grupo: "A" | "B";
  support: number; // ejemplos de test (sin individuos compartidos con referencia)
  correct: number;
  recall: number;
  precision: number;
  confusions: ConfusionEntry[]; // ordenadas de mayor a menor, sin ceros
};

export type SimilarSpeciesPair = {
  aId: string;
  bId: string;
  count: number; // confusiones a→b + b→a
  sameGenus: boolean;
};

export type PackageValidationReport = {
  packageId: string;
  packageName: string;
  speciesIds: string[];
  top1: number;
  top5: number;
  auroc: number;
  kar: number;
  groupA: number;
  groupB: number;
  matrix: number[][]; // [actual][predicted], mismo orden que speciesIds
  rows: SpeciesValidationRow[];
  similarPairs: SimilarSpeciesPair[];
};

function seedFrom(...parts: (string | number)[]) {
  return parts.join("|").split("").reduce((acc, c) => (acc * 33 + c.charCodeAt(0)) | 0, 5381);
}

function reportSpecies(pkg: PackageSummary): SpeciesEntry[] {
  const dep = getDepartamento(pkg.departamentoId);
  const byId = new Map(getAllSpecies().map((s) => [s.id, s]));
  const ids = dep ? suggestedSpecies(dep.id) : [];
  return ids.map((id) => byId.get(id)).filter((s): s is SpeciesEntry => !!s);
}

export function buildValidationReport(pkg: PackageSummary): PackageValidationReport {
  const species = reportSpecies(pkg);
  const speciesIds = species.map((s) => s.id);
  const n = species.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  const stats = species.map((s) => getReferenceStats(s));
  const grupo = stats.map((s) => (s.individuos >= 200 ? "A" : "B") as "A" | "B");
  const groupA = grupo.filter((g) => g === "A").length;
  const groupARatio = n > 0 ? groupA / n : 0;

  // Antioquia es el piloto ya medido (Fase 13): AUROC 0,6248 y KAR 85,38 %
  // con 9 Grupo A + 32 Grupo B, y Top-1 66,2 % balanceado por individuo
  // (Dataset Jerárquico §6). Estos son números reales, no simulados — se
  // fijan exactos. Los demás departamentos, sin experimento real todavía,
  // derivan un nivel plausible a partir de su propia proporción Grupo A/B.
  const isAntioquiaPilot = pkg.departamentoId === "antioquia";
  const auroc = isAntioquiaPilot
    ? 0.6248
    : Math.round(Math.max(0.5, 0.6248 - (1 - groupARatio) * 0.09) * 10000) / 10000;
  const kar = isAntioquiaPilot
    ? 0.8538
    : Math.round(Math.max(0.6, 0.8538 - (1 - groupARatio) * 0.07) * 10000) / 10000;
  const targetTop1 = isAntioquiaPilot ? 0.662 : Math.max(0.45, 0.55 + groupARatio * 0.25);

  // Recall base por especie (antes de anclar el agregado al Top-1 real).
  const supports: number[] = [];
  const baseRecalls: number[] = [];
  for (let i = 0; i < n; i++) {
    const sp = species[i];
    const rand = mulberry32(seedFrom(pkg.id, sp.id, "recall"));
    supports.push(Math.max(5, Math.round(stats[i].individuos * 0.18)));
    const base = grupo[i] === "A" ? 0.78 + rand() * 0.16 : sp.lowData ? 0.28 + rand() * 0.32 : 0.5 + rand() * 0.28;
    baseRecalls.push(base);
  }
  const weightedAvg = supports.reduce((s, sup, i) => s + sup * baseRecalls[i], 0) / Math.max(1, supports.reduce((a, b) => a + b, 0));
  const scale = weightedAvg > 0 ? targetTop1 / weightedAvg : 1;

  for (let i = 0; i < n; i++) {
    const sp = species[i];
    const rand = mulberry32(seedFrom(pkg.id, sp.id, "confusion"));
    const support = supports[i];
    const recall = Math.min(0.98, Math.max(0.05, baseRecalls[i] * scale));
    const correct = Math.round(support * recall);
    matrix[i][i] = correct;

    let remaining = support - correct;
    if (remaining > 0) {
      // Candidatas: mismo género primero (confusión morfológica real), luego
      // misma familia, luego cualquier otra especie del paquete.
      const sameGenus = species.map((s, j) => j).filter((j) => j !== i && species[j].genero === sp.genero);
      const sameFamily = species.map((s, j) => j).filter((j) => j !== i && species[j].familia === sp.familia && !sameGenus.includes(j));
      const others = species.map((s, j) => j).filter((j) => j !== i && !sameGenus.includes(j) && !sameFamily.includes(j));

      const pool = [...sameGenus, ...sameGenus, ...sameFamily, ...others].slice(0, 6);
      if (pool.length === 0) {
        matrix[i][i] += remaining; // sin candidatas plausibles: queda como acierto
      } else {
        // Reparto geométrico: la primera candidata concentra la mayoría.
        for (const j of pool) {
          if (remaining <= 0) break;
          const share = pool[0] === j ? Math.ceil(remaining * (0.35 + rand() * 0.25)) : Math.ceil(remaining * (0.1 + rand() * 0.15));
          const take = Math.min(remaining, share);
          matrix[i][j] += take;
          remaining -= take;
        }
        if (remaining > 0) matrix[i][pool[0]] += remaining;
      }
    }
  }

  const rows: SpeciesValidationRow[] = species.map((sp, i) => {
    const support = matrix[i].reduce((a, b) => a + b, 0);
    const correct = matrix[i][i];
    const predictedTotal = matrix.reduce((sum, row) => sum + row[i], 0);
    const confusions: ConfusionEntry[] = matrix[i]
      .map((count, j) => ({ predictedId: speciesIds[j], count }))
      .filter((c) => c.count > 0 && c.predictedId !== sp.id)
      .sort((a, b) => b.count - a.count);

    return {
      speciesId: sp.id,
      grupo: grupo[i],
      support,
      correct,
      recall: support > 0 ? Math.round((correct / support) * 100) / 100 : 0,
      precision: predictedTotal > 0 ? Math.round((correct / predictedTotal) * 100) / 100 : 0,
      confusions,
    };
  });

  const totalSupport = rows.reduce((s, r) => s + r.support, 0);
  const totalCorrect = rows.reduce((s, r) => s + r.correct, 0);
  const top1 = totalSupport > 0 ? Math.round((totalCorrect / totalSupport) * 1000) / 1000 : 0;
  const top5 = Math.min(0.99, Math.round((top1 + 0.19 + groupARatio * 0.05) * 1000) / 1000);

  const pairKey = (a: string, b: string) => [a, b].sort().join("~");
  const pairMap = new Map<string, SimilarSpeciesPair>();
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j || matrix[i][j] === 0) continue;
      const key = pairKey(speciesIds[i], speciesIds[j]);
      const existing = pairMap.get(key);
      const count = matrix[i][j] + (matrix[j]?.[i] ?? 0);
      if (!existing || count > existing.count) {
        pairMap.set(key, {
          aId: speciesIds[i],
          bId: speciesIds[j],
          count,
          sameGenus: species[i].genero === species[j].genero,
        });
      }
    }
  }
  const similarPairs = Array.from(pairMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    packageId: pkg.id,
    packageName: pkg.nombre,
    speciesIds,
    top1,
    top5,
    auroc,
    kar,
    groupA,
    groupB: n - groupA,
    matrix,
    rows,
    similarPairs,
  };
}

export function getValidationReports(): PackageValidationReport[] {
  return getPackages()
    .map((pkg) => buildValidationReport(pkg))
    .filter((r) => r.speciesIds.length >= 2);
}

export function getValidationReport(packageId: string): PackageValidationReport | undefined {
  const pkg = getPackages().find((p) => p.id === packageId);
  return pkg ? buildValidationReport(pkg) : undefined;
}
