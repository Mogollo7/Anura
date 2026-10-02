"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { NameCombobox, type OpcionNombre } from "@/components/catalog/name-combobox";
import { useNombresGuardados } from "@/components/catalog/taxonomia-api";
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
 * Nombre, género y familia son combobox con lo que ya está guardado; un género o una familia
 * nuevos no tienen pantalla propia: existen al guardar la especie que los usa.
 */
export function SpeciesIntakeForm({
  abierto,
  onCerrar,
  especie,
  onGuardada,
  onAbrirExistente,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** Con especie se edita; sin ella se crea. */
  especie?: DatasetEspecie | null;
  onGuardada: (e: EspecieCreada, corregidas: number) => void;
  onAbrirExistente: (especieId: number) => void;
}) {
  const editando = !!especie;
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

  const guardados = useNombresGuardados(abierto, especie);
  const genero = generoDelNombre(nombre);
  const resto = nombre.trim().includes(" ") ? nombre.trim().slice(nombre.trim().indexOf(" ")) : "";
  const generoGuardado = guardados?.generos.find((g) => g.nombre === genero);

  const opcionesNombre = useMemo<OpcionNombre[]>(
    () => (guardados?.especies ?? []).map((e) => ({ valor: e.nombre_cientifico, detalle: e.id === especie?.id ? "esta especie" : `ya existe · ${e.familia}` })),
    [guardados, especie]
  );
  const opcionesGenero = useMemo<OpcionNombre[]>(
    () => (guardados?.generos ?? []).map((g) => ({ valor: g.nombre, detalle: `${g.familia} · ${g.especies === 1 ? "1 especie" : `${g.especies} especies`}` })),
    [guardados]
  );
  const opcionesFamilia = useMemo<OpcionNombre[]>(
    () => (guardados?.familias ?? []).map((f) => ({ valor: f.nombre, detalle: `${f.generos === 1 ? "1 género" : `${f.generos} géneros`} · ${f.especies === 1 ? "1 especie" : `${f.especies} especies`}` })),
    [guardados]
  );

  // Un género que ya está guardado pertenece a una sola familia: se propone si la familia sigue vacía.
  useEffect(() => {
    if (!editando && generoGuardado && familia.trim() === "") setFamilia(generoGuardado.familia);
  }, [editando, generoGuardado, familia]);

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
          hint={genero ? `Género: ${genero}. Sale del nombre.` : "Género y epíteto, por ejemplo Boana boans. Si no está en la lista, escríbelo completo."}
        >
          <NameCombobox
            value={nombre}
            onChange={setNombre}
            opciones={opcionesNombre}
            placeholder="Boana boans"
            maxLength={80}
            autoFocus
            italico
            etiquetaNuevo="no está guardada: se creará al guardar"
          />
        </Field>
        <Field
          label="Género"
          hint={
            generoGuardado
              ? `${generoGuardado.nombre} ya está en ${generoGuardado.familia}.`
              : genero
                ? `${genero} no está guardado: se creará con esta especie.`
                : "Es la primera palabra del nombre; también puedes elegirlo aquí."
          }
        >
          <NameCombobox
            value={genero ?? nombre.trim().split(/\s+/)[0] ?? ""}
            onChange={(v) => setNombre(`${v.trim()}${resto}`)}
            opciones={opcionesGenero}
            placeholder="Boana"
            maxLength={40}
            italico
            etiquetaNuevo="no está guardado: se creará con esta especie"
            ariaLabel="Género"
          />
        </Field>
        <Field label="Familia" hint="Una palabra que termina en «-idae», por ejemplo Hylidae. Si no está en la lista, escríbela.">
          <NameCombobox
            value={familia}
            onChange={setFamilia}
            opciones={opcionesFamilia}
            placeholder="Hylidae"
            maxLength={60}
            etiquetaNuevo="no está guardada: se creará con esta especie"
          />
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
          <Button type="submit" variant="primary" loading={trabajando} disabled={!listo || sinCambios || trabajando}>
            {trabajando ? "Guardando…" : editando ? "Guardar cambios" : "Crear especie"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
