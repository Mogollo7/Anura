import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BsGithub as Github,
  BsDownload as Download,
  BsMoonStarsFill as Moon,
  BsSun as Sun,
  BsTerminal as Terminal,
  BsBoxArrowUpRight as ExternalLink,
  BsFileEarmarkCode as FileCode,
  BsInfoCircle as Info,
  BsLayers as Layers,
  BsCompass as Compass,
  BsArrowUpRight as ArrowUpRight,
  BsGithub,
  BsChevronDown,
} from 'react-icons/bs';
import { FaArrowUp } from 'react-icons/fa';
import { IoIosArrowDown, IoIosArrowForward as ChevronRight, IoIosMenu as Menu, IoIosClose as X } from 'react-icons/io';

import { ManualConfig } from './types';
import ManualEditor from './components/ManualEditor';
import StepSimulator from './components/StepSimulator';
import FlameshotSandbox from './components/FlameshotSandbox';
import MarkdownExporter from './components/MarkdownExporter';

// Default configuration
const DEFAULT_CONFIG: ManualConfig = {
  appName: "Anura Web Identifier",
  repoUrl: "https://github.com/Mogollo7/Anura.git",
  deploymentUrl: "https://Mogollo7.github.io/Anura",
  description: "Anura es una herramienta científica y educativa basada en Inteligencia Artificial destinada a aficionados, herpetólogos y activistas ecológicos. Utilizando la API Vision de Gemini AI, procesa de forma instantánea imágenes de especímenes de anuros para catalogar su taxonomía, familia y grado de confianza, cruzando datos geoespaciales con la base de biodiversidad iNaturalist para ofrecer descriptores anatómicos y auditivos del espécimen.",
  authorName: "Mogollo7 & Team herpetólogos",
  contactEmail: "sebastianmartinez06.js@gmail.com",
  license: "MIT License",
  requirements: [
    "Node.js v18.0 o superior instalado en tu equipo.",
    "Clave de API válida de Gemini AI (declarada en .env).",
    "Conexión estable a Internet para consultas en tiempo real por API.",
    "Navegador compatible con carga de imágenes y permisos de cámara."
  ],
  installationSteps: [
    {
      id: "clonar",
      title: "Clonar el repositorio oficial",
      command: "git clone https://github.com/Mogollo7/Anura.git\ncd Anura",
      explanation: "Descarga todas las fuentes del proyecto en tu máquina local y entra al directorio de trabajo."
    },
    {
      id: "instalar",
      title: "Instalar dependencias del proyecto",
      command: "npm install",
      explanation: "Instala los paquetes requeridos por Vite, React, Lucide-React y el SDK de Google GenAI."
    },
    {
      id: "tokens",
      title: "Configurar llaves de API (.env)",
      command: "cp .env.example .env",
      explanation: "Duplica la plantilla de claves y edita el nuevo archivo .env ingresando tu GEMINI_API_KEY."
    },
    {
      id: "dev-run",
      title: "Iniciar servidor local",
      command: "npm run dev",
      explanation: "Corre el servidor de desarrollo local de Vite en el puerto 3000 de tu máquina."
    }
  ],
  featuresList: [],
  flameshotTips: []
};

// Hierarchical nav structure
const NAV_SECTIONS = [
  {
    id: "inicio",
    label: "Inicio",
    message: "Descubre los objetivos científicos y la importancia de catalogar anuros para la conservación de la biodiversidad global.",
    subsections: [
      "Descripción general del proyecto",
      "Objetivo del sistema",
      "Características principales",
      "Botón para probar la demo"
    ]
  },
  {
    id: "acerca",
    label: "Acerca del Proyecto",
    message: "Conoce el propósito, los objetivos y los requisitos técnicos necesarios para utilizar Anura correctamente.",
    subsections: [
      "Introducción",
      "Objetivos",
      "Requisitos"
    ]
  },
  {
    id: "manual",
    label: "Manual de Usuario",
    message: "Aprende paso a paso cómo utilizar todas las funcionalidades de Anura con tutoriales interactivos y casos de uso reales.",
    subsections: [
      "Guía Rápida",
      "Funcionalidades",
      "Tutorial Interactivo",
      "Casos de Uso"
    ]
  },
  {
    id: "soporte",
    label: "Soporte",
    message: "Encuentra respuestas a preguntas frecuentes y soluciones a los problemas más comunes que podrías encontrar.",
    subsections: [
      "FAQ",
      "Solución de Problemas",
      "Contacto"
    ]
  },
  {
    id: "tecnica",
    label: "Documentación Técnica",
    message: "Explora los detalles técnicos de Anura, incluyendo las tecnologías utilizadas y la arquitectura del sistema.",
    subsections: [
      "Tecnologías Utilizadas",
      "Arquitectura"
    ]
  },
  {
    id: "creditos",
    label: "Créditos",
    message: "Reconoce al equipo de desarrollo, instituciones involucradas y la cronología del proyecto.",
    subsections: [
      "Integrantes del equipo",
      "Institución",
      "Año"
    ]
  }
];

const PRODUCTS_MENU = [
  {
    id: "intro",
    name: "antigravity",
    title: "Antigravity 2.0",
    targetId: "inicio",
    message: "Descubre los objetivos científicos y la importancia de catalogar anuros para la conservación de la biodiversidad global.",
    subsections: [
      { label: "Inicio y Objetivos", targetId: "inicio" },
      { label: "Importancia Ecológica", targetId: "inicio" }
    ]
  },
  {
    id: "personalizar",
    name: "editor",
    title: "Personalización",
    targetId: "personalizar",
    message: "Adapta en tiempo real el nombre de la app, enlaces de repositorio y contacto para tu propio proyecto.",
    subsections: [
      { label: "Personalizar Datos", targetId: "personalizar" }
    ]
  },
  {
    id: "instalacion",
    name: "terminal",
    title: "Antigravity CLI",
    targetId: "instalacion",
    message: "Guía interactiva paso a paso para clonar, configurar variables de entorno y lanzar tu servidor local con Vite.",
    subsections: [
      { label: "Consola de Instalación", targetId: "instalacion" },
      { label: "Requisitos de Sistema", targetId: "instalacion" }
    ]
  },
  {
    id: "simulador",
    name: "code",
    title: "Antigravity IDE",
    targetId: "simulador",
    message: "Prueba en vivo la segmentación morfológica y clasificación inteligente impulsada por Gemini AI Vision e iNaturalist.",
    subsections: [
      { label: "Simulador de Identificación", targetId: "simulador" }
    ]
  },
  {
    id: "flameshot",
    name: "sdk",
    title: "Antigravity SDK",
    targetId: "flameshot",
    message: "Aprende a documentar y marcar rasgos morfológicos de anfibios usando herramientas profesionales de Flameshot.",
    subsections: [
      { label: "Guía de Capturas", targetId: "flameshot" }
    ]
  },
  {
    id: "exportar",
    name: "download",
    title: "README & PDF",
    targetId: "exportar",
    message: "Exporta la documentación en formato Markdown estructurado o descarga la guía completa de usuario en PDF.",
    subsections: [
      { label: "Descargar README.md", targetId: "exportar" },
      { label: "Guía de Usuario PDF", targetId: "exportar" }
    ]
  }
];

export default function App() {
  const [config, setConfig] = useState<ManualConfig>(DEFAULT_CONFIG);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('inicio');
  const [expandedSections, setExpandedSections] = useState<string[]>(['inicio']);
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('anura-theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('anura-theme', nextTheme);
  };

  const handleScrollTo = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-primary-light selection:text-white transition-colors duration-300">

      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-surface/90 backdrop-blur-md border-b border-border transition-colors duration-300 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex items-center gap-3">
<img
  src="/src/assets/images/anura_tree_frog_1780352792965.png"
  alt="Logo Anura"
  className="h-10 w-auto object-contain"
/>
              <div>
                <span className="font-heading font-extrabold text-sm sm:text-base text-text leading-tight tracking-tight flex items-center gap-1.5">
                  Anura <span className="bg-primary/15 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">Guía IA</span>
                </span>
              </div>
            </div>

            {/* Desktop Nav - Botones de sección */}
            <nav className="hidden lg:flex items-center gap-2">
              {NAV_SECTIONS.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => handleScrollTo(sec.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                    activeSection === sec.id
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted hover:text-text hover:bg-surface-2'
                  }`}
                >
                  {String(NAV_SECTIONS.indexOf(sec) + 1).padStart(2, '0')} {sec.label}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-surface-2 border border-border text-muted hover:text-text transition-colors"
                aria-label="Alternar Tema"
              >
                {theme === 'light' ? <Moon className="w-5 h-5 text-earth" /> : <Sun className="w-5 h-5 text-primary-light" />}
              </button>

              {/* GitHub */}
              <a
                href={config.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Repositorio GitHub"
                className="hidden sm:flex w-10 h-10 bg-text hover:bg-muted text-surface rounded-lg items-center justify-center transition"
              >
                <BsGithub className="w-5 h-5" />
              </a>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden text-muted hover:text-text transition-colors"
                aria-label="Abrir Menú"
              >
                {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Menú Móvil */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t border-border bg-surface overflow-hidden px-4 py-3 space-y-1"
            >
              {NAV_SECTIONS.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => handleScrollTo(sec.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg text-xs font-semibold block transition ${activeSection === sec.id
                    ? 'bg-primary text-white'
                    : 'text-muted hover:bg-surface-2'
                    }`}
                >
                  {sec.label}
                </button>
              ))}
              <a
                href={config.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between bg-text text-surface px-3.5 py-2.5 rounded-lg text-xs font-bold transition mt-2"
              >
                <span className="flex items-center gap-2">
                  <Github className="w-4 h-4" />
                  Ir a GitHub de Anura
                </span>
                <ArrowUpRight className="w-4 h-4 opacity-70" />
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ─── CONTENIDO PRINCIPAL ─────────────────────────────────────────── */}
      <main className="px-4 sm:px-6 lg:px-8 py-8">

        {/* Hero Banner */}
        <section id="inicio" className="mb-10 bg-gradient-to-br from-primary/10 via-surface-2 to-surface border-2 border-primary/20 rounded-brand py-20 sm:py-28 px-8 sm:px-12 relative overflow-hidden transition-all shadow-brand/10 shadow-lg">
          <img
            src="/src/assets/images/Hyloscirtus palmeri 096.png"
            alt=""
            className="absolute right-0 bottom-0 h-auto w-1/2 opacity-15 pointer-events-none"
          />
          <div className="max-w-2xl relative z-10 space-y-4">
            <span className="bold-badge">
              <Compass className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" /> Manual de Usuario
            </span>
            <h1 className="bold-headline text-3xl sm:text-5xl lg:text-6xl text-primary-dark">
              MANUAL DE USUARIO<br />
              PARA <span className="text-primary">ANURA</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted leading-relaxed font-semibold">
              Aprende a instalar, configurar y sacarle el máximo partido a tu plataforma de identificación de ranas y sapos mediante reconocimiento de imágenes asistido por <strong>Inteligencia Artificial</strong>
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="https://huggingface.co/spaces/imageomics/bioclip-2-demo"
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-md uppercase tracking-wider"
              >
                <span>Demo</span>
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href={config.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-12 h-12 bg-surface hover:bg-surface-2 border border-border text-text rounded-full transition flex items-center justify-center shadow-sm"
              >
                <Github className="w-5 h-5 text-muted" />
              </a>
            </div>
          </div>
        </section>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* ─── ÁREA DE CONTENIDO (ahora ocupa todo el ancho) ─── */}
          <div className="col-span-1 lg:col-span-12 space-y-10">

            {/* Placeholder vacío — el usuario indicará qué va aquí */}
            <section className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft transition-colors duration-300">
              {/* Contenido disponible para llenar */}
            </section>

          </div>
        </div>
      </main>

      {/* ─── BOTÓN BACK TO TOP ──────────────────────────────────────────── */}
      <button
        onClick={() => handleScrollTo('inicio')}
        className="fixed bottom-8 right-8 p-3 bg-primary hover:bg-primary-dark text-white rounded-full shadow-lg transition-all duration-300 z-40 flex items-center justify-center"
        aria-label="Volver al inicio"
      >
        <FaArrowUp className="w-5 h-5" />
      </button>

      {/* ─── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="mt-20 border-t border-border bg-bg/60 backdrop-blur-sm">
        <div className="px-4 sm:px-6 lg:px-8 py-12">

          {/* Grid principal del footer */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-8">

            {/* Columna 1: Identidad */}
            <div className="space-y-3">
              <div className="font-heading font-black text-xl text-primary-dark tracking-tight">
                ANURA <span className="font-light text-sm opacity-50">Docs</span>
              </div>
              <p className="text-xs text-muted font-semibold leading-relaxed max-w-xs">
                Manual de usuario interactivo para la plataforma de identificación de anuros mediante Inteligencia Artificial y visión computacional.
              </p>
            </div>

            {/* Columna 2: Navegación rápida */}
            <div className="space-y-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted block">
                Navegación Rápida
              </span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {NAV_SECTIONS.map((sec) => (
                  <button
                    key={sec.id}
                    onClick={() => handleScrollTo(sec.id)}
                    className="text-xs text-left text-muted hover:text-primary font-semibold transition"
                  >
                    {sec.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Columna 3: Contacto y Soporte */}
            <div className="space-y-4">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted block">
                Contacto y Recursos
              </span>
              <div className="space-y-2.5 text-xs font-semibold">
                <div>
                  <span className="text-text font-bold">Email:</span>
                  <p className="text-muted">
                    <a
                      href="mailto:sebastianmartinez06.js@gmail.com"
                      className="text-primary hover:underline"
                    >
                      sebastianmartinez06.js@gmail.com
                    </a>
                  </p>
                </div>
                <div>
                  <span className="text-text font-bold">Repositorio:</span>
                  <p>
                    <a
                      href={config.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-bold flex items-center gap-1"
                    >
                      <Github className="w-3 h-3" /> GitHub
                    </a>
                  </p>
                </div>
                <div>
                  <span className="text-text font-bold">Demo:</span>
                  <p>
                    <a
                      href="https://huggingface.co/spaces/imageomics/bioclip-2-demo"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-bold flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" /> Bioclip 2 Demo
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Barra inferior del footer */}
          <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 text-2xs text-muted font-semibold">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              <span className="text-text font-bold text-xs">© 2026 Anura Manual de Usuario</span>
              <span className="hidden sm:inline text-border">·</span>
              <span>Desarrollado por Juan Sebastián Martínez</span>
            </div>
            <div className="opacity-70 text-center">
              <a
                href="https://github.com/Mogollo7/Anura/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Licencia MIT
              </a>
              <span> - Todos los derechos reservados</span>
            </div>
          </div>

        </div>
      </footer>

    </div>
  );
}
