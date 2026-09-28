import { Badge } from "@/components/ui/badge";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/mock/packages";

const TONE: Record<PipelineStage, "neutral" | "accent" | "warning" | "danger" | "info"> = {
  borrador: "neutral",
  edicion: "neutral",
  validacion: "info",
  pruebas: "info",
  revision: "warning",
  programado: "info",
  publicado: "accent",
};

export function StageBadge({ stage, error }: { stage: PipelineStage; error?: boolean }) {
  const label = PIPELINE_STAGES.find((s) => s.id === stage)?.label ?? stage;
  return <Badge tone={error ? "danger" : TONE[stage]}>{error ? `${label} · error` : label}</Badge>;
}
