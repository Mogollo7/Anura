"use client";

import { useEffect, useState } from "react";

const ESPERA_BARRA_MS = 1_200;
const ESPERA_ETA_MS = 5_000;

function duracion(ms: number) {
  const segundos = Math.max(1, Math.ceil(ms / 1000));
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return resto ? `${minutos} min ${resto} s` : `${minutos} min`;
}

export function TaskProgress({ taskKey, label }: { taskKey: string; label: string }) {
  const [transcurrido, setTranscurrido] = useState(0);
  const [duracionAnterior] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const anterior = Number(window.localStorage.getItem(`anura:duracion-tarea:${taskKey}`));
    return Number.isFinite(anterior) && anterior > 0 ? anterior : null;
  });

  useEffect(() => {
    const clave = `anura:duracion-tarea:${taskKey}`;
    const inicio = Date.now();
    const reloj = window.setInterval(() => setTranscurrido(Date.now() - inicio), 500);
    return () => {
      window.clearInterval(reloj);
      const total = Date.now() - inicio;
      if (total >= 2_500) window.localStorage.setItem(clave, String(total));
    };
  }, [taskKey]);

  if (transcurrido < ESPERA_BARRA_MS) return null;

  const detalle = transcurrido < ESPERA_ETA_MS
    ? `Transcurrido: ${duracion(transcurrido)}`
    : duracionAnterior === null
      ? `Transcurrido: ${duracion(transcurrido)} · estimando duración para próximas ejecuciones`
      : transcurrido <= duracionAnterior
        ? `Tiempo estimado restante: ~${duracion(duracionAnterior - transcurrido)} · según la última ejecución`
        : `La última ejecución tardó ${duracion(duracionAnterior)}; esta lleva ${duracion(transcurrido)}`;

  return (
    <div className="space-y-1.5" aria-live="polite">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuetext={`${label}. ${detalle}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-border"
      >
        <div className="h-full w-1/3 rounded-full bg-accent-ink animate-task-progress" />
      </div>
      <p className="text-xs text-label-secondary">{label} · {detalle}</p>
    </div>
  );
}