import { CompilerConsole } from "@/components/compiler/compiler-console";

export default function CompiladorPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Compilador y releases</h1>
        <p className="text-sm text-label-secondary">
          Une taxonomía, centroides, morfos, contexto, OSR y micro-adaptadores en un JSON por subregión (nueve
          descargas, no treinta y seis). Congela también el umbral geográfico y su política. Exige la validación técnica
          al día para compilar, rechaza pesos inválidos o morfos opuestos sin datos, y no publica sin las dos aprobaciones:
          científica primero, técnica después. El simulador solo identifica contra lo que queda publicado.
        </p>
      </div>
      <CompilerConsole />
    </div>
  );
}
