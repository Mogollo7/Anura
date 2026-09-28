import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { REAL } from "@/lib/data/real";

const PASOS: { titulo: string; estado: "existe" | "falta"; detalle: string; donde: string }[] = [
  {
    titulo: "Descarga automática de fotos y coordenadas",
    estado: "existe",
    detalle:
      "Busca la especie en iNaturalist (grado de investigación), baja las fotos con licencia y guarda por foto la observación, latitud, longitud, precisión, fecha, autor y licencia.",
    donde: "D:\\Anura\\scraper_inaturalist.py → data dirty\\<Especie>\\ + fotos_metadata.json",
  },
  {
    titulo: "Registros sin foto (GBIF + iNaturalist)",
    estado: "existe",
    detalle: "Solo coordenadas: alimentan la altitud de la ficha y la presencia por subregión, no el entrenamiento.",
    donde: "pipeline_dataset/descargar_gbif_*.py → COLOMBIA_ANURA/ANTIOQUIA/occurrences/records_v1.csv",
  },
  {
    titulo: "Limpieza",
    estado: "existe",
    detalle: "Duplicados, fotos que no muestran la rana y revisión en CVAT. Lo que queda es el dataset curado.",
    donde: "data cleaned\\<carpeta de la especie>\\",
  },
  {
    titulo: "Particiones por observación",
    estado: "existe",
    detalle: "Entrenamiento, validación y prueba; las fotos de una misma observación no se reparten entre particiones.",
    donde: "training/manifiesto.json",
  },
  {
    titulo: "Subir una foto a mano con su coordenada",
    estado: "existe",
    detalle:
      "Botón \"Subir foto\" en la tarjeta de abajo: lee el GPS del EXIF o se escribe la coordenada, geo-service comprueba en qué departamento cae (fuera de Colombia pide confirmar) y la foto va a MinIO como JPG sin metadatos, con licencia y autor.",
    donde: "dataset-service POST /api/dataset/especies/:id/fotos · geo-service /api/geo/ubicacion",
  },
  {
    titulo: "Fotos en el servidor",
    estado: "existe",
    detalle:
      "Las fotos limpias están en MinIO con su procedencia en Postgres: licencia, observación, coordenada (de records_v1 o de la API de iNaturalist) y partición del manifiesto. Con sesión iniciada, la tarjeta \"Fotos en el servidor\" de abajo las muestra, y excluir una foto o invalidar una observación queda en el servidor con motivo y auditoría. Estadio y morfo siguen en la muestra simulada.",
    donde: "tools/dataset/import_to_minio.py → MinIO anura-dataset · dataset-service",
  },
];

/** De dónde salen las fotos del dataset y dónde viven. Todo lo marcado "existe" es un script real del repo. */
export function PhotoSourcesCard() {
  return (
    <Card>
      <CardHeader className="mb-2">
        <CardTitle>De dónde salen las fotos</CardTitle>
        <Badge tone="neutral">datos reales al {REAL.generado}</Badge>
      </CardHeader>
      <ol className="space-y-3">
        {PASOS.map((p, i) => (
          <li key={p.titulo} className="grid gap-1 sm:grid-cols-[28px_1fr]">
            <span className="text-sm font-semibold tabular-nums text-label-secondary">{i + 1}</span>
            <div>
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-label-primary">
                {p.titulo}
                <Badge tone={p.estado === "existe" ? "accent" : "warning"}>{p.estado === "existe" ? "Existe" : "Falta"}</Badge>
              </p>
              <p className="text-sm text-label-secondary">{p.detalle}</p>
              <p className="mt-0.5 break-all font-mono text-xs text-label-secondary">{p.donde}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
