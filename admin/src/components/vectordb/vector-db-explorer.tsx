"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import type { VectorCollection } from "@/lib/mock/vector-db";
import { getEmbeddingScatter, getIndexInfo, getVectorMetadataSample } from "@/lib/mock/vector-db";
import { EmbeddingScatter } from "./embedding-scatter";
import { VectorMetadataTable } from "./vector-metadata-table";
import { IndexPanel } from "./index-panel";

export function VectorDbExplorer({ collections }: { collections: VectorCollection[] }) {
  const [selectedId, setSelectedId] = useState(collections[0]?.packageId);
  const collection = collections.find((c) => c.packageId === selectedId) ?? collections[0];
  if (!collection) return <p className="text-sm text-label-secondary">Sin colecciones disponibles.</p>;

  const points = getEmbeddingScatter(collection);
  const metadata = getVectorMetadataSample(collection);
  const index = getIndexInfo(collection);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        {collections.map((c) => (
          <button
            key={c.packageId}
            type="button"
            onClick={() => setSelectedId(c.packageId)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              c.packageId === collection.packageId
                ? "bg-cta-bg text-cta-fg"
                : "bg-surface-subtle text-label-secondary hover:text-label-primary"
            )}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-label-primary">{collection.nombre}</h2>
            <p className="font-mono text-xs text-label-secondary">{collection.tabla}</p>
          </div>
          <div className="flex gap-4 text-right text-sm">
            <div>
              <p className="font-semibold text-label-primary">{collection.especies.length}</p>
              <p className="text-xs text-label-secondary">especies</p>
            </div>
            <div>
              <p className="font-semibold text-label-primary">{collection.totalVectores.toLocaleString("es-CO")}</p>
              <p className="text-xs text-label-secondary">vectores</p>
            </div>
            <div>
              <p className="font-semibold text-label-primary">{collection.sizeMb} MB</p>
              <p className="text-xs text-label-secondary">.sqlite</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>Embeddings (proyección 2D)</CardTitle></CardHeader>
          <EmbeddingScatter collection={collection} points={points} />
        </Card>
        <Card>
          <CardHeader><CardTitle>Índice</CardTitle></CardHeader>
          <IndexPanel info={index} />
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Metadatos de vectores</CardTitle></CardHeader>
        <VectorMetadataTable rows={metadata} total={collection.totalVectores} />
      </Card>
    </div>
  );
}
