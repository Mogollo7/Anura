import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BsGithub as Github,
  BsDownload as Download,
  BsMoonStarsFill as Moon,
  BsSun as Sun,
  BsTerminal as Terminal,
  BsBoxArrowUpRight as ExternalLink,
  BsFileEarmarkCode as FileCode,
  BsCompass as Compass,
  BsArrowUpRight as ArrowUpRight,
  BsGithub,
  BsChevronDown,
  BsBook as Book,
  BsShieldCheck as Shield,
  BsPeople as People,
  BsMap as Map,
  BsSearch as Search,
  BsQuestionCircle as Question,
  BsTools as Tools,
  BsGear as Gear,
  BsArrowRight as ArrowRight,
} from 'react-icons/bs';
import { FaArrowUp } from 'react-icons/fa';
import { IoIosArrowDown, IoIosArrowForward as ChevronRight, IoIosMenu as Menu, IoIosClose as X } from 'react-icons/io';

import { ManualConfig } from './types';
import { Sparkles } from 'lucide-react';


// Default configuration
const DEFAULT_CONFIG: ManualConfig = {
  appName: "Anura Web Identifier",
  repoUrl: "https://github.com/Mogollo7/Anura.git",
  deploymentUrl: "https://Mogollo7.github.io/Anura",
  description: "Anura es una herramienta científica y educativa basada en Inteligencia Artificial destinada a aficionados, herpetólogos y activistas ecológicos. Utilizando BioClip, procesa de forma instantánea imágenes de especímenes de anuros para catalogar su taxonomía, familia y grado de confianza, cruzando datos geoespaciales con la base de biodiversidad iNaturalist para ofrecer descriptores anatómicos y auditivos del espécimen.",
  authorName: "Mogollo7 & Team herpetólogos",
  contactEmail: "sebastianmartinez06.js@gmail.com",
  license: "MIT License",
  requirements: [
    "Node.js v18.0 o superior instalado en tu equipo.",
    "Servidor con capacidad para inferencia local de BioClip o conexión a la API externa.",
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
      explanation: "Duplica la plantilla de variables y edita el nuevo archivo .env configurando los endpoints de BioClip."
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
      "Proyecto Anura",
      "Objetivos del Sistema",
      "Requerimientos",
      "Iniciar Demo"
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
      "Arquitectura",
      "Formato de proyecto de ingeniería informática: documentación técnica"
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

const getSubsectionId = (subName: string) => {
  return subName.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '');
};

const SPECIFIC_OBJECTIVES = [
  {
    num: 1,
    text: "Analizar los requerimientos funcionales y no funcionales del sistema, definiendo el alcance, las especies objetivo y las condiciones de uso en campo durante el primer mes de proyecto."
  },
  {
    num: 2,
    text: "Construir un conjunto de datos de imágenes con al menos 30 fotografías validadas por especie, asegurando variabilidad en ángulos, iluminación y contexto geográfico."
  },
  {
    num: 3,
    text: "Diseñar la arquitectura del sistema e implementar un modelo EfficientNet preentrenado, aplicando técnicas de transferencia de aprendizaje para la clasificación de especies."
  },
  {
    num: 4,
    text: "Optimizar el modelo para su uso en dispositivos móviles e integrar una base de datos vectorial que permita almacenar representaciones de imágenes y facilitar la incorporación de nuevas especies sin reentrenar completamente el modelo."
  },
  {
    num: 5,
    text: "Evaluar el desempeño del sistema mediante métricas como Top-1 Accuracy, Top-3 Accuracy, F1-score y matriz de confusión, y desarrollar una aplicación móvil funcional con pruebas piloto de identificación en campo."
  }
];

const FUNCTIONAL_REQS = [
  {
    num: 1,
    title: "Gestión de sesiones y perfiles",
    text: "El sistema debe permitir el registro y autenticación de usuarios, así como gestionar permisos de hardware (GPS, ubicación y cámara) necesarios para el correcto funcionamiento de la aplicación."
  },
  {
    num: 2,
    title: "Procesamiento de imágenes y segmentación",
    text: "El software debe separar automáticamente el espécimen del fondo y realizar una segmentación semántica de sus partes morfológicas (cabeza, cuerpo y extremidades)."
  },
  {
    num: 3,
    title: "Identificación taxonómica",
    text: "Utilizando el modelo BioClip 2.0, el sistema debe identificar la especie y arrojar un total de tres resultados con sus respectivos porcentajes de confianza."
  },
  {
    num: 4,
    title: "Validación geográfica",
    text: "El sistema debe validar la ubicación para realizar un ajuste de los resultados basado en el contexto geográfico del individuo."
  },
  {
    num: 5,
    title: "Fichas técnicas y alertas",
    text: "Debe generar fichas técnicas con la taxonomía completa, una guía morfológica detallada y el estado de conservación según la UICN. Ante especies en peligro, el sistema emitirá una alerta visual y encriptará las coordenadas exactas para proteger al individuo de actividades ilegales."
  }
];

const NONFUNCTIONAL_REQS = [
  {
    num: 1,
    title: "Rendimiento y latencia",
    text: "El tiempo de respuesta, desde la captura hasta el resultado, no debe tardar más de 10 segundos."
  },
  {
    num: 2,
    title: "Disponibilidad y adaptabilidad",
    text: "La interfaz debe contar con modo claro y oscuro para adaptarse a diversas condiciones de campo."
  },
  {
    num: 3,
    title: "Precisión del modelo",
    text: "El modelo debe mantener una precisión superior al 85 % en la identificación registrada en la base de datos nacional."
  },
  {
    num: 4,
    title: "Seguridad y privacidad",
    text: "El manejo de datos personales y de localización debe cumplir estrictamente con la Ley 1581 de 2012."
  },
  {
    num: 5,
    title: "Escalabilidad y aprendizaje",
    text: "El sistema debe permitir el entrenamiento automático del modelo, autoafinándose a partir de las evaluaciones proporcionadas por la comunidad de expertos que hayan publicado sus datos de manera pública."
  }
];



export default function App() {
  const [config, setConfig] = useState<ManualConfig>(DEFAULT_CONFIG);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('inicio');
  const [expandedSections, setExpandedSections] = useState<string[]>(['inicio']);
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);
  const [openNav, setOpenNav] = useState<string | null>(null);
  const [activeReqTab, setActiveReqTab] = useState<'funcionales' | 'no-funcionales'>('funcionales');
  const [paperTab, setPaperTab] = useState<'resumen' | 'resultados'>('resumen');
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URLs configurables para los iframes
  const [iframeUrls, setIframeUrls] = useState({
    login: "https://Mogollo7.github.io/Anura/login",
    map: "https://Mogollo7.github.io/Anura/mapa",
    species: "https://Mogollo7.github.io/Anura/especies",
    taxonomy: "https://Mogollo7.github.io/Anura/taxonomia",
    profile: "https://Mogollo7.github.io/Anura/perfil",
    search: "https://Mogollo7.github.io/Anura/buscar",
    users: "https://Mogollo7.github.io/Anura/usuarios",
    observers: "https://Mogollo7.github.io/Anura/observadores",
  });
  const [activeIframeTab, setActiveIframeTab] = useState<'login' | 'map' | 'species' | 'taxonomy' | 'profile' | 'search' | 'users' | 'observers'>('login');

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

  // Hover helpers that keep dropdown open while mouse is over button OR panel
  const handleNavEnter = (id: string) => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setOpenNav(id);
  };

  const handleNavLeave = () => {
    closeTimerRef.current = setTimeout(() => setOpenNav(null), 120);
  };

  return (
    <div className="min-h-screen bg-bg text-text selection:bg-primary-light selection:text-white transition-colors duration-300">

      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 relative bg-surface/90 backdrop-blur-md border-b border-border transition-colors duration-300 shadow-sm">
        <div className="px-8 sm:px-12 lg:px-16">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex items-center gap-3">
              <img
                src="./images/anura_tree_frog_1780352792965.png"
                alt="Logo Anura"
                className="h-10 w-auto object-contain"
              />
              <div>
                <span className="font-heading font-extrabold text-sm sm:text-base text-text leading-tight tracking-tight flex items-center gap-1.5">
                  Anura <span className="bg-primary/15 text-primary text-[10px] px-2 py-0.5 rounded-full font-bold">Guía IA</span>
                </span>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-2">
              {NAV_SECTIONS.map((sec) => {
                const isSecActive = activeSection === sec.id || sec.subsections?.some(sub => getSubsectionId(sub) === activeSection);
                return (
                  <div
                    key={sec.id}
                    onMouseEnter={() => handleNavEnter(sec.id)}
                    onMouseLeave={handleNavLeave}
                    className="relative"
                  >
                    <button
                      onClick={() => handleScrollTo(sec.id)}
                      className={`px-8 py-1.5 rounded-md text-xs font-bold transition-colors transform duration-150 inline-flex items-center gap-2 ${isSecActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-muted hover:text-text hover:bg-surface-2 hover:shadow-sm hover:scale-105'
                        }`}
                      aria-haspopup="true"
                      aria-expanded={openNav === sec.id}
                    >
                      <span>{sec.label}</span>
                      <IoIosArrowDown className={`w-3.5 h-3.5 transition-transform ${openNav === sec.id ? 'rotate-180' : ''}`} />
                    </button>

                    {openNav === sec.id && (
                      <div
                        className="fixed inset-x-0 top-16 bg-surface border-b border-border shadow-xl py-6 px-16 z-50"
                        onMouseEnter={() => handleNavEnter(sec.id)}
                        onMouseLeave={handleNavLeave}
                      >
                        <div className="max-w-screen-2xl mx-auto grid gap-6 md:grid-cols-[1.2fr_1fr] items-start">
                          <div className="space-y-3">
                            <p className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold">{sec.label}</p>
                            <h3 className="text-base sm:text-lg text-text leading-tight">
                              {sec.message}
                            </h3>
                            <button
                              onClick={() => { handleScrollTo(sec.id); setOpenNav(null); }}
                              className="mt-3 inline-flex items-center justify-center rounded-full bg-primary px-8 py-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-primary-dark"
                            >
                              Explorar
                            </button>
                          </div>
                          <div className="grid gap-2 border-l border-border pl-6 py-2">
                            {sec.subsections.map((sub, idx) => {
                              const targetId = getSubsectionId(sub);
                              return (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    handleScrollTo(targetId);
                                    setOpenNav(null);
                                  }}
                                  className="text-sm text-text text-left hover:text-primary transition"
                                >
                                  {sub}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
              className="lg:hidden border-t border-border bg-surface overflow-hidden px-4 py-3 space-y-1 max-h-[80vh] overflow-y-auto"
            >
              {NAV_SECTIONS.map((sec) => {
                const isSecActive = activeSection === sec.id || sec.subsections?.some(sub => getSubsectionId(sub) === activeSection);
                return (
                  <div key={sec.id} className="space-y-1 py-1">
                    <button
                      onClick={() => handleScrollTo(sec.id)}
                      className={`w-full text-left px-6 py-2 rounded-lg text-xs font-bold block transition ${isSecActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-muted hover:bg-surface-2'
                        }`}
                    >
                      {sec.label}
                    </button>
                    {/* Render subsecciones con sangría en móvil */}
                    <div className="pl-4 flex flex-col gap-1 border-l border-border/60 ml-2">
                      {sec.subsections?.map((sub, idx) => {
                        const subId = getSubsectionId(sub);
                        const isSubActive = activeSection === subId;
                        return (
                          <button
                            key={idx}
                            onClick={() => handleScrollTo(subId)}
                            className={`w-full text-left px-3 py-1.5 rounded-md text-[11px] font-semibold transition ${isSubActive
                              ? 'text-primary bg-primary/10 font-bold'
                              : 'text-muted hover:text-text hover:bg-surface-2'
                              }`}
                          >
                            {sub}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <a
                href={config.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between bg-text text-surface px-4 py-2 rounded-lg text-xs font-bold transition mt-2"
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
      <main className="px-8 sm:px-12 lg:px-16 py-8">

        {/* Hero Banner */}
        <section id="inicio" className="mb-10 bg-gradient-to-br from-primary/10 via-surface-2 to-surface border-2 border-primary/20 rounded-brand py-20 sm:py-28 px-16 sm:px-24 relative overflow-hidden transition-all shadow-brand/10 shadow-lg">
          <img
            src="./images/Hyloscirtus palmeri 096.png"
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
                href="./Formato-Proyecto-Ingenieria.pdf"
                download
                className="px-5 py-3 bg-surface-2 border border-border hover:border-primary/50 hover:bg-primary/5 text-text rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm uppercase tracking-wider"
              >
                <Download className="w-4 h-4 text-primary" />
                <span>PDF Documentación</span>
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

        {/* ─── BENTO GRID ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="col-span-1 lg:col-span-12 space-y-10">

            {/* ══════════════════════════════════════════════════════════════
                SECCIÓN ÚNICA CONSOLIDADA: INICIO (PROYECTO ANURA)
            ══════════════════════════════════════════════════════════════ */}
            <section
              id="inicio"
              className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft transition-colors duration-300 space-y-16"
            >
              {/* SUBSECCIÓN 1: PROYECTO ANURA */}
              <div id="proyecto-anura" className="scroll-mt-24">
                {/* Encabezado con padding superior */}
                <div className="flex items-center gap-3 mb-6 pt-6">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                    <Compass className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold">Inicio</p>
                    <h2 className="font-heading font-extrabold text-2xl text-text">Proyecto Anura</h2>
                  </div>
                </div>

                {/* Grid con Imagen a la izquierda y Texto a la derecha */}
                <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start mb-8 pt-4">
                  <div className="border border-border rounded-xl overflow-hidden bg-surface-2 hover:border-primary/40 transition-colors flex-shrink-0 lg:w-[580px]">
                    <img
                      src="./images/Dendrobates truncatus 001.png"
                      alt="Dendrobates truncatus"
                      className="w-full h-auto object-cover hover:scale-[1.02] transition-transform duration-300"
                    />
                  </div>
                  <div className="prose-sm text-muted leading-relaxed space-y-4 max-w-3xl">
                    <p>
                      Colombia es uno de los países con mayor diversidad de anfibios en el mundo, con cerca de <strong className="text-text">859 especies registradas</strong>, de las cuales aproximadamente <strong className="text-text">793 pertenecen al orden Anura</strong>, lo que resalta la necesidad de desarrollar herramientas que faciliten su identificación y monitoreo, especialmente en regiones con alta diversidad y endemismo donde la conservación es prioritaria.
                    </p>
                    <p>
                      Los anuros cumplen un papel ecológico fundamental como bioindicadores de la calidad ambiental debido a su sensibilidad a cambios en factores como la temperatura, la calidad del agua y la transformación del hábitat, además de su importancia en las redes tróficas; sin embargo, su identificación en campo es compleja por la similitud morfológica entre especies, la variabilidad en rasgos como coloración y tamaño, y la presencia de especies endémicas y crípticas, lo que dificulta incluso el trabajo de especialistas y puede afectar la calidad de la información en procesos de investigación y conservación.
                    </p>
                    <p>
                      En este contexto, los avances en inteligencia artificial y visión por computador, especialmente mediante el uso de redes neuronales convolucionales, permiten automatizar la identificación de especies a partir de imágenes al reconocer patrones visuales complejos incluso en condiciones variables, aprovechando grandes volúmenes de datos y ofreciendo una alternativa que fortalece el monitoreo ambiental, optimiza recursos especializados y contribuye a generar información más precisa y accesible para la gestión y conservación de la biodiversidad en Colombia.
                    </p>
                  </div>
                </div>
              </div>

              {/* SUBSECCIÓN 2: OBJETIVOS DEL SISTEMA */}
              <div id="objetivos-del-sistema" className="scroll-mt-24 pt-6">
                <div className="space-y-6">
                  {/* Encabezado con padding superior extra */}
                  <h3 className="font-heading font-bold text-lg text-text border-b border-border pt-12 pb-2">
                    Objetivos del Proyecto
                  </h3>

                  {/* Objetivo General */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
                    <p className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold mb-2">Objetivo General</p>
                    <p className="text-sm text-text leading-relaxed font-semibold">
                      Desarrollar un sistema basado en inteligencia artificial capaz de reconocer individuos del orden Anura mediante una foto para su correcto reconocimiento y evaluación.
                    </p>
                  </div>

                  {/* Objetivos Específicos */}
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold mb-4">Objetivos Específicos</p>
                    <ol className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {SPECIFIC_OBJECTIVES.map((obj) => (
                        <li
                          key={obj.num}
                          className="flex gap-4 bg-surface-2 border border-border rounded-xl p-4 hover:border-primary/40 transition-colors"
                        >
                          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-black shadow-sm">
                            {obj.num}
                          </span>
                          <p className="text-sm text-muted leading-relaxed">{obj.text}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>

              {/* SUBSECCIÓN 3: REQUERIMIENTOS */}
              <div id="requerimientos" className="scroll-mt-24 border-t border-border pt-10">
                {/* Encabezado con padding superior extra */}
                <div className="flex items-center gap-3 mb-6 pt-12">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                    <FileCode className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold">Inicio</p>
                    <h2 className="font-heading font-extrabold text-2xl text-text">Requerimientos del Sistema</h2>
                  </div>
                </div>

                {/* Tab switcher */}
                <div className="flex gap-2 mb-6 bg-surface-2 p-1 rounded-xl w-fit border border-border">
                  <button
                    id="tab-funcionales"
                    onClick={() => setActiveReqTab('funcionales')}
                    className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeReqTab === 'funcionales'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted hover:text-text'
                      }`}
                  >
                    Funcionales
                  </button>
                  <button
                    id="tab-no-funcionales"
                    onClick={() => setActiveReqTab('no-funcionales')}
                    className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${activeReqTab === 'no-funcionales'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted hover:text-text'
                      }`}
                  >
                    No Funcionales
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {activeReqTab === 'funcionales' ? (
                    <motion.ol
                      key="funcionales"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      {FUNCTIONAL_REQS.map((req) => (
                        <li
                          key={req.num}
                          className="flex gap-4 bg-surface-2 border border-border rounded-xl p-5 hover:border-primary/40 transition-colors"
                        >
                          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-black">
                            {req.num}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-text mb-1">{req.title}</p>
                            <p className="text-sm text-muted leading-relaxed">{req.text}</p>
                          </div>
                        </li>
                      ))}
                    </motion.ol>
                  ) : (
                    <motion.ol
                      key="no-funcionales"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      {NONFUNCTIONAL_REQS.map((req) => (
                        <li
                          key={req.num}
                          className="flex gap-4 bg-surface-2 border border-border rounded-xl p-5 hover:border-primary/40 transition-colors"
                        >
                          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-black">
                            {req.num}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-text mb-1">{req.title}</p>
                            <p className="text-sm text-muted leading-relaxed">{req.text}</p>
                          </div>
                        </li>
                      ))}
                    </motion.ol>
                  )}
                </AnimatePresence>
              </div>

              {/* SUBSECCIÓN 4: INICIAR DEMO */}
              <div id="iniciar-demo" className="scroll-mt-24 border-t border-border pt-10">
                {/* Encabezado con padding superior extra */}
                <div className="flex items-center gap-3 mb-6 pt-12">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                    <Terminal className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold">Inicio</p>
                    <h2 className="font-heading font-extrabold text-2xl text-text">Iniciar Demo</h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left — What is BioClip */}
                  <div className="space-y-5">
                    <div>
                      <h3 className="font-bold text-base text-text mb-2 flex items-center gap-2">
                        <BsChevronDown className="w-4 h-4 text-primary rotate-[-90deg]" /> ¿Qué es BioClip?
                      </h3>
                      <p className="text-sm text-muted leading-relaxed">
                        <strong className="text-text">BioClip</strong> es un modelo de lenguaje-visión de gran escala entrenado específicamente sobre datos biológicos. A diferencia de los modelos CLIP genéricos, BioClip incorpora jerarquías taxonómicas del árbol de la vida para crear embeddings altamente discriminativos, permitiendo la identificación de especies con muy pocas muestras de entrenamiento.
                      </p>
                      <p className="text-sm text-muted leading-relaxed mt-3">
                        <strong className="text-text">Nota de Integración:</strong> BioClip es el núcleo de nuestro sistema de identificación taxonómica, ya que lo reentrenamos para especializarlo en el reconocimiento de especies del orden Anura en Colombia. El modelo exacto utilizado es <code className="bg-surface-2 border border-border px-1.5 py-0.5 rounded font-mono text-primary text-xs font-bold">imageomics/bioclip-2.5-vith14</code>.
                      </p>
                    </div>

                    {/* Características clave */}
                    <ul className="space-y-2">
                      {[
                        "Modelo base: imageomics/bioclip-2.5-vith14",
                        "Embeddings jerárquicos de biodiversidad",
                        "Precisión de identificación adaptada al contexto colombiano",
                        "Base de datos vectorial para carga dinámica de especies",
                      ].map((feat, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted">
                          <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-black">✓</span>
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Right — Paper preview + link */}
                  <div className="flex flex-col gap-4">
                    {/* Paper card */}
                    <div className="border border-border rounded-xl overflow-hidden bg-surface-2 hover:border-primary/40 transition-colors">
                      {/* Paper header con Tabs */}
                      <div className="bg-primary/5 px-4 py-2 border-b border-border flex items-center justify-between">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPaperTab('resumen')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${paperTab === 'resumen' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'
                              }`}
                          >
                            Resumen
                          </button>
                          <button
                            onClick={() => setPaperTab('resultados')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${paperTab === 'resultados' ? 'bg-primary text-white shadow-sm' : 'text-muted hover:text-text'
                              }`}
                          >
                            Resultados (Zero-Shot)
                          </button>
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold">Paper Oficial</span>
                      </div>

                      {/* Contenido pestaña: Resumen */}
                      {paperTab === 'resumen' ? (
                        <div className="px-5 py-4 space-y-3">
                          <h4 className="font-bold text-sm text-text leading-snug">
                            BioCLIP: A Vision Foundation Model for the Tree of Life
                          </h4>
                          <p className="text-2xs text-muted">
                            Stevens, J. et al. — CVPR 2024
                          </p>
                          <p className="text-xs text-muted leading-relaxed line-clamp-5">
                            <strong className="text-text">Resumen:</strong> Images of the natural world, taken by a variety of cameras, from microscopes to camera traps to individual photographers, form a rich source of data for understanding the tree of life. We present BioCLIP, a foundation model for the tree of life, leveraging the broad applicability of contrastive learning trained on the large and varied TREEOFLIFE-10M dataset of biology images paired with rich taxonomic labels. BioCLIP achieves a top-1 accuracy of 65.1% on iNaturalist 2021, outperforming prior state-of-the-art models by 17 percentage points. We further show that BioCLIP generalizes to unseen species, including novel species from camera trap data collected in the wild.
                          </p>

                          {/* Metadata */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-surface border border-border rounded-lg p-2">
                              <span className="text-primary font-bold block">Conferencia</span>
                              <span className="text-muted">CVPR 2024</span>
                            </div>
                            <div className="bg-surface border border-border rounded-lg p-2">
                              <span className="text-primary font-bold block">Conjunto de Datos</span>
                              <span className="text-muted">TREEOFLIFE-10M</span>
                            </div>
                            <div className="bg-surface border border-border rounded-lg p-2">
                              <span className="text-primary font-bold block">Prec. Top-1</span>
                              <span className="text-muted">65.1 % (iNat21)</span>
                            </div>
                            <div className="bg-surface border border-border rounded-lg p-2">
                              <span className="text-primary font-bold block">Mejora</span>
                              <span className="text-muted">+17 pp vs. SOTA</span>
                            </div>
                          </div>

                          {/* Link al paper */}
                          <a
                            href="https://arxiv.org/abs/2311.18803"
                            target="_blank"
                            rel="noopener noreferrer"
                            id="bioclip-paper-link"
                            className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline transition pt-2"
                          >
                            <FileCode className="w-4 h-4" />
                            Ver paper completo en arXiv →
                          </a>
                        </div>
                      ) : (
                        /* Contenido pestaña: Resultados */
                        <div className="px-5 py-4 space-y-4">
                          <div>
                            <h4 className="font-bold text-sm text-text leading-snug">
                              BioCLIP: A Vision Foundation Model for the Tree of Life
                            </h4>
                            <p className="text-[10px] text-muted mt-1 leading-relaxed">
                              Mostramos aquí los resultados de las tareas de clasificación zero-shot y de clasificación no basadas en especies:
                            </p>
                          </div>

                          {/* Tabla 1 */}
                          <div className="space-y-1">
                            <p className="text-[9px] uppercase tracking-wider text-primary font-bold">1. Clasificación Zero-Shot por Grupo Biológico</p>
                            <div className="overflow-x-auto border border-border rounded-lg bg-surface-3">
                              <table className="w-full text-[9px] text-left border-collapse min-w-[600px]">
                                <thead>
                                  <tr className="bg-primary/5 border-b border-border font-bold">
                                    <th className="p-1.5 border-r border-border">Modelo</th>
                                    <th className="p-1.5 border-r border-border text-center">NABirds</th>
                                    <th className="p-1.5 border-r border-border text-center">Plankton</th>
                                    <th className="p-1.5 border-r border-border text-center">Insectos</th>
                                    <th className="p-1.5 border-r border-border text-center">Insectos 2</th>
                                    <th className="p-1.5 border-r border-border text-center">Trampa Cám.</th>
                                    <th className="p-1.5 border-r border-border text-center">PlantNet</th>
                                    <th className="p-1.5 border-r border-border text-center">Hongos</th>
                                    <th className="p-1.5 border-r border-border text-center">PlantVill.</th>
                                    <th className="p-1.5 border-r border-border text-center">Med. Leaf</th>
                                    <th className="p-1.5 border-r border-border text-center">Esp. Raras</th>
                                    <th className="p-1.5 text-center">Promedio</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border font-mono">
                                  <tr className="hover:bg-primary/5 transition-colors">
                                    <td className="p-1.5 border-r border-border font-sans font-semibold">BioCLIP</td>
                                    <td className="p-1.5 border-r border-border text-center">58.8</td>
                                    <td className="p-1.5 border-r border-border text-center">6.1</td>
                                    <td className="p-1.5 border-r border-border text-center">34.9</td>
                                    <td className="p-1.5 border-r border-border text-center">20.5</td>
                                    <td className="p-1.5 border-r border-border text-center">31.7</td>
                                    <td className="p-1.5 border-r border-border text-center">88.2</td>
                                    <td className="p-1.5 border-r border-border text-center">40.9</td>
                                    <td className="p-1.5 border-r border-border text-center">19.0</td>
                                    <td className="p-1.5 border-r border-border text-center">38.5</td>
                                    <td className="p-1.5 border-r border-border text-center">37.1</td>
                                    <td className="p-1.5 text-center font-bold text-primary">37.6</td>
                                  </tr>
                                  <tr className="hover:bg-primary/5 transition-colors">
                                    <td className="p-1.5 border-r border-border font-sans font-semibold">BioCLIP 2</td>
                                    <td className="p-1.5 border-r border-border text-center">74.9</td>
                                    <td className="p-1.5 border-r border-border text-center">3.9</td>
                                    <td className="p-1.5 border-r border-border text-center">55.3</td>
                                    <td className="p-1.5 border-r border-border text-center">27.7</td>
                                    <td className="p-1.5 border-r border-border text-center">53.9</td>
                                    <td className="p-1.5 border-r border-border text-center">96.8</td>
                                    <td className="p-1.5 border-r border-border text-center">83.8</td>
                                    <td className="p-1.5 border-r border-border text-center">25.1</td>
                                    <td className="p-1.5 border-r border-border text-center">57.8</td>
                                    <td className="p-1.5 border-r border-border text-center">76.8</td>
                                    <td className="p-1.5 text-center font-bold text-primary">55.6</td>
                                  </tr>
                                  <tr className="bg-primary/5 font-bold">
                                    <td className="p-1.5 border-r border-border font-sans text-primary">BioCLIP 2.5 H.</td>
                                    <td className="p-1.5 border-r border-border text-center">75.8</td>
                                    <td className="p-1.5 border-r border-border text-center">5.2</td>
                                    <td className="p-1.5 border-r border-border text-center">68.2</td>
                                    <td className="p-1.5 border-r border-border text-center">30.8</td>
                                    <td className="p-1.5 border-r border-border text-center">58.7</td>
                                    <td className="p-1.5 border-r border-border text-center">96.9</td>
                                    <td className="p-1.5 border-r border-border text-center">84.9</td>
                                    <td className="p-1.5 border-r border-border text-center">33.5</td>
                                    <td className="p-1.5 border-r border-border text-center">73.2</td>
                                    <td className="p-1.5 border-r border-border text-center">85.5</td>
                                    <td className="p-1.5 text-center text-primary-dark">61.3</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Tabla 2 */}
                          <div className="space-y-1">
                            <p className="text-[9px] uppercase tracking-wider text-primary font-bold">2. Comparativa en Benchmarks y Tareas Biológicas</p>
                            <div className="overflow-x-auto border border-border rounded-lg bg-surface-3">
                              <table className="w-full text-[9px] text-left border-collapse min-w-[450px]">
                                <thead>
                                  <tr className="bg-primary/5 border-b border-border font-bold">
                                    <th className="p-1.5 border-r border-border">Modelo</th>
                                    <th className="p-1.5 border-r border-border text-center">FishNet</th>
                                    <th className="p-1.5 border-r border-border text-center">NeWT</th>
                                    <th className="p-1.5 border-r border-border text-center">AwA2</th>
                                    <th className="p-1.5 border-r border-border text-center">Herbarium19</th>
                                    <th className="p-1.5 border-r border-border text-center">PlantDoc</th>
                                    <th className="p-1.5 text-center">Promedio</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border font-mono">
                                  <tr className="hover:bg-primary/5 transition-colors">
                                    <td className="p-1.5 border-r border-border font-sans font-semibold">SigLIP 2</td>
                                    <td className="p-1.5 border-r border-border text-center">34.0</td>
                                    <td className="p-1.5 border-r border-border text-center">82.7</td>
                                    <td className="p-1.5 border-r border-border text-center">67.9</td>
                                    <td className="p-1.5 border-r border-border text-center">20.2</td>
                                    <td className="p-1.5 border-r border-border text-center">28.4</td>
                                    <td className="p-1.5 text-center font-bold text-primary">46.6</td>
                                  </tr>
                                  <tr className="hover:bg-primary/5 transition-colors">
                                    <td className="p-1.5 border-r border-border font-sans font-semibold">DINOv3</td>
                                    <td className="p-1.5 border-r border-border text-center">37.9</td>
                                    <td className="p-1.5 border-r border-border text-center">85.7</td>
                                    <td className="p-1.5 border-r border-border text-center">48.0</td>
                                    <td className="p-1.5 border-r border-border text-center">31.2</td>
                                    <td className="p-1.5 border-r border-border text-center">40.3</td>
                                    <td className="p-1.5 text-center font-bold text-primary">48.6</td>
                                  </tr>
                                  <tr className="hover:bg-primary/5 transition-colors">
                                    <td className="p-1.5 border-r border-border font-sans font-semibold">BioCLIP</td>
                                    <td className="p-1.5 border-r border-border text-center">30.1</td>
                                    <td className="p-1.5 border-r border-border text-center">82.7</td>
                                    <td className="p-1.5 border-r border-border text-center">65.9</td>
                                    <td className="p-1.5 border-r border-border text-center">26.8</td>
                                    <td className="p-1.5 border-r border-border text-center">39.5</td>
                                    <td className="p-1.5 text-center font-bold text-primary">49.0</td>
                                  </tr>
                                  <tr className="hover:bg-primary/5 transition-colors">
                                    <td className="p-1.5 border-r border-border font-sans font-semibold">BioCLIP 2</td>
                                    <td className="p-1.5 border-r border-border text-center">39.8</td>
                                    <td className="p-1.5 border-r border-border text-center">89.1</td>
                                    <td className="p-1.5 border-r border-border text-center">69.5</td>
                                    <td className="p-1.5 border-r border-border text-center">48.6</td>
                                    <td className="p-1.5 border-r border-border text-center">40.4</td>
                                    <td className="p-1.5 text-center font-bold text-primary">57.5</td>
                                  </tr>
                                  <tr className="bg-primary/5 font-bold">
                                    <td className="p-1.5 border-r border-border font-sans text-primary">BioCLIP 2.5 H.</td>
                                    <td className="p-1.5 border-r border-border text-center">48.5</td>
                                    <td className="p-1.5 border-r border-border text-center">90.0</td>
                                    <td className="p-1.5 border-r border-border text-center">72.9</td>
                                    <td className="p-1.5 border-r border-border text-center">51.9</td>
                                    <td className="p-1.5 border-r border-border text-center">41.9</td>
                                    <td className="p-1.5 text-center text-primary-dark">61.0</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-muted leading-relaxed font-semibold">
                            Resumen: BioCLIP 2.5 Huge supera a BioCLIP 2 en un 5.7% en los benchmarks de clasificación zero-shot de especies y en un 3.5% en tareas visuales biológicas más generales.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* PDF Preview Frame */}
                    <div className="border border-border rounded-xl overflow-hidden bg-surface-3">
                      <div className="bg-surface px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted">
                        <span className="font-semibold text-text flex items-center gap-1.5">
                          <FileCode className="w-3.5 h-3.5 text-primary" /> Previsualización PDF
                        </span>
                        <a
                          href="https://arxiv.org/pdf/2505.23883"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-bold"
                        >
                          Pantalla Completa
                        </a>
                      </div>
                      <div className="relative w-full h-[220px]">
                        <iframe
                          src="https://arxiv.org/pdf/2505.23883#toolbar=0&navpanes=0&scrollbar=0"
                          className="w-full h-full border-none bg-white"
                          title="Previsualización Paper BioCLIP"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Demo CTA */}
                <div className="mt-8 border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-sm text-text mb-1">¿Deseas probar el modelo en tiempo real?</p>
                    <p className="text-xs text-muted">
                      Accede a la plataforma oficial para testear el clasificador mediante una interfaz interactiva.
                    </p>
                  </div>
                  <a
                    href="https://huggingface.co/spaces/imageomics/bioclip-2-demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    id="bioclip-demo-btn"
                    className="flex-shrink-0 inline-flex items-center gap-2 px-8 py-3 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-bold transition-all shadow-md hover:shadow-lg hover:scale-105 uppercase tracking-wider"
                  >
                    Iniciar Demo en Hugging Face
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                SECCIÓN ÚNICA CONSOLIDADA: MANUAL DE USUARIO
                ══════════════════════════════════════════════════════════════ */}
            <section
              id="manual"
              className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft transition-colors duration-300 space-y-16"
            >
              {/* SUBSECCIÓN 1: GUÍA RÁPIDA */}
              <div id="guia-rapida" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6 pt-6">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                    <Book className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold">Manual</p>
                    <h2 className="font-heading font-extrabold text-2xl text-text">Guía Rápida</h2>
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 leading-relaxed text-sm text-muted">
                  <p>
                    Esta sección constituye la guía rápida de la aplicación para la identificación de anfibios. En los siguientes apartados se detallan las funcionalidades principales y el modo de uso de la plataforma, la cual funciona además como una red social para el intercambio de información entre investigadores y herpetólogos.
                  </p>
                </div>
              </div>

              {/* SUBSECCIÓN 2: FUNCIONALIDADES */}
              <div id="funcionalidades" className="scroll-mt-24 pt-6">
                <div className="space-y-6">
                  <h3 className="font-heading font-bold text-lg text-text border-b border-border pb-2">
                    Funcionalidades Principales
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-surface-2 border border-border rounded-xl p-6 space-y-3 hover:border-primary/40 transition">
                      <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/15 text-primary">
                        <Sparkles className="w-5 h-5 animate-pulse" />
                      </span>
                      <h4 className="font-heading font-bold text-base text-text">1. Identificación de Anuros</h4>
                      <p className="text-xs text-muted leading-relaxed">
                        Mediante imágenes y texto, utilizando un modelo de inteligencia artificial multimodal que aprovecha el contexto de la imagen y la ubicación para mejorar la precisión de la predicción.
                      </p>
                    </div>

                    <div className="bg-surface-2 border border-border rounded-xl p-6 space-y-3 hover:border-primary/40 transition">
                      <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-earth/15 text-earth">
                        <People className="w-5 h-5" />
                      </span>
                      <h4 className="font-heading font-bold text-base text-text">2. Democratización del Conocimiento</h4>
                      <p className="text-xs text-muted leading-relaxed">
                        A través de la distribución y la capacidad de compartir observaciones con cualquier persona interesada en la herpetología y conservación.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SUBSECCIÓN 3: TUTORIAL INTERACTIVO */}
              <div id="tutorial-interactivo" className="scroll-mt-24 pt-6">
                <div className="space-y-6">
                  <h3 className="font-heading font-bold text-lg text-text border-b border-border pb-2">
                    Tutorial Interactivo
                  </h3>
                  {/* Mock Browser con demo de Storylane */}
                  <div className="border-2 border-border rounded-xl overflow-hidden shadow-md">
                    {/* Browser bar */}
                    <div className="bg-surface border-b-2 border-border px-4 py-2 flex items-center gap-3">
                      <div className="flex gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-danger inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-earth inline-block" />
                        <span className="w-2.5 h-2.5 rounded-full bg-success inline-block" />
                      </div>
                      <div className="bg-surface-2 border border-border px-3 py-1 rounded-md text-[9px] font-mono text-muted flex-grow flex items-center justify-between select-all">
                        <span className="truncate">https://demo.storylane.com/share/qs8siqrz4fvz</span>
                        <a href="https://demo.storylane.com/share/qs8siqrz4fvz" target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5 hover:text-primary transition cursor-pointer" />
                        </a>
                      </div>
                    </div>
                    {/* Iframe de Storylane */}
                    <div className="relative w-full h-[600px] bg-white">
                      <iframe
                        src="https://demo.storylane.com/share/qs8siqrz4fvz"
                        className="w-full h-full border-none"
                        title="Tutorial Interactivo Anura"
                        allowFullScreen
                      />
                    </div>
                  </div>

                </div>
              </div>

              {/* SUBSECCIÓN 4: CASOS DE USO */}
              <div id="casos-de-uso" className="scroll-mt-24 pt-6">
                <div className="space-y-6">
                  <h3 className="font-heading font-bold text-lg text-text border-b border-border pb-2">
                    Casos de Uso & Módulo de Identificación
                  </h3>

                  <div className="bg-surface-2 border border-border rounded-xl p-6 space-y-4">
                    <p className="text-xs font-black text-primary uppercase tracking-wider">
                      Módulo de Identificación (Núcleo del Sistema)
                    </p>
                    <p className="text-xs text-muted leading-relaxed font-semibold">
                      El componente central para catalogar anuros sigue este flujo secuencial:
                    </p>

                    <ol className="space-y-3.5 text-xs text-muted leading-relaxed font-semibold">
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-black">1</span>
                        <div>
                          <strong className="text-text">Selección de imagen:</strong> El usuario puede capturar una foto directamente con la cámara del dispositivo móvil o seleccionar un archivo desde la galería de fotos.
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-black">2</span>
                        <div>
                          <strong className="text-text">Previsualización:</strong> Permite recortar y revisar el encuadre de la imagen antes de subirla y procesarla con la red neuronal.
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-black">3</span>
                        <div>
                          <strong className="text-text">Ubicación GPS:</strong> El usuario decide si autoriza compartir su geolocalización. La ubicación optimiza el modelo cruzando la presencia reportada de especies en esa coordenada para refinar las probabilidades.
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-black">4</span>
                        <div>
                          <strong className="text-text">Resultados:</strong> Muestra un listado ordenado de las tres especies con mayor probabilidad matemática expresadas en porcentaje de confianza, enlazando descriptores anatómicos y vocalizaciones de iNaturalist.
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center font-black">5</span>
                        <div>
                          <strong className="text-text">Almacenamiento y Privacidad:</strong> Permite almacenar la observación de forma pública (para compartirla con la red y validarla por expertos) o privada (ocultando sus coordenadas y fotos del feed global).
                        </div>
                      </li>
                    </ol>
                  </div>


                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                SECCIÓN ÚNICA CONSOLIDADA: SOPORTE
                ══════════════════════════════════════════════════════════════ */}
            <section
              id="soporte"
              className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft transition-colors duration-300 space-y-16"
            >
              {/* SUBSECCIÓN 1: FAQ */}
              <div id="faq" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6 pt-6">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                    <BsChevronDown className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold">Soporte</p>
                    <h2 className="font-heading font-extrabold text-2xl text-text">Preguntas Frecuentes (FAQ)</h2>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    {
                      q: "¿Cómo funciona el modelo de identificación de anuros?",
                      a: "El sistema emplea el modelo BioClip reentrenado específicamente para clasificar anuros de Colombia. Dicho modelo procesa patrones de textura y color para generar la predicción taxonómica."
                    },
                    {
                      q: "¿Es obligatoria la ubicación GPS para identificar?",
                      a: "No, la ubicación GPS es opcional. Sin embargo, activarla incrementa en gran medida la exactitud de los resultados ya que permite al sistema contrastar las especies reportadas en iNaturalist para esa área biogeográfica específica."
                    },
                    {
                      q: "¿Qué sucede si subo una especie en grave peligro de extinción?",
                      a: "El sistema detecta el estado de conservación según la UICN. Si está amenazada, encripta y ofusca de forma automática las coordenadas exactas de avistamiento al guardarse de manera pública, para resguardar el espécimen de coleccionistas o tráfico ilegal."
                    }
                  ].map((faq, i) => (
                    <div key={i} className="bg-surface-2 border border-border rounded-xl p-5 space-y-2 hover:border-primary/30 transition">
                      <h4 className="font-bold text-sm text-text flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        {faq.q}
                      </h4>
                      <p className="text-xs text-muted leading-relaxed font-semibold pl-4">
                        {faq.a}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* SUBSECCIÓN 2: SOLUCIÓN DE PROBLEMAS */}
              <div id="solucion-de-problemas" className="scroll-mt-24 pt-6">
                <div className="space-y-6">
                  <h3 className="font-heading font-bold text-lg text-text border-b border-border pb-2">
                    Solución de Problemas
                  </h3>

                  <div className="space-y-4">
                    {[
                      {
                        issue: "Error de Servidor: 'Unauthorized' o 'Json invalid'",
                        solution: "En caso de obtener un error de servidor como 'no autorizado', JSON inválido o HTML no verificable, por favor verifique que la IA esté corriendo correctamente en Docker. Debe comprobar que aparezca el mensaje de BioClip cargado correctamente y la solicitud de realizar la evaluación con IA. En caso de que eso no ocurra, espere un tiempo mientras cargamos el modelo de IA. La primera ejecución puede demorarse dependiendo de su capacidad de internet para descargar por primera vez el modelo de BioClip, que pesa 3,5 GB."
                      },
                      {
                        issue: "Error: No se puede obtener la localización del dispositivo",
                        solution: "Verifica que hayas otorgado permisos de GPS al navegador. En dispositivos móviles, asegúrate de tener encendido el servicio de localización en los ajustes de privacidad del sistema operativo."
                      },
                      {
                        issue: "La carga de imágenes arroja error de formato",
                        solution: "La plataforma admite imágenes en formato PNG, JPEG, WEBP y HEIC. Si estás en iOS, asegúrate de que el peso del archivo HEIC no supere los 10MB."
                      }
                    ].map((prob, i) => (
                      <div key={i} className="bg-surface-2 border border-border rounded-xl p-5 space-y-2 hover:border-danger/30 transition">
                        <h4 className="font-bold text-sm text-danger flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-danger flex-shrink-0" />
                          {prob.issue}
                        </h4>
                        <p className="text-xs text-muted leading-relaxed font-semibold pl-4">
                          <strong>Solución:</strong> {prob.solution}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>


            {/* ══════════════════════════════════════════════════════════════
                SECCIÓN ÚNICA CONSOLIDADA: DOCUMENTACIÓN TÉCNICA
                ══════════════════════════════════════════════════════════════ */}
            <section
              id="tecnica"
              className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft transition-colors duration-300 space-y-16"
            >
              {/* SUBSECCIÓN 1: TECNOLOGÍAS UTILIZADAS */}
              <div id="tecnologias-utilizadas" className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-6 pt-6">
                  <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
                    <Terminal className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.35em] text-primary font-bold">Técnica</p>
                    <h2 className="font-heading font-extrabold text-2xl text-text">Tecnologías Utilizadas</h2>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { name: "Frontend", desc: "React 18 + Vite + Leaflet" },
                    { name: "Gateway", desc: "Nginx Proxy Manager (NPM)" },
                    { name: "Auth Service", desc: "Node.js + Express + JWT + bcrypt" },
                    { name: "Observations Service", desc: "Node.js + Express + Multer + MinIO" },
                    { name: "AI Service", desc: "FastAPI + BioCLIP (ViT-H/14)" },
                    { name: "Geo Service", desc: "Node.js + Express + APIs externas" },
                    { name: "Thumbnails Service", desc: "Node.js + Sharp + WebP" },
                    { name: "Base de datos", desc: "PostgreSQL 16 (multi-schema)" },
                    { name: "Cache", desc: "Redis 7" },
                    { name: "Storage", desc: "MinIO (S3-compatible)" }
                  ].map((tech, i) => (
                    <div key={i} className="bg-surface-2 border border-border rounded-xl p-4 space-y-1.5 hover:border-primary/30 transition">
                      <span className="font-heading font-extrabold text-xs text-primary block">{tech.name}</span>
                      <p className="text-xs text-muted leading-relaxed">{tech.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* SUBSECCIÓN 2: ARQUITECTURA */}
              <div id="arquitectura" className="scroll-mt-24 pt-6">
                <div className="space-y-6">
                  <h3 className="font-heading font-bold text-lg text-text border-b border-border pb-2">
                    Arquitectura del Sistema
                  </h3>

                  <div className="flex flex-col lg:flex-row gap-8 items-center">
                    <div className="space-y-4 text-xs text-muted leading-relaxed font-semibold max-w-2xl">
                      <p>
                        Anura opera bajo una arquitectura desacoplada de Cliente-Servidor estructurada como un monorepo:
                      </p>
                      <p>
                        1. <strong className="text-text">Frontend (React App):</strong> Sirve como el cliente interactivo que gestiona la carga de la imagen, adquiere las coordenadas GPS del dispositivo y procesa las vistas sociales de feed, mapa y perfiles.
                      </p>
                      <p>
                        2. <strong className="text-text">Backend (Node/Express Server):</strong> Administra el almacenamiento de fotos, realiza la autenticación OAuth con Google, gestiona las bases de datos de usuarios y efectúa las peticiones seguras hacia el modelo BioClip, encriptando coordenadas en caso de especies amenazadas.
                      </p>
                    </div>

                    <div className="bg-[#182312] border-2 border-border rounded-xl p-5 font-mono text-[9px] text-[#a4f261] w-full lg:max-w-xs space-y-1.5 shadow-md">
                      <p className="text-white font-bold border-b border-border/40 pb-1 mb-2 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary-light animate-pulse inline-block" /> Estructura de carpetas
                      </p>
                      <p>&gt; /anura</p>
                      <p>&nbsp;&nbsp;├── frontend/              # React PWA (Vite)</p>
                      <p>&nbsp;&nbsp;├── gateway/               # Nginx Proxy Manager config</p>
                      <p>&nbsp;&nbsp;├── services/</p>
                      <p>&nbsp;&nbsp;│   ├── auth-service/      # Node.js · Autenticación JWT</p>
                      <p>&nbsp;&nbsp;│   ├── observation-service/# Node.js · Registro de observaciones</p>
                      <p>&nbsp;&nbsp;│   ├── ai-service/        # FastAPI · BioCLIP + clasificador</p>
                      <p>&nbsp;&nbsp;│   ├── geo-service/       # Node.js · Clima, altitud, bioma</p>
                      <p>&nbsp;&nbsp;│   └── thumbnail-service/ # Node.js · Resize + WebP + MinIO</p>
                      <p>&nbsp;&nbsp;├── shared/                # Código compartido Node (pg, jwt, constants)</p>
                      <p>&nbsp;&nbsp;├── infrastructure/        # PostgreSQL init SQL, Redis, MinIO, monitoring</p>
                      <p>&nbsp;&nbsp;├── datasets/              # raw / processed / labeled / augmented</p>
                      <p>&nbsp;&nbsp;├── models/                # Modelos exportados (cnn, multimodal, production)</p>
                      <p>&nbsp;&nbsp;├── docs/                  # Arquitectura, API, diagramas</p>
                      <p>&nbsp;&nbsp;├── scripts/               # migrate.sh, train.sh, deploy.sh</p>
                      <p>&nbsp;&nbsp;├── docker-compose.yml</p>
                      <p>&nbsp;&nbsp;├── .env.example</p>
                      <p>&nbsp;&nbsp;└── README.md</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SUBSECCIÓN 3: FORMATO DE PROYECTO */}
              <div id="formato-de-proyecto-de-ingenieria-informatica-documentacion-tecnica" className="scroll-mt-24 pt-6">
                <div className="space-y-6">
                  <h3 className="font-heading font-bold text-lg text-text border-b border-border pb-2">
                    Formato de proyecto de ingeniería informática: documentación técnica
                  </h3>

                  <div className="flex flex-col lg:flex-row gap-8 items-start">
                    <div className="space-y-4 text-xs text-muted leading-relaxed font-semibold max-w-2xl">
                      <p>
                        A continuación, puedes visualizar el documento completo con el formato del proyecto de ingeniería informática, incluyendo la documentación técnica detallada del sistema Anura.
                      </p>
                      
                      <a
                        href="./Formato-Proyecto-Ingenieria.pdf"
                        download
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-bold transition shadow-md"
                      >
                        <Download className="w-4 h-4" />
                        Descargar Documento
                      </a>
                    </div>
                    
                    {/* PDF Preview Frame */}
                    <div className="border border-border rounded-xl overflow-hidden bg-surface-3 w-full">
                      <div className="bg-surface px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted">
                        <span className="font-semibold text-text flex items-center gap-1.5">
                          <FileCode className="w-3.5 h-3.5 text-primary" /> Previsualización PDF
                        </span>
                        <a
                          href="./Formato-Proyecto-Ingenieria.pdf"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline font-bold"
                        >
                          Pantalla Completa
                        </a>
                      </div>
                      <div className="relative w-full h-[400px]">
                        <iframe
                          src="./Formato-Proyecto-Ingenieria.pdf#toolbar=0&navpanes=0&scrollbar=0"
                          className="w-full h-full border-none bg-white"
                          title="Formato Proyecto Ingeniería de Software"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════
                SECCIÓN ÚNICA CONSOLIDADA: CRÉDITOS
                ══════════════════════════════════════════════════════════════ */}
            <section
              id="creditos"
              className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft transition-colors duration-300 space-y-16"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                {/* SUBSECCIÓN 1: INTEGRANTES */}
                <div id="integrantes-del-equipo" className="scroll-mt-24 space-y-4">
                  <h4 className="font-heading font-extrabold text-sm text-primary uppercase tracking-wider border-b border-border pb-1.5">
                    Integrantes
                  </h4>
                  <div className="space-y-1 text-xs font-semibold">
                    <p className="text-text font-bold">Juan Sebastián Martínez Galeano – 1026135816</p>
                    <p className="text-text font-bold">Samuel Usma Brand – 1026133461</p>
                    <p className="text-text font-bold">Samuel Salas Echeverry – 1026136502</p>
                    <p className="text-text font-bold">Juan Pablo Restrepo Alzate – 1025642179</p>
                    <p className="text-text font-bold">Santiago Córdoba Muriel - 1001578005</p>
                    <p className="text-text font-bold">Cesar Ocampo raigosa - 1026134099</p>
                    <p className="text-text font-bold">Miguel Angel Vergara Mazo - 1017922264</p>
                    <p className="text-text font-bold">Yuli Vanessa Soto Montoya - 1017925306</p>
                  </div>
                </div>

                {/* SUBSECCIÓN 2: INSTITUCIÓN */}
                <div id="institucion" className="scroll-mt-24 space-y-4">
                  <h4 className="font-heading font-extrabold text-sm text-primary uppercase tracking-wider border-b border-border pb-1.5">
                    Institución
                  </h4>
                  <div className="space-y-1 text-xs font-semibold text-muted">
                    <p className="text-text font-bold">Corporación Universitaria Lasallista</p>
                    <p>Facultad de Ingeniería Informática / Facultad de Veterinaria / Facultad de Ingeniería Ambiental</p>
                    <p>Caldas, Antioquia</p>
                  </div>
                </div>

                {/* SUBSECCIÓN 3: AÑO */}
                <div id="ano" className="scroll-mt-24 space-y-4">
                  <h4 className="font-heading font-extrabold text-sm text-primary uppercase tracking-wider border-b border-border pb-1.5">
                    Cronología
                  </h4>
                  <div className="space-y-1 text-xs font-semibold text-muted">
                    <p className="text-text font-bold">Año del Proyecto: 2026</p>
                    <p>Fases: Diseño, Entrenamiento, Despliegue y Pruebas en campo.</p>
                  </div>
                </div>
              </div>
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
