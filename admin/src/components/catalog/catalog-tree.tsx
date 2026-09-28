"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, FolderTree, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FamilyNode, SpeciesEntry } from "@/lib/mock/catalog";

export function CatalogTree({
  tree,
  selectedId,
  onSelect,
}: {
  tree: FamilyNode[];
  selectedId: string | null;
  onSelect: (species: SpeciesEntry) => void;
}) {
  return (
    <nav className="space-y-0.5">
      {tree.map((family) => (
        <FamilyRow key={family.familia} family={family} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </nav>
  );
}

function FamilyRow({
  family,
  selectedId,
  onSelect,
}: {
  family: FamilyNode;
  selectedId: string | null;
  onSelect: (species: SpeciesEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const speciesCount = family.generos.reduce((n, g) => n + g.especies.length, 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium text-label-primary hover:bg-surface-subtle"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FolderTree size={14} className="text-label-tertiary" />
        {family.familia}
        <span className="ml-auto text-xs font-normal text-label-tertiary">{speciesCount}</span>
      </button>
      {open && (
        <div className="ml-4 space-y-0.5 border-l border-border pl-2">
          {family.generos.map((genero) => (
            <GeneroRow
              key={genero.genero}
              genero={genero.genero}
              especies={genero.especies}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GeneroRow({
  genero,
  especies,
  selectedId,
  onSelect,
}: {
  genero: string;
  especies: SpeciesEntry[];
  selectedId: string | null;
  onSelect: (species: SpeciesEntry) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-label-secondary hover:bg-surface-subtle hover:text-label-primary"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="italic">{genero}</span>
        <span className="ml-auto text-xs text-label-tertiary">{especies.length}</span>
      </button>
      {open && (
        <div className="ml-4 space-y-0.5 border-l border-border pl-2">
          {especies.map((sp) => (
            <button
              key={sp.id}
              type="button"
              onClick={() => onSelect(sp)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm italic transition-colors",
                selectedId === sp.id
                  ? "bg-accent-wash font-medium text-accent-ink"
                  : "text-label-secondary hover:bg-surface-subtle hover:text-label-primary"
              )}
            >
              <Leaf size={12} className="shrink-0 not-italic" />
              {sp.especie}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
