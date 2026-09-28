"use client";

import { Copy, Dna } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import {
  appApi,
  useAppResource,
  speciesLabel,
  formatDate,
  STATUS_INFO,
  type AppObservation,
} from "@/lib/app-data/app-client";

/**
 * Observaciones sin predicción ni nombre de especie: señal real en Postgres
 * (ai.predictions ausente / ai_class y species vacíos). No inventa taxones.
 */
function unresolvedTaxa(obs: AppObservation[]): AppObservation[] {
  return obs.filter((o) => {
    const ai = (o.ai_class ?? "").trim();
    const common = (o.common_name ?? "").trim();
    return !ai && !common;
  });
}

export function QualitySignals() {
  const obsResource = useAppResource(appApi.observations);
  const observaciones = obsResource.value.state === "listo" ? obsResource.value.data : null;
  const sinResolver = observaciones ? unresolvedTaxa(observaciones) : null;

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <div>
        <h2 className="text-sm font-semibold text-label-primary">Señales sobre observaciones</h2>
        <p className="text-sm text-label-secondary">
          Solo lo que se puede leer en el servidor. Sin hash de imagen en observaciones de la app no hay
          duplicados visuales que listar; los taxones sin resolver son observaciones sin predicción ni
          nombre de especie.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Copy size={16} />
              Duplicados visuales
            </CardTitle>
          </CardHeader>
          <p className="text-sm text-label-secondary">
            No hay fuente en Postgres: las observaciones de la app no guardan hash de imagen (solo
            image_key). Sin ese campo no se pueden agrupar fotos idénticas. Esta sección queda vacía a
            propósito — no se muestran candidatos simulados.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Dna size={16} />
              Taxones sin resolver
            </CardTitle>
            {sinResolver !== null && (
              <Badge tone={sinResolver.length > 0 ? "warning" : "neutral"}>
                {sinResolver.length.toLocaleString("es-CO")}
              </Badge>
            )}
          </CardHeader>

          {obsResource.value.state === "sin-sesion" && (
            <p className="text-sm text-label-secondary">Inicia sesión del panel para listar observaciones.</p>
          )}
          {obsResource.value.state === "cargando" && (
            <p className="text-sm text-label-secondary">Cargando observaciones…</p>
          )}
          {obsResource.value.state === "error" && (
            <p className="text-sm text-danger">{obsResource.value.message}</p>
          )}
          {sinResolver !== null && sinResolver.length === 0 && (
            <p className="text-sm text-label-secondary">
              Ninguna observación listada carece de predicción y de nombre común.
            </p>
          )}
          {sinResolver !== null && sinResolver.length > 0 && (
            <>
              <p className="mb-3 text-xs text-label-secondary">
                Observaciones sin <span className="font-mono">ai_class</span>/predicción y sin{" "}
                <span className="font-mono">common_name</span> (hasta 2000 del panel).
              </p>
              <Table>
                <THead>
                  <tr>
                    <TH>Observación</TH>
                    <TH>Usuario</TH>
                    <TH>Estado</TH>
                    <TH>Creada</TH>
                  </tr>
                </THead>
                <TBody>
                  {sinResolver.slice(0, 50).map((o) => (
                    <TRow key={o.id}>
                      <TD>
                        <p className="text-sm text-label-primary">{speciesLabel(o)}</p>
                        <p className="font-mono text-[11px] text-label-tertiary">{o.id.slice(0, 8)}…</p>
                      </TD>
                      <TD>{o.username}</TD>
                      <TD>
                        <Badge tone={STATUS_INFO[o.status].tone}>{STATUS_INFO[o.status].label}</Badge>
                      </TD>
                      <TD className="text-xs text-label-secondary">{formatDate(o.created_at)}</TD>
                    </TRow>
                  ))}
                </TBody>
              </Table>
              {sinResolver.length > 50 && (
                <p className="mt-2 text-xs text-label-tertiary">
                  Mostrando 50 de {sinResolver.length.toLocaleString("es-CO")}.
                </p>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
