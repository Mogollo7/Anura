"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Smartphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { useAllReleases, type ReleaseEstado } from "@/lib/compiler/release-store";
import { getAntioquiaSubregion } from "@/lib/packages/antioquia-subregiones";
import { REAL } from "@/lib/data/real";

const ESTADO: Record<ReleaseEstado, { label: string; tone: "accent" | "info" | "warning" | "neutral" }> = {
  VALIDATING: { label: "Esperando aval científico", tone: "info" },
  READY: { label: "Esperando aval técnico", tone: "info" },
  APPROVED: { label: "Aprobada, sin publicar", tone: "warning" },
  PUBLISHED: { label: "Publicada", tone: "accent" },
  ROLLED_BACK: { label: "Revertida", tone: "neutral" },
};

const sinSuscripcion = () => () => {};

function fecha(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

type NodoPaquete = {
  id: string;
  nombre: string;
  nivel: string;
  version: string | null;
  especies: number | null;
  formato: string | null;
  size_bytes: number;
  size_archivo?: number;
  sha256: string | null;
  hijos?: NodoPaquete[];
};

function filas(nodos: NodoPaquete[], profundidad = 0): { nodo: NodoPaquete; profundidad: number }[] {
  return nodos.flatMap((nodo) => [{ nodo, profundidad }, ...filas(nodo.hijos || [], profundidad + 1)]);
}

function mb(bytes: number) {
  if (!bytes) return "—";
  const n = bytes / 1_048_576;
  return n >= 1 ? `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Entrega de paquetes: lo que el servidor ya deja bajar (sqlite y catálogos) y,
 * aparte, los releases JSON que el compilador guarda solo en este navegador.
 */
export function ReleaseDelivery() {
  const listo = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  const releases = useAllReleases();
  const tel = REAL.paqueteTelefono;
  const orden = [...releases].sort((a, b) => b.compiladoEn.localeCompare(a.compiladoEn));
  const vigentes = orden.filter((r) => r.estado === "PUBLISHED");
  const [catalogo, setCatalogo] = useState<NodoPaquete[] | null>(null);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dataset/publico/paquetes")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.message || "No se pudo leer la entrega");
        setCatalogo(Array.isArray(body.paises) ? body.paises : []);
      })
      .catch((err: Error) => {
        setCatalogo([]);
        setCatalogoError(err.message || "No se pudo leer la entrega");
      });
  }, []);

  const entregables = catalogo ? filas(catalogo).filter((f) => f.nodo.formato) : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="mb-2">
          <CardTitle>
            <Smartphone size={16} className="mr-1.5 inline" aria-hidden />
            Lo que ya se puede descargar
          </CardTitle>
          <Badge tone="accent">Servidor</Badge>
        </CardHeader>
        <p className="mb-3 text-sm text-label-secondary">
          El teléfono y la web bajan estos archivos. Un país o un departamento incluye a sus hijos. El sqlite de
          Antioquia es el paquete de identificación (v{tel.info.package_version} dentro del APK, el mismo sha256).
        </p>
        {catalogoError && <p className="text-sm text-danger">{catalogoError}</p>}
        {catalogo === null ? (
          <p className="text-sm text-label-secondary">Leyendo el catálogo…</p>
        ) : entregables.length === 0 && !catalogoError ? (
          <p className="text-sm text-label-secondary">El servidor no publicó ningún archivo.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Paquete</TH>
                <TH>Nivel</TH>
                <TH>Formato</TH>
                <TH>Versión</TH>
                <TH>Tamaño</TH>
              </tr>
            </THead>
            <TBody>
              {entregables.map(({ nodo, profundidad }) => (
                <TRow key={nodo.id}>
                  <TD style={{ paddingLeft: 12 + profundidad * 16 }}>{nodo.nombre}</TD>
                  <TD>{nodo.nivel === "subregion" ? "Subregión" : nodo.nivel === "departamento" ? "Departamento" : "País"}</TD>
                  <TD>{nodo.formato === "sqlite" ? "Identificación" : "Catálogo"}</TD>
                  <TD className="font-mono">{nodo.version ? `v${nodo.version}` : "—"}</TD>
                  <TD>{mb(nodo.size_archivo || nodo.size_bytes)}</TD>
                </TRow>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader className="mb-3">
          <CardTitle>Releases del creador</CardTitle>
          <span className="text-sm text-label-secondary">
            {listo ? `${vigentes.length} publicado(s) · ${orden.length} en total` : "Leyendo…"}
          </span>
        </CardHeader>
        {listo && orden.length === 0 ? (
          <p className="text-sm text-label-secondary">
            Todavía no hay releases. Se generan en{" "}
            <Link href="/compilador" className="text-accent-ink hover:underline">
              Release
            </Link>{" "}
            después de validar una subregión.
          </p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Subregión</TH>
                <TH>Versión</TH>
                <TH>Estado</TH>
                <TH>Especies</TH>
                <TH>Aval científico</TH>
                <TH>Aval técnico</TH>
                <TH>Publicado</TH>
              </tr>
            </THead>
            <TBody>
              {listo &&
                orden.map((r) => (
                  <TRow key={r.id}>
                    <TD>{getAntioquiaSubregion(r.subregionId)?.nombre ?? r.subregionId}</TD>
                    <TD className="font-mono">v{r.version}</TD>
                    <TD>
                      <Badge tone={ESTADO[r.estado].tone}>{ESTADO[r.estado].label}</Badge>
                    </TD>
                    <TD>{r.manifest.species_catalog.length}</TD>
                    <TD>{r.cientifico ? `${r.cientifico.por} · ${r.cientifico.fecha}` : "—"}</TD>
                    <TD>{r.tecnico ? `${r.tecnico.por} · ${r.tecnico.fecha}` : "—"}</TD>
                    <TD>{r.publicadoEn ? `${r.publicadoPor} · ${fecha(r.publicadoEn)}` : "—"}</TD>
                  </TRow>
                ))}
            </TBody>
          </Table>
        )}
        <p className="mt-3 text-sm text-label-secondary">
          Estos releases viven en este navegador. El teléfono no los instala: baja el sqlite y los catálogos de la tabla de arriba.
          Para avalar, publicar o revertir se usa{" "}
          <Link href="/compilador" className="text-accent-ink hover:underline">
            Release
          </Link>
          , con los dos avales en orden.
        </p>
      </Card>
    </div>
  );
}
