import { Card } from "@/components/ui/card";

const PASOS: { titulo: string; detalle: string }[] = [
  {
    titulo: "Traer fotos de iNaturalist",
    detalle:
      "En Scraping ves qué hay de cada especie. La descarga masiva la hace el script del proyecto en el PC y sus fotos se importan al servidor con licencia, autor y coordenada.",
  },
  {
    titulo: "Subir una foto a mano",
    detalle:
      "Con «Subir foto» en cada especie. Se lee el GPS de la foto o se escribe la coordenada; el servidor comprueba en qué departamento cae (si es fuera de Colombia, pide confirmar) y guarda la foto sin metadatos, con su licencia y autor.",
  },
  {
    titulo: "Limpiar",
    detalle:
      "En Calidad se deciden las coordenadas aproximadas o atípicas, las fotos sin coordenada y las licencias. Aquí se excluye una foto o se invalida una observación, siempre con motivo. Nada se borra.",
  },
  {
    titulo: "Etiquetar",
    detalle: "Estadio, sustrato y morfo de cada individuo se marcan aquí, en las observaciones de cada especie.",
  },
  {
    titulo: "Crear la versión del dataset",
    detalle:
      "En Centroides. La versión reparte las fotos entre entrenamiento, validación y prueba, siempre por individuo. Lo que excluyes o invalidas aquí sale de la versión siguiente.",
  },
];

/** Cómo llegan las fotos al servidor y qué pasa después con ellas. */
export function PhotoSourcesCard() {
  return (
    <Card>
      <ol className="space-y-3">
        {PASOS.map((p, i) => (
          <li key={p.titulo} className="grid gap-1 sm:grid-cols-[28px_1fr]">
            <span className="text-sm font-semibold tabular-nums text-label-secondary">{i + 1}</span>
            <div>
              <p className="text-sm font-medium text-label-primary">{p.titulo}</p>
              <p className="text-sm text-label-secondary">{p.detalle}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
