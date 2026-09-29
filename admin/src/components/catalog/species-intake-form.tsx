"use client";

import { useEffect, useId, useState } from "react";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  crearEspecie,
  DatasetError,
  editarEspecie,
  type DatasetEspecie,
  type EspecieCreada,
} from "@/lib/dataset/dataset-client";
import { generoDelNombre } from "@/lib/catalog/intake";

type Conflicto =
  | { tipo: "familia"; genero: string; familiaActual: string; especies: string[] }
  | { tipo: "existente"; especieId: number };

/**
 * Único formulario para crear y editar una especie: escribe en dataset.especie, la misma fila
 * que leen Imágenes, Contenido, Centroides, los paquetes y la app. El servidor valida el
 * nombre (binomial), la familia y la coherencia del género; aquí solo se muestra lo que dice.
 * `familias` son las que ya existen en el servidor, para no reescribirlas a mano.
 */
export function SpeciesIntakeForm({
  abierto,
  onCerrar,
  especie,
  familias,
  onGuardada,
  onAbrirExistente,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** Con especie se edita; sin ella se crea. */
  especie?: DatasetEspecie | null;
  familias: string[];
  onGuardada: (e: EspecieCreada, corregidas: number) => void;
  onAbrirExistente: (especieId: number) => void;
}) {
  const editando = !!especie;
  const listaId = useId();
  const [nombre, setNombre] = useState("");
  const [familia, setFamilia] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicto, setConflicto] = useState<Conflicto | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setNombre(especie?.nombre_cientifico ?? "");
    setFamilia(especie?.familia ?? "");
    setError(null);
    setConflicto(null);
  }, [abierto, especie]);

  const genero = generoDelNombre(nombre);
  const listo = nombre.trim() !== "" && familia.trim() !== "";
  const sinCambios = editando && nombre.trim() === especie.nombre_cientifico && familia.trim() === especie.familia;

  async function guardar(corregirGenero = false) {
    setTrabajando(true);
    setError(null);
    setConflicto(null);
    try {
      if (editando) {
        const cambios: Parameters<typeof editarEspecie>[1] = {};
        if (nombre.trim() !== especie.nombre_cientifico) cambios.nombre_cientifico = nombre.trim();
        if (familia.trim() !== especie.familia) cambios.familia = familia.trim();
        if (corregirGenero) cambios.aplicar_a_congeneres = true;
        const r = await editarEspecie(especie.id, cambios);
        onGuardada(r, r.congeneres_corregidos);
      } else {
        onGuardada(await crearEspecie({ nombre_cientifico: nombre.trim(), familia: familia.trim() }), 0);
      }
    } catch (err) {
      if (err instanceof DatasetError && err.body.codigo === "familia_del_genero") {
        const d = err.body.detalle as { genero: string; familia_actual: string; especies: string[] };
        setConflicto({ tipo: "familia", genero: d.genero, familiaActual: d.familia_actual, especies: d.especies });
      } else if (err instanceof DatasetError && err.body.codigo === "especie_existente" && (err.body.detalle as { especie_id?: number } | undefined)?.especie_id) {
        setConflicto({ tipo: "existente", especieId: (err.body.detalle as { especie_id: number }).especie_id });
      }
      setError(err instanceof Error ? err.message : "No se pudo guardar la especie. Intenta de nuevo.");
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && !trabajando && onCerrar()}>
      <DialogHeader
        title={editando ? "Editar especie" : "Añadir especie"}
        description={
          editando
            ? "Corrige el nombre o la familia. El identificador y la carpeta de sus fotos no cambian."
            : "Escribe su nombre científico y su familia. Con eso ya existe para Imágenes, Contenido y los paquetes."
        }
      />
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          if (listo && !sinCambios && !trabajando) void guardar();
        }}
        className="space-y-4"
      >
        <Field
          label="Nombre científico"
          hint={genero ? `Género: ${genero}. Sale del nombre.` : "Género y epíteto, por ejemplo Boana boans."}
        >
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Boana boans"
            maxLength={80}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="italic"
          />
        </Field>
        <Field label="Familia" hint="Una palabra que termina en «-idae», por ejemplo Hylidae.">
          <Input
            value={familia}
            onChange={(e) => setFamilia(e.target.value)}
            placeholder="Hylidae"
            maxLength={60}
            autoComplete="off"
            spellCheck={false}
            list={listaId}
          />
          <datalist id={listaId}>
            {familias.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </Field>

        {error && (
          <div role="alert" className="space-y-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            <p>{error}</p>
            {conflicto?.tipo === "existente" && (
              <Button type="button" variant="outline" className="px-2.5 py-1 text-xs" onClick={() => onAbrirExistente(conflicto.especieId)}>
                Abrir la especie existente
              </Button>
            )}
            {conflicto?.tipo === "familia" && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="px-2.5 py-1 text-xs"
                  onClick={() => {
                    setFamilia(conflicto.familiaActual);
                    setError(null);
                    setConflicto(null);
                  }}
                >
                  Usar {conflicto.familiaActual}
                </Button>
                {editando && (
                  <Button type="button" variant="outline" className="px-2.5 py-1 text-xs" disabled={trabajando} onClick={() => void guardar(true)}>
                    Corregir el género completo ({conflicto.especies.length === 1 ? "1 especie" : `${conflicto.especies.length} especies`} más)
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCerrar} disabled={trabajando}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!listo || sinCambios || trabajando}>
            {trabajando ? "Guardando…" : editando ? "Guardar cambios" : "Crear especie"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
