"use client";

import { useEffect, useState } from "react";
import { send } from "@/lib/dataset/dataset-client";

/** Lo que ya está guardado en dataset.especie. Género y familia no son filas: salen de sus columnas. */
export type NombresGuardados = {
  especies: { id: number; nombre_cientifico: string; genero: string; familia: string }[];
  generos: { nombre: string; familia: string; especies: number }[];
  familias: { nombre: string; generos: number; especies: number }[];
};

export type DependenciaEspecie = { clave: string; que: string; total: number; quitar: string };

export const getNombresGuardados = () => send<NombresGuardados>("GET", "/api/dataset/especies/nombres");

/** Falla con 409 y `body.detalle.dependencias` si la especie aún tiene fotos, vectores, paquetes u otras filas. */
export const borrarEspecie = (id: number) =>
  send<{ id: number; nombre_cientifico: string; borrada: true }>("DELETE", `/api/dataset/especies/${id}`);

/**
 * Nombres que ya están en la base, para los combobox. `null` mientras carga; si no se pueden leer
 * (sin permiso, servicio caído) queda vacío y el campo sigue aceptando texto libre.
 * `recarga` fuerza una lectura nueva (p. ej. cada vez que se abre el formulario).
 */
export function useNombresGuardados(activo = true, recarga: unknown = 0): NombresGuardados | null {
  const [datos, setDatos] = useState<NombresGuardados | null>(null);
  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    getNombresGuardados()
      .then((d) => !cancelado && setDatos(d))
      .catch(() => !cancelado && setDatos({ especies: [], generos: [], familias: [] }));
    return () => {
      cancelado = true;
    };
  }, [activo, recarga]);
  return datos;
}
