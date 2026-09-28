import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/mock/packages";

export function StatusPipeline({ current, error }: { current: PipelineStage; error?: boolean }) {
  const currentIndex = PIPELINE_STAGES.findIndex((s) => s.id === current);

  return (
    <ol className="flex flex-wrap items-center gap-y-2">
      {PIPELINE_STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={stage.id} className="flex items-center">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                done && "text-accent-ink",
                active && !error && "bg-cta-bg text-cta-fg",
                active && error && "bg-danger text-danger-fg",
                !done && !active && "text-label-tertiary"
              )}
            >
              {done ? (
                <Check size={12} strokeWidth={3} />
              ) : (
                <span className="text-[11px] tabular-nums">{i + 1}</span>
              )}
              {stage.label}
            </span>
            {i < PIPELINE_STAGES.length - 1 && (
              <span className={cn("mx-1 h-px w-4", i < currentIndex ? "bg-accent-ink" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
