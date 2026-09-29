import { OsrConsole } from "@/components/osr/osr-console";

export default function OsrPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">OSR · rechazo de desconocidas</h1>
        <p className="text-sm text-label-secondary">
          Calcula el umbral τ que impide que la app le ponga nombre a una rana que no conoce. El servidor lo mide con los vectores
          reales y lo propone; una persona lo valida o lo ajusta. El release usa el último τ validado de cada paquete.
        </p>
      </div>
      <OsrConsole />
    </div>
  );
}
