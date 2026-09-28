import { FeaturedCalendar } from "@/components/content/featured-calendar";

export default function DestacadosPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Destacados</h1>
        <p className="text-sm text-label-secondary">
          El carrusel de inicio de la app, día por día y por categoría. Solo se puede programar una especie que ya
          cumple la condición de esa categoría — la lista de fichas se filtra sola.
        </p>
      </div>
      <FeaturedCalendar />
    </div>
  );
}
