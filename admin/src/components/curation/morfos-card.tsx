"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { usePanelSession } from "@/lib/session/panel-session";
import { declararMorfo, quitarMorfo } from "@/lib/dataset/dataset-client";
import type { Morfo, SubregionActiva } from "@/lib/dataset/etiquetas";

/**
 * Morfos de una especie por subregión. Se declaran aquí y luego se asignan a cada individuo
 * (observación) abajo. Quitar uno deja a sus individuos sin morfo; el estadio no se toca.
 */
export function MorfosCard({
  especieId,
  morfos,
  subregiones,
  onCambio,
}: {
  especieId: number;
  morfos: Morfo[];
  subregiones: SubregionActiva[];
  onCambio: () => void;
}) {
  const session = usePanelSession();
  const puede = session.can("definirMorfo");
  const [nombre, setNombre] = useState("");
  const [subregionId, setSubregionId] = useState("");
  const [nota, setNota] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function declarar(ev: React.FormEvent) {
    ev.preventDefault();
    setTrabajando(true);
    setError(null);
    try {
      await declararMorfo(especieId, { subregion_id: Number(subregionId), nombre: nombre.trim(), nota: nota.trim() || undefined });
      setNombre("");
      setNota("");
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo declarar el morfo");
    } finally {
      setTrabajando(false);
    }
  }

  async function quitar(m: Morfo) {
    const aviso = m.individuos
      ? `¿Quitar el morfo «${m.nombre}»? ${m.individuos === 1 ? "Su individuo queda" : `Sus ${m.individuos} individuos quedan`} sin morfo.`
      : `¿Quitar el morfo «${m.nombre}»?`;
    if (!window.confirm(aviso)) return;
    setError(null);
    try {
      await quitarMorfo(m.id);
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el morfo");
    }
  }

  return (
    <Card>
      <CardHeader className="mb-2">
        <CardTitle>Morfos</CardTitle>
        <Badge tone="neutral">{morfos.length}</Badge>
      </CardHeader>
      <p className="mb-3 text-xs text-label-secondary">
        Declara las variantes de color o patrón que existen en una subregión. Después, asigna el morfo a cada individuo en
        las observaciones de abajo. Centroides calcula un centroide por morfo cuando hay suficientes individuos.
      </p>
      {morfos.length === 0 ? (
        <p className="mb-3 text-sm text-label-secondary">Esta especie no tiene morfos declarados.</p>
      ) : (
        <ul className="mb-3 divide-y divide-border rounded-md border border-border">
          {morfos.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-label-primary">{m.nombre}</span>
                <span className="text-label-secondary"> · {m.subregion}</span>
                {m.nota && <span className="block truncate text-xs text-label-tertiary">{m.nota}</span>}
              </span>
              <Badge tone="neutral">{m.individuos === 1 ? "1 individuo" : `${m.individuos} individuos`}</Badge>
              {puede && (
                <Button variant="ghost" className="px-1.5 py-1 text-xs text-danger" onClick={() => quitar(m)} aria-label={`Quitar morfo ${m.nombre}`}>
                  <Trash2 size={12} aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puede ? (
        <form onSubmit={declarar} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Nombre del morfo">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="rojo, amarillo…" required />
          </Field>
          <Field label="Subregión">
            <Select value={subregionId} onChange={(e) => setSubregionId(e.target.value)} required disabled={!subregiones.length}>
              <option value="">{subregiones.length ? "Elige una subregión" : "Activa una región en Paquetes primero"}</option>
              {subregiones.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} ({s.region})
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="primary" disabled={trabajando || !nombre.trim() || !subregionId}>
            <Plus size={14} aria-hidden /> Declarar
          </Button>
          <div className="sm:col-span-3">
            <Field label="Nota (opcional)">
              <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Cómo se distingue en campo" />
            </Field>
          </div>
        </form>
      ) : (
        <p className="text-xs text-label-tertiary">Declarar morfos necesita el permiso Definir morph id.</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
