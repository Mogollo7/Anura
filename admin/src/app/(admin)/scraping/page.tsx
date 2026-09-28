import { ScrapingConsole } from "@/components/scraping/scraping-console";

export default function ScrapingPage() {
  return (
    <div className="space-y-6">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-label-primary">Scraping</h1>
        <p className="mt-1 text-sm text-label-secondary">
          Conseguir observaciones antes de curarlas. Los filtros son los del extractor de iNaturalist y los de la descarga de ocurrencias de GBIF.
        </p>
      </div>
      <ScrapingConsole />
    </div>
  );
}
