import type { ComponentType } from "react";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Smartphone,
  ClipboardList,
  ClipboardCheck,
  BookMarked,
  FileText,
  Package,
  PackageCheck,
  FlaskConical,
  Database,
  BrainCircuit,
  Target,
  Layers,
  Bell,
  Download,
  UploadCloud,
  ShieldAlert,
  ShieldQuestion,
  RefreshCw,
  History,
  FlaskConical as LabIcon,
  Settings,
  Images,
  Repeat,
  BookOpen,
  CalendarDays,
} from "lucide-react";

/** Lucide o react-icons: props que el panel sí usa. */
export type NavIcon = ComponentType<{
  size?: number | string;
  className?: string;
  strokeWidth?: number;
}>;

export type NavItem = {
  href: string;
  label: string;
  icon: NavIcon;
  phase: number;
  /** Una frase para la página de resumen, no para la barra. */
  blurb: string;
  /** Mismo botón, un nivel más adentro. Solo para temas que cuelgan del padre. */
  children?: NavItem[];
};

const SUBREGIONES_NAV: [string, string][] = [
  ["01_valle_de_aburra", "Valle de Aburrá"],
  ["02_oriente", "Oriente"],
  ["03_suroeste", "Suroeste"],
  ["04_occidente", "Occidente"],
  ["05_norte", "Norte"],
  ["06_nordeste", "Nordeste"],
  ["07_magdalena_medio", "Magdalena Medio"],
  ["08_bajo_cauca", "Bajo Cauca"],
  ["09_uraba_antioqueno", "Urabá"],
];

export type NavSection = {
  /** Etiqueta corta dentro del menú. Vacía si los ítems cuelgan directo. */
  title?: string;
  items: NavItem[];
};

export type NavArea = {
  href: string;
  label: string;
  icon: NavIcon;
  /** Texto de la página de resumen de esta área. */
  summary: string;
  sections: NavSection[];
};

/**
 * Cada área es un botón de la barra y también una página.
 * La página muestra el resumen visual y botones hacia las subsecciones.
 * La barra solo lleva el nombre: el párrafo no vive ahí.
 *
 * Modelo sigue el ciclo repetible: conseguir → limpiar → procesar → resultado.
 */
export const NAV_AREAS: NavArea[] = [
  {
    href: "/dashboard",
    label: "Inicio",
    icon: LayoutDashboard,
    summary: "Lectura del panel: actividad, alertas y el mapa de lo que está pasando.",
    sections: [
      {
        items: [
          { href: "/dashboard", label: "Resumen", icon: LayoutDashboard, phase: 1, blurb: "Indicadores y actividad reciente." },
        ],
      },
    ],
  },
  {
    href: "/analitica",
    label: "Analítica",
    icon: BarChart3,
    summary: "Crecimiento, mapa y los mismos avisos del inicio: usuarios, notificaciones y problemas.",
    sections: [
      {
        items: [
          { href: "/analitica", label: "Analítica", icon: BarChart3, phase: 1, blurb: "Actividad y densidad. No es un submenú de Inicio." },
        ],
      },
    ],
  },
  {
    href: "/modelo",
    label: "Modelo",
    icon: Repeat,
    summary: "Crear el modelo es un ciclo: conseguir fotos, limpiarlas, procesarlas y mirar el resultado. Si no sirve, se repite.",
    sections: [
      {
        title: "Conseguir",
        items: [
          { href: "/scraping", label: "Scraping", icon: Download, phase: 13, blurb: "iNaturalist y GBIF, con los mismos filtros del script." },
          { href: "/curacion", label: "Imágenes", icon: Images, phase: 13, blurb: "Fotos ya en el servidor. Excluir o invalidar, con motivo." },
          { href: "/catalogo", label: "Especies", icon: BookMarked, phase: 4, blurb: "Crear y revisar la taxonomía." },
          {
            href: "/paquetes",
            label: "Regiones",
            icon: Package,
            phase: 16,
            blurb: "Las 9 subregiones y el borrador por departamento.",
            children: SUBREGIONES_NAV.map(([id, nombre]) => ({
              href: `/paquetes?sub=${id}`,
              label: nombre,
              icon: Package,
              phase: 16,
              blurb: nombre,
            })),
          },
          { href: "/contenido", label: "Contenido", icon: BookOpen, phase: 25, blurb: "La ficha pública: qué lee la gente, aparte del modelo." },
          { href: "/destacados", label: "Destacados", icon: CalendarDays, phase: 26, blurb: "El carrusel de inicio, día por día." },
        ],
      },
      {
        title: "Limpiar",
        items: [
          { href: "/ficha-especie", label: "Ficha", icon: FileText, phase: 15, blurb: "Altitud, sustrato, atípicos y pesos." },
          { href: "/calidad", label: "Calidad", icon: ShieldAlert, phase: 9, blurb: "Lo que hay que corregir antes de entrenar." },
        ],
      },
      {
        title: "Procesar",
        items: [
          { href: "/ia", label: "Worker", icon: BrainCircuit, phase: 17, blurb: "BioCLIP escribe los vectores de 512." },
          { href: "/vectorial", label: "DB vectorial", icon: Database, phase: 7, blurb: "Dónde quedan esos vectores para verlos." },
          { href: "/centroides", label: "Centroides", icon: Target, phase: 18, blurb: "Global, regional y morfo." },
          { href: "/micro-adaptadores", label: "Clústeres", icon: Layers, phase: 19, blurb: "La matriz de las especies que se confunden." },
          { href: "/osr", label: "OSR", icon: ShieldQuestion, phase: 21, blurb: "Umbrales de rechazo. La persona los valida." },
        ],
      },
      {
        title: "Resultado",
        items: [
          { href: "/validacion-tecnica", label: "Validación", icon: ClipboardCheck, phase: 22, blurb: "Lista para compilar, o el motivo por el que no." },
          { href: "/compilador", label: "Release", icon: PackageCheck, phase: 23, blurb: "Compilar, aprobar y publicar el paquete de cada subregión." },
          { href: "/laboratorio", label: "Simulador", icon: LabIcon, phase: 24, blurb: "Una foto contra el release. No lo modifica." },
          { href: "/validacion", label: "Métricas", icon: FlaskConical, phase: 6, blurb: "Cómo le fue al paquete ya publicado." },
        ],
      },
    ],
  },
  {
    href: "/movil",
    label: "App",
    icon: Smartphone,
    summary: "La app de campo: quién entra, desde qué teléfono y qué reportó. No es el dataset del modelo.",
    sections: [
      {
        items: [
          { href: "/usuarios", label: "Usuarios", icon: Users, phase: 2, blurb: "Cuentas de ANURA Mobile." },
          { href: "/dispositivos", label: "Dispositivos", icon: Smartphone, phase: 2, blurb: "Teléfonos, espacio y versión." },
          { href: "/observaciones", label: "Observaciones", icon: ClipboardList, phase: 3, blurb: "Reportes que llegan de la app." },
        ],
      },
    ],
  },
  {
    href: "/operacion",
    label: "Operación",
    icon: UploadCloud,
    summary: "Cómo el paquete llega a los teléfonos y qué queda registrado.",
    sections: [
      {
        items: [
          { href: "/actualizaciones", label: "Actualizaciones", icon: UploadCloud, phase: 8, blurb: "Qué paquetes ya puede descargar la app." },
          { href: "/notificaciones", label: "Notificaciones", icon: Bell, phase: 8, blurb: "Avisos a quien tiene el paquete." },
          { href: "/sincronizacion", label: "Sincronización", icon: RefreshCw, phase: 9, blurb: "Qué subió y qué falló." },
          { href: "/auditoria", label: "Auditoría", icon: History, phase: 9, blurb: "Quién hizo qué en el panel." },
        ],
      },
    ],
  },
  {
    href: "/sistema",
    label: "Sistema",
    icon: Settings,
    summary: "Servicios, integraciones y quién puede entrenar, publicar o ver la traza técnica.",
    sections: [
      {
        items: [{ href: "/sistema", label: "Sistema", icon: Settings, phase: 11, blurb: "Servicios, integraciones y cuentas del panel." }],
      },
    ],
  },
];

function walk(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...walk(item.children ?? [])]);
}

export const ALL_NAV_ITEMS: NavItem[] = NAV_AREAS.flatMap((a) => a.sections.flatMap((s) => walk(s.items)));

function matches(pathname: string, href: string) {
  const path = href.split("?")[0];
  return pathname === path || pathname.startsWith(path + "/");
}

export function areaForPath(pathname: string) {
  return NAV_AREAS.find(
    (a) => a.href === pathname || a.sections.some((s) => walk(s.items).some((i) => matches(pathname, i.href)))
  );
}
