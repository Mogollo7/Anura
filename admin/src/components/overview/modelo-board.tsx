"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TRow, TH, TD } from "@/components/ui/table";
import { ANTIOQUIA_SUBREGIONES } from "@/lib/packages/antioquia-subregiones";
import { NAV_AREAS, type NavItem } from "@/config/nav";
import { auditarIntake, especieNombre } from "@/lib/catalog/intake";
import { useIntakeStore } from "@/lib/catalog/intake-store";
import { useAppResource } from "@/lib/app-data/app-client";
import { getRegiones, getResumen, getTrabajos } from "@/lib/dataset/dataset-client";

const AREA = NAV_AREAS.find((a) => a.href === "/modelo")!;
const ETAPAS = ["conseguir", "limpiar", "procesar", "resultado"] as const;

const cifra = (n: number | null) => (n == null ? "—" : n.toLocaleString("es-CO"));

export function ModeloBoard() {
  const resumen = useAppResource(getResumen);
  const regionesRes = useAppResource(() => getRegiones());
  const worker = useAppResource(getTrabajos);
  const especies = resumen.value.state === "listo" ? resumen.value.data.especies.length : null;
  const regiones =
    regionesRes.value.state === "listo"
      ? regionesRes.value.data.departamentos.filter((d) => d.estado === "activa").reduce((n, d) => n + d.subregiones, 0)
      : null;
  const vectores = worker.value.state === "listo" ? worker.value.data.encoders.reduce((n, e) => n + e.vectores, 0) : null;
  const intake = useIntakeStore();
  const filas = intake.especies.map((s) => ({ s, a: auditarIntake(s) }));
  const regionNombre = (id: string) => ANTIOQUIA_SUBREGIONES.find((r) => r.id === id)?.nombre ?? id;

  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Modelo</h1>
        <p className="mt-1 text-sm text-label-secondary">{AREA.summary}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
        <Mini href="/catalogo" valor={cifra(especies)} etiqueta="Especies en el dataset" />
        <Mini href="/paquetes" valor={cifra(regiones)} etiqueta="Subregiones activas" />
        <Mini href="/vectorial" valor={cifra(vectores)} etiqueta="Vectores calculados" />
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {AREA.sections.map((section, i) => (
          <section key={section.title} id={ETAPAS[i]} className="scroll-mt-6">
            <Card className="flex h-full flex-col p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-label-tertiary">
                {String(i + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-1 text-base font-semibold text-label-primary">{section.title}</h2>
              <ul className="mt-3 flex flex-1 flex-col gap-2">
                {section.items.map((item) => (
                  <ToolLink key={item.href} item={item} />
                ))}
              </ul>
            </Card>
          </section>
        ))}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3 border-dashed bg-accent-wash/40 p-4">
        <p className="max-w-xl text-sm text-label-primary">
          Si el resultado no sirve, la especie vuelve a limpiarse. Las fotos que escribiste no se borran solas. El número de vectores es el mismo que muestra la DB vectorial.
        </p>
        <Link href="/modelo#limpiar" className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
          Repetir desde limpiar <ArrowRight size={14} />
        </Link>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link href="/catalogo#anadir" className="inline-flex items-center rounded-md bg-cta-bg px-3.5 py-2 text-sm font-medium text-cta-fg hover:opacity-90">
          Añadir especie
        </Link>
        <Link href="/compilador" className="inline-flex items-center rounded-md px-3 py-2 text-sm text-accent-ink hover:underline">
          Crear release
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {ETAPAS.map((etapa) => {
          const aqui = filas.filter((f) => f.a.etapa === etapa);
          return (
            <div key={etapa} className="rounded-lg border border-border bg-surface-subtle/60 p-3">
              <p className="text-xs font-semibold capitalize text-label-primary">
                {etapa}
                <span className="ml-1.5 font-normal text-label-tertiary">{aqui.length}</span>
              </p>
              <ul className="mt-2 space-y-2">
                {aqui.length === 0 && <li className="text-[11px] text-label-tertiary">Ninguna especie añadida en esta etapa.</li>}
                {aqui.map(({ s, a }) => (
                  <li key={s.id} className="rounded-md bg-surface px-2.5 py-2 text-xs shadow-card">
                    <p className="font-medium italic text-label-primary">{especieNombre(s)}</p>
                    <p className="text-label-tertiary">{regionNombre(s.subregionId)} · {a.vectores} vectores</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <Card className="p-0">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-label-primary">Especies añadidas</h2>
          <p className="text-xs text-label-secondary">La etapa sale de las fotos, la cota y los pesos que escribiste. La tabla es el detalle.</p>
        </div>
        {filas.length === 0 ? (
          <p className="px-5 py-6 text-sm text-label-secondary">Todavía no añadiste especies. El catálogo de partida sigue en Especies.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Especie</TH>
                <TH>Región</TH>
                <TH>Fotos activas</TH>
                <TH>Vectores</TH>
                <TH>Etapa</TH>
              </tr>
            </THead>
            <TBody>
              {filas.map(({ s, a }) => (
                <TRow key={s.id}>
                  <TD className="italic">{especieNombre(s)}</TD>
                  <TD>{regionNombre(s.subregionId)}</TD>
                  <TD>{a.fotosActivas}</TD>
                  <TD>{a.vectores}</TD>
                  <TD className="capitalize">{a.etapa}</TD>
                </TRow>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Mini({ href, valor, etiqueta }: { href: string; valor: string | number; etiqueta: string }) {
  return (
    <Card href={href} className="p-4">
      <p className="text-2xl font-semibold tracking-tight text-label-primary">{valor}</p>
      <p className="text-xs text-label-secondary">{etiqueta}</p>
    </Card>
  );
}

function ToolLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <li>
      <Link href={item.href} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-surface-subtle">
        <Icon size={14} className="mt-0.5 shrink-0 text-label-tertiary group-hover:text-accent-ink" />
        <span>
          <span className="block text-sm font-medium text-label-primary">{item.label}</span>
          <span className="block text-[11px] leading-snug text-label-tertiary">{item.blurb}</span>
        </span>
      </Link>
    </li>
  );
}
