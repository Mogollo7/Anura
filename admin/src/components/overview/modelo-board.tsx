"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { NAV_AREAS, type NavItem } from "@/config/nav";
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

      <div className="flex flex-wrap gap-2">
        <Link href="/catalogo?anadir=1" className="inline-flex items-center rounded-md bg-cta-bg px-3.5 py-2 text-sm font-medium text-cta-fg hover:opacity-90">
          Añadir especie
        </Link>
        <Link href="/compilador" className="inline-flex items-center rounded-md px-3 py-2 text-sm text-accent-ink hover:underline">
          Crear release
        </Link>
      </div>
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
