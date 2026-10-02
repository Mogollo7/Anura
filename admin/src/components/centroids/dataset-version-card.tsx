"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { usePanelSession } from "@/lib/session/panel-session";
import { crearVersion, getVersiones, type EstadoVersiones } from "@/lib/dataset/dataset-client";
import { plural } from "@/lib/utils";

const num = (n: number) => n.toLocaleString("es-CO");

/**
 * Versión del dataset: congela qué fotos entrenan, validan y prueban. Todo lo que sigue
 * (centroides, OSR, Métricas, Release) lee la versión vigente, así que sin una no hay nada que calcular.
 */
export function DatasetVersionCard({ onCreada }: { onCreada?: () => void }) {
  const session = usePanelSession();
  const puede = session.can("ejecutarEntrenamiento");
  const [estado, setEstado] = useState<EstadoVersiones | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(() => {
    getVersiones()
      .then((e) => (setEstado(e), setError(null)))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (session.isReal) cargar();
  }, [session.isReal, cargar]);

  if (!session.isReal) return null;

  const vigente = estado?.versiones[0] ?? null;
  const cambios = estado?.cambios;
  const hayCambios = !!cambios && (cambios.nuevas > 0 || cambios.salientes > 0);

  async function crear() {
    setCreando(true);
    setError(null);
    try {
      const r = await crearVersion();
      setAviso(
        `Versión «${r.nombre}» creada: ${plural(r.fotos.train, "foto", "fotos")} para entrenar, ${num(r.fotos.val)} para validar y ${num(r.fotos.test)} para probar. Recalcula los centroides.`
      );
      setConfirmando(false);
      cargar();
      onCreada?.();
    } catch (e) {
      setError((e as Error).message);
      setConfirmando(false);
    } finally {
      setCreando(false);
    }
  }

  return (
    <Card>
      <CardHeader className="mb-2 flex-wrap gap-2">
        <div>
          <CardTitle>Versión del dataset</CardTitle>
          <p className="mt-1 text-xs text-label-secondary">
            Reparte las fotos entre entrenamiento, validación y prueba, siempre por individuo: las fotos de una misma observación
            van juntas. Los centroides, el umbral OSR y las métricas se calculan sobre esta versión.
          </p>
        </div>
        {vigente && <Badge tone="neutral">{vigente.nombre}</Badge>}
      </CardHeader>

      {error && <p className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {aviso && <p className="mb-3 rounded-md bg-accent-wash px-3 py-2 text-sm text-accent-ink">{aviso}</p>}
      {!estado && !error && <p className="text-sm text-label-secondary">Leyendo la versión…</p>}

      {estado && !vigente && (
        <p className="text-sm text-label-secondary">
          {estado.cambios.elegibles > 0 ? (
            `Aún no hay una versión. Para empezar, crea la primera con ${plural(estado.cambios.elegibles, "foto", "fotos")} del catálogo.`
          ) : (
            <>
              Aún no hay una versión ni fotos para armarla. Para empezar, sube o consigue fotos de una especie en{" "}
              <Link href="/curacion" className="text-accent-ink underline decoration-dotted underline-offset-2">Imágenes</Link>.
            </>
          )}
        </p>
      )}

      {vigente && (
        <div className="space-y-1 text-sm">
          <p className="text-label-primary">
            {plural(vigente.train, "foto", "fotos")} para entrenar · {num(vigente.val)} para validar · {num(vigente.test)} para probar
            <span className="text-label-tertiary"> · creada el {new Date(vigente.creado).toLocaleDateString("es-CO")}</span>
          </p>
          <p className={hayCambios ? "text-warning" : "text-label-secondary"}>
            {hayCambios
              ? `Desde entonces: ${[
                  cambios!.nuevas > 0 ? plural(cambios!.nuevas, "foto nueva", "fotos nuevas") : null,
                  cambios!.salientes > 0 ? `${plural(cambios!.salientes, "foto sale", "fotos salen")} (excluidas o de observaciones invalidadas)` : null,
                ].filter(Boolean).join(" y ")}. Crea una versión nueva para que cuenten.`
              : "Sin cambios en las fotos desde esta versión."}
          </p>
        </div>
      )}

      {estado && puede && (estado.cambios.elegibles > 0 || vigente) && (
        <div className="mt-3">
          <Button
            variant={!vigente || hayCambios ? "primary" : "outline"}
            disabled={creando || estado.cambios.elegibles === 0}
            onClick={() => (vigente ? setConfirmando(true) : crear())}
          >
            {creando ? "Creando…" : vigente ? "Crear versión nueva" : "Crear versión"}
          </Button>
        </div>
      )}
      {estado && !puede && (
        <p className="mt-3 text-xs text-label-tertiary">Crear una versión necesita el permiso «Ejecutar entrenamiento».</p>
      )}

      <Dialog open={confirmando} onOpenChange={(o) => !creando && setConfirmando(o)}>
        <DialogHeader
          title="¿Crear una versión nueva?"
          description="Las fotos se vuelven a repartir. Los centroides, el umbral OSR y los releases hechos con la versión anterior quedan desactualizados: hay que recalcularlos y volver a validar."
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={creando} onClick={() => setConfirmando(false)}>Volver</Button>
          <Button variant="primary" loading={creando} disabled={creando} onClick={crear}>{creando ? "Creando…" : "Crear versión"}</Button>
        </div>
      </Dialog>
    </Card>
  );
}
