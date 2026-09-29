import { CompilerConsole } from "@/components/compiler/compiler-console";

export default function CompiladorPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Release</h1>
        <p className="text-sm text-label-secondary">
          El servidor compila el paquete de una subregión (sqlite de identificación y su manifiesto) con los vectores,
          centroides, umbral OSR y Ficha de hoy. Solo compila si la validación está lista. Para que la app lo descargue
          necesita dos aprobaciones, científica y técnica: las dan dos cuentas distintas y una cuenta super puede darlas las dos.
          Después se publica. Una versión anterior se puede restaurar sin repetir el proceso.
        </p>
      </div>
      <CompilerConsole />
    </div>
  );
}
