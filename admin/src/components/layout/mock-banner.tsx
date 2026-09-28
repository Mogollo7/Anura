import { FlaskConical } from "lucide-react";

export function MockBanner() {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-accent-wash px-5 py-1.5 text-xs text-accent-ink">
      <FlaskConical size={13} strokeWidth={2.5} aria-hidden />
      <span>
        Salen del servidor: especies, fotos, embeddings, centroides globales y regionales, rechazo por especie, usuarios,
        teléfonos, observaciones y avisos. Siguen simulados los morfos, los paquetes y su entrega, sincronización,
        auditoría, calidad y analítica. El teléfono ya descarga el catálogo, reporta su dispositivo y muestra sus avisos;
        todavía no sube observaciones.
      </span>
    </div>
  );
}
