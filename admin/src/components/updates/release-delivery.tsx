"use client";

import Link from "next/link";
import { Smartphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { DataState } from "@/components/app-data/data-state";
import { appApi, useAppResource, type PaqueteNodo } from "@/lib/app-data/app-client";
import { ESTADO_PAQUETE, TIPO_APROBACION, fecha, releaseApi, tamano } from "@/lib/release/release-client";

type NodoPublicado = PaqueteNodo & { publicado?: string | null; manifiesto_url?: string | null };

function subregiones(nodos: NodoPublicado[], departamento = ""): { nodo: NodoPublicado; departamento: string }[] {
  return nodos.flatMap((n) =>
    n.nivel === "subregion" ? [{ nodo: n, departamento }] : subregiones((n.hijos ?? []) as NodoPublicado[], n.nivel === "departamento" ? n.nombre : departamento)
  );
}

/**
 * Actualizaciones: lo que la app puede descargar hoy (el árbol público de dataset-service, solo
 * paquetes publicados) y la historia de versiones de cada subregión.
 */
export function ReleaseDelivery() {
  const publico = useAppResource(appApi.packages);
  const historial = useAppResource(() => releaseApi.paquetes());
  // El id interno del paquete ("05.VALLE_DE_ABURRA") no es para leer: se muestra la subregión.
  const nombres = useAppResource(() => releaseApi.resumen());
  const subregionDe = new Map(
    (nombres.value.state === "listo" ? nombres.value.data : []).map((s) => [s.id, `${s.nombre} · ${s.region_nombre}`])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Actualizaciones</h1>
        <p className="text-sm text-label-secondary">
          Los paquetes que la app puede descargar, uno por subregión. Solo aparece lo publicado en Release con sus dos aprobaciones.
        </p>
      </div>

      <Card>
        <CardHeader className="mb-2">
          <CardTitle>
            <Smartphone size={16} className="mr-1.5 inline" aria-hidden />
            Lo que la app puede descargar
          </CardTitle>
        </CardHeader>
        <DataState value={publico.value} onRetry={publico.reload}>
          {(paises) => {
            const filas = subregiones(paises as NodoPublicado[]);
            return filas.length === 0 ? (
              <p className="text-sm text-label-secondary">
                Aún no hay paquetes publicados: la app no tiene nada que descargar. Para empezar, compila una subregión en{" "}
                <Link href="/compilador" className="text-accent-ink underline">Release</Link>, reúne las dos aprobaciones y publícala.
              </p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Subregión</TH>
                    <TH>Versión</TH>
                    <TH className="text-right">Especies</TH>
                    <TH className="text-right">Tamaño</TH>
                    <TH>Publicado</TH>
                    <TH>Huella (sha256)</TH>
                  </tr>
                </THead>
                <TBody>
                  {filas.map(({ nodo, departamento }) => (
                    <TRow key={nodo.id}>
                      <TD>
                        {nodo.nombre}
                        <span className="block text-xs text-label-tertiary">{departamento}</span>
                      </TD>
                      <TD className="font-mono text-xs">{nodo.version}</TD>
                      <TD className="text-right text-xs tabular-nums">{nodo.especies ?? "—"}</TD>
                      <TD className="text-right text-xs tabular-nums">{tamano(nodo.size_archivo || nodo.size_bytes)}</TD>
                      <TD className="text-xs">{fecha(nodo.publicado)}</TD>
                      <TD className="font-mono text-xs text-label-tertiary">{nodo.sha256?.slice(0, 12)}…</TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            );
          }}
        </DataState>
      </Card>

      <Card>
        <CardHeader className="mb-2">
          <CardTitle>Historial de versiones</CardTitle>
        </CardHeader>
        <DataState value={historial.value} onRetry={historial.reload}>
          {(paquetes) =>
            paquetes.length === 0 ? (
              <p className="text-sm text-label-secondary">
                Aún no se compiló ninguna versión. Se compilan en{" "}
                <Link href="/compilador" className="text-accent-ink underline">Release</Link> cuando la validación de una subregión está lista.
              </p>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Subregión</TH>
                    <TH>Versión</TH>
                    <TH>Estado</TH>
                    <TH>Compilado</TH>
                    <TH>Aprobaciones</TH>
                    <TH>Publicado</TH>
                  </tr>
                </THead>
                <TBody>
                  {paquetes.map((p) => (
                    <TRow key={p.id}>
                      <TD className="text-xs">{(p.subregion_id != null && subregionDe.get(p.subregion_id)) || p.paquete_id}</TD>
                      <TD className="font-mono text-xs">{p.version}</TD>
                      <TD>
                        <Badge tone={p.desactualizado ? "warning" : ESTADO_PAQUETE[p.estado].tone}>
                          {p.desactualizado ? "Desactualizado" : ESTADO_PAQUETE[p.estado].label}
                        </Badge>
                      </TD>
                      <TD className="text-xs">{p.compilado_nombre ?? "—"} · {fecha(p.compilado)}</TD>
                      <TD className="text-xs">
                        {p.aprobaciones.length
                          ? p.aprobaciones.map((a) => `${TIPO_APROBACION[a.tipo].label}: ${a.nombre ?? a.cuenta}`).join(" · ")
                          : "—"}
                      </TD>
                      <TD className="text-xs">
                        {p.publicado ? `${p.publicado_nombre ?? "—"} · ${fecha(p.publicado)}` : "—"}
                        {p.retirado && <span className="block text-label-tertiary">Retirado {fecha(p.retirado)}</span>}
                      </TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
            )
          }
        </DataState>
      </Card>
    </div>
  );
}
