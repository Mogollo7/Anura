"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatasetError, type DatasetEspecie } from "@/lib/dataset/dataset-client";
import { borrarEspecie, type DependenciaEspecie } from "@/components/catalog/taxonomia-api";

/**
 * Borrar una especie solo es posible si nada apunta a su fila. Si algo apunta, el servidor responde
 * qué hay (fotos, vectores, paquetes…) y aquí se muestra con lo que hay que quitar antes.
 */
export function DeleteSpeciesDialog({
  especie,
  onCerrar,
  onBorrada,
}: {
  /** Con especie el diálogo está abierto. */
  especie: DatasetEspecie | null;
  onCerrar: () => void;
  onBorrada: (nombre: string) => void;
}) {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deps, setDeps] = useState<DependenciaEspecie[]>([]);

  useEffect(() => {
    setError(null);
    setDeps([]);
  }, [especie]);

  async function borrar() {
    if (!especie) return;
    setTrabajando(true);
    setError(null);
    setDeps([]);
    try {
      const r = await borrarEspecie(especie.id);
      onBorrada(r.nombre_cientifico);
    } catch (err) {
      if (err instanceof DatasetError && err.body.codigo === "especie_con_datos") {
        setDeps(((err.body.detalle as { dependencias?: DependenciaEspecie[] } | undefined)?.dependencias) ?? []);
      }
      setError(err instanceof Error ? err.message : "No se pudo borrar la especie. Intenta de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Dialog open={!!especie} onOpenChange={(v) => !v && !trabajando && onCerrar()}>
      <DialogHeader
        title={especie ? `Borrar ${especie.nombre_cientifico}` : "Borrar especie"}
        description="Solo se borra si ninguna foto, vector ni paquete apunta a ella. Queda registrado en la auditoría. No se puede deshacer."
      />
      {especie && especie.fotos > 0 && deps.length === 0 && (
        <p className="mb-3 rounded-md bg-warning/10 px-3 py-2 text-sm text-label-primary">
          Tiene {especie.fotos.toLocaleString("es-CO")} {especie.fotos === 1 ? "foto" : "fotos"}: el servidor va a rechazar el borrado hasta que las quites en Imágenes.
        </p>
      )}
      {error && (
        <div role="alert" className="mb-3 space-y-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <p>{error}</p>
          {deps.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-label-primary">
              {deps.map((d) => (
                <li key={`${d.clave}-${d.que}`}>
                  <span className="font-medium">
                    {d.total.toLocaleString("es-CO")} {d.que}
                  </span>
                  . {d.quitar}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={trabajando} onClick={onCerrar}>
          Volver
        </Button>
        <Button variant="danger" disabled={trabajando} onClick={() => void borrar()}>
          {trabajando ? "Borrando…" : "Borrar especie"}
        </Button>
      </div>
    </Dialog>
  );
}
