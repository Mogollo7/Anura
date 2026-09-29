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
  /** Una frase para la página de resumen, no para la barra. */
  blurb: string;
  /** Mismo botón, un nivel más adentro. Solo para temas que cuelgan del padre. */
  children?: NavItem[];
};

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
          { href: "/dashboard", label: "Resumen", icon: LayoutDashboard, blurb: "Indicadores y actividad reciente." },
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
          { href: "/analitica", label: "Analítica", icon: BarChart3, blurb: "Actividad y densidad. No es un submenú de Inicio." },
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
          { href: "/scraping", label: "Scraping", icon: Download, blurb: "iNaturalist y GBIF, con los mismos filtros del script." },
          { href: "/curacion", label: "Imágenes", icon: Images, blurb: "Fotos ya en el servidor. Excluir o invalidar, con motivo." },
          { href: "/catalogo", label: "Especies", icon: BookMarked, blurb: "Crear y revisar la taxonomía." },
          {
            href: "/paquetes",
            label: "Regiones",
            icon: Package,
            blurb: "Departamentos y subregiones que salen del servidor.",
          },
          { href: "/contenido", label: "Contenido", icon: BookOpen, blurb: "La ficha pública: qué lee la gente, aparte del modelo." },
          { href: "/destacados", label: "Destacados", icon: CalendarDays, blurb: "El carrusel de inicio, día por día." },
        ],
      },
      {
        title: "Limpiar",
        items: [
          { href: "/ficha-especie", label: "Ficha", icon: FileText, blurb: "Altitud, sustrato, atípicos y pesos." },
          { href: "/calidad", label: "Calidad", icon: ShieldAlert, blurb: "Lo que hay que corregir antes de entrenar." },
        ],
      },
      {
        title: "Procesar",
        items: [
          { href: "/ia", label: "Worker", icon: BrainCircuit, blurb: "BioCLIP escribe los vectores de 512." },
          { href: "/vectorial", label: "DB vectorial", icon: Database, blurb: "Dónde quedan esos vectores para verlos." },
          { href: "/centroides", label: "Centroides", icon: Target, blurb: "Global, regional y morfo." },
          { href: "/micro-adaptadores", label: "Clústeres", icon: Layers, blurb: "La matriz de las especies que se confunden." },
          { href: "/osr", label: "OSR", icon: ShieldQuestion, blurb: "Umbrales de rechazo. La persona los valida." },
        ],
      },
      {
        title: "Resultado",
        items: [
          { href: "/validacion-tecnica", label: "Validación", icon: ClipboardCheck, blurb: "Lista para compilar, o el motivo por el que no." },
          { href: "/compilador", label: "Release", icon: PackageCheck, blurb: "Compilar, aprobar y publicar el paquete de cada subregión." },
          { href: "/laboratorio", label: "Simulador", icon: LabIcon, blurb: "Una foto contra el release. No lo modifica." },
          { href: "/validacion", label: "Métricas", icon: FlaskConical, blurb: "Cómo le fue al paquete ya publicado." },
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
          { href: "/usuarios", label: "Usuarios", icon: Users, blurb: "Cuentas de ANURA Mobile." },
          { href: "/dispositivos", label: "Dispositivos", icon: Smartphone, blurb: "Teléfonos, espacio y versión." },
          { href: "/observaciones", label: "Observaciones", icon: ClipboardList, blurb: "Reportes que llegan de la app." },
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
          { href: "/actualizaciones", label: "Actualizaciones", icon: UploadCloud, blurb: "Qué paquetes ya puede descargar la app." },
          { href: "/notificaciones", label: "Notificaciones", icon: Bell, blurb: "Avisos a quien tiene el paquete." },
          { href: "/sincronizacion", label: "Sincronización", icon: RefreshCw, blurb: "Qué subió y qué falló." },
          { href: "/auditoria", label: "Auditoría", icon: History, blurb: "Quién hizo qué en el panel." },
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
        items: [{ href: "/sistema", label: "Sistema", icon: Settings, blurb: "Servicios, integraciones y cuentas del panel." }],
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
