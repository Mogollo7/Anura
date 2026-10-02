"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatasetError, type DatasetEspecie } from "@/lib/dataset/dataset-client";
import { borrarEspecie, borrarFotosEspecie, type DependenciaEspecie } from "@/components/catalog/taxonomia-api";

/**
 * Borrar una especie solo es posible si nada apunta a su fila. Si algo apunta, el servidor responde
 * qué hay (fotos, vectores, paquetes…) y aquí se muestra con lo que hay que quitar antes.
 *
 * Cuando el bloqueo es solo por fotos (y la especie no tiene paquetes ni otras dependencias duras),
 * se ofrece "Borrar todas las fotos y la especie" en un solo paso: primero borra las fotos de la BD
 * y de MinIO, luego borra la especie. Se pide confirmación explícita escribiendo el nombre.
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
  // Confirmación de borrado en cascada (fotos + especie)
  const [confirmando, setConfirmando] = useState(false);
  const [confirmTexto, setConfirmTexto] = useState("");

  useEffect(() => {
    setError(null);
    setDeps([]);
    setConfirmando(false);
    setConfirmTexto("");
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

  async function borrarConFotos() {
    if (!especie) return;
    setTrabajando(true);
    setError(null);
    try {
      // 1. Borra todas las fotos (BD + MinIO)
      await borrarFotosEspecie(especie.id);
      // 2. Ahora la especie ya no tiene fotos: la borra
      const r = await borrarEspecie(especie.id);
      onBorrada(r.nombre_cientifico);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el borrado. Intenta de nuevo.");
      setConfirmando(false);
      setConfirmTexto("");
    } finally {
      setTrabajando(false);
    }
  }

  // ¿El único bloqueo son las fotos (y sus vectores, que salen con ellas)?
  // "foto" puede aparecer si el backend devuelve la tabla sin prefijo de schema.
  const CLAVES_FOTO = new Set(["fotos", "vectores", "foto", "embedding"]);
  const soloBloqueoPorFotos =
    deps.length > 0 &&
    deps.every((d) => CLAVES_FOTO.has(d.clave));


  const nombreCoincide = confirmTexto.trim() === especie?.nombre_cientifico;

  return (
    <Dialog open={!!especie} onOpenChange={(v) => !v && !trabajando && onCerrar()}>
      <DialogHeader
        title={especie ? `Borrar ${especie.nombre_cientifico}` : "Borrar especie"}
        description="Solo se borra si ninguna foto, vector ni paquete apunta a ella. Queda registrado en la auditoría. No se puede deshacer."
      />

      {/* Aviso preventivo antes de intentar si la especie ya tiene fotos */}
      {especie && especie.fotos > 0 && deps.length === 0 && (
        <p className="mb-3 rounded-md bg-warning/10 px-3 py-2 text-sm text-label-primary">
          Tiene {especie.fotos.toLocaleString("es-CO")} {especie.fotos === 1 ? "foto" : "fotos"}: el servidor va a rechazar el borrado hasta que las quites en Imágenes.
        </p>
      )}

      {/* Error general + lista de dependencias */}
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

      {/* Oferta de borrado en cascada cuando el único bloqueo son fotos/vectores */}
      {soloBloqueoPorFotos && !confirmando && (
        <div className="mb-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-3 text-sm space-y-2">
          <p className="font-medium text-danger">
            ¿Borrar todas las fotos y la especie en un solo paso?
          </p>
          <p className="text-label-secondary">
            Esto elimina permanentemente{" "}
            <span className="font-medium text-label-primary">
              {deps.find((d) => d.clave === "fotos")?.total.toLocaleString("es-CO") ?? "todas las"} fotos
            </span>{" "}
            de la BD y de MinIO, y luego borra la especie. No se puede deshacer.
          </p>
          <Button
            variant="danger"
            className="text-xs"
            disabled={trabajando}
            onClick={() => setConfirmando(true)}
          >
            Borrar fotos y especie…
          </Button>
        </div>
      )}

      {/* Confirmación explícita: el usuario tiene que escribir el nombre */}
      {confirmando && (
        <div className="mb-3 rounded-md border border-danger bg-danger/10 px-3 py-3 text-sm space-y-3">
          <p className="font-medium text-danger">Confirma escribiendo el nombre científico:</p>
          <p className="font-mono text-xs bg-surface-subtle rounded px-2 py-1 text-label-primary select-all">
            {especie?.nombre_cientifico}
          </p>
          <input
            type="text"
            autoFocus
            value={confirmTexto}
            onChange={(e) => setConfirmTexto(e.target.value)}
            placeholder="Escribe el nombre exacto…"
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-label-primary outline-none focus:border-danger focus:ring-1 focus:ring-danger"
            disabled={trabajando}
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="text-xs"
              disabled={trabajando}
              onClick={() => { setConfirmando(false); setConfirmTexto(""); }}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              className="text-xs"
              loading={trabajando}
              disabled={trabajando || !nombreCoincide}
              onClick={() => void borrarConFotos()}
            >
              {trabajando ? "Borrando…" : "Confirmar borrado"}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={trabajando} onClick={onCerrar}>
          Volver
        </Button>
        <Button variant="danger" loading={trabajando} disabled={trabajando} onClick={() => void borrar()}>
          {trabajando ? "Borrando…" : "Borrar especie"}
        </Button>
      </div>
    </Dialog>
  );
}
