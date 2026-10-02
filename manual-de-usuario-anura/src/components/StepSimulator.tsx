import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Cpu, 
  Search, 
  ChevronRight, 
  Sparkles, 
  Music, 
  MapPin, 
  AlertCircle, 
  Compass, 
  CheckCircle2, 
  Share2,
  FileText
} from 'lucide-react';
import { INITIAL_ANURANS } from '../data/anuransData';
import { SelectedAnuran } from '../types';

interface StepSimulatorProps {
  customAppName: string;
}

export default function StepSimulator({ customAppName }: StepSimulatorProps) {
  const [selectedFrog, setSelectedFrog] = useState<SelectedAnuran>(INITIAL_ANURANS[0]);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const runAnalysis = () => {
    setAnalyzing(true);
    setProgress(0);
    setCurrentStep(2);
    setAnalysisLogs(["Iniciando canalización de imagen de entrada...", "Extrayendo características geométricas de cabeza y córnea..."]);
  };

  useEffect(() => {
    if (!analyzing) return;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setAnalyzing(false);
          setCurrentStep(3);
          return 100;
        }

        // Add periodic logs for visual depth
        if (prev === 25) {
          setAnalysisLogs(prevLogs => [...prevLogs, "Extrayendo patrón de coloración lateral y ventral..."]);
        } else if (prev === 50) {
          setAnalysisLogs(prevLogs => [...prevLogs, "Consultando modelo BioClip (versión optimizada)..."]);
        } else if (prev === 75) {
          setAnalysisLogs(prevLogs => [...prevLogs, "Analizando coincidencia taxonómica con iNaturalist API..."]);
        } else if (prev === 90) {
          setAnalysisLogs(prevLogs => [...prevLogs, "Calculando confidence score y descriptores de hábitat..."]);
        }

        return prev + 5;
      });
    }, 150);

    return () => clearInterval(timer);
  }, [analyzing]);

  const selectPreloadFrog = (frog: SelectedAnuran) => {
    setSelectedFrog(frog);
    setCurrentStep(1);
    setProgress(0);
    setAnalyzing(false);
    setShareFeedback(null);
  };

  const handleShare = () => {
    setShareFeedback(`¡Enlace para ${selectedFrog.nameScientific} copiado!`);
    setTimeout(() => {
      setShareFeedback(null);
    }, 3000);
  };

  return (
    <div className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b-2 border-border pb-5 mb-6 gap-4">
        <div>
          <span className="bold-badge mb-2">03 / Simulador</span>
          <h3 className="bold-headline text-lg sm:text-2xl text-primary-dark">
            Demostración en Vivo: Paso a Paso
          </h3>
          <p className="text-muted text-xs font-semibold">
            Prueba cómo interactúa un usuario final con tu web <strong>{customAppName}</strong> para identificar anuros con IA.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-surface-2 border-2 border-border px-3.5 py-1.5 rounded-full text-xs font-bold w-fit">
          <span className="w-2.5 h-2.5 rounded-full bg-primary-light animate-pulse inline-block"></span>
          <span>SIMULADOR OPERATIVO</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Selector de anuros de entrada */}
        <div className="lg:col-span-1 border-r-0 lg:border-r-2 border-border/80 pr-0 lg:pr-6 space-y-4">
          <span className="text-xs font-extrabold text-muted uppercase tracking-wider block">
            1. Elige un espécimen:
          </span>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
            {INITIAL_ANURANS.map((frog) => {
              const isSelected = selectedFrog.nameScientific === frog.nameScientific;
              return (
                <button
                  key={frog.nameScientific}
                  onClick={() => selectPreloadFrog(frog)}
                  className={`flex flex-col sm:flex-row items-center gap-2 p-2.5 rounded-lg border-2 text-left transition ${
                    isSelected 
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:bg-surface-2'
                  }`}
                >
                  <img 
                    src={frog.image} 
                    alt={frog.nameCommon} 
                    className="w-12 h-12 rounded-md object-cover flex-none filter saturate-110"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <p className="font-extrabold text-xs text-text leading-tight">{frog.nameCommon}</p>
                    <p className="italic text-[10px] text-muted font-mono">{frog.nameScientific}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="bg-surface-2 p-4 rounded-lg border-2 border-border">
            <h4 className="text-[11px] font-extrabold text-text flex items-center gap-1 mb-1 uppercase tracking-wide">
              <FileText className="w-3.5 h-3.5 text-earth" /> Información del Manual:
            </h4>
            <p className="text-[11px] text-muted leading-relaxed font-semibold">
              Este simulador refleja el flujo de diagnóstico real. Al tomar capturas de este flujo usando <strong>Flameshot</strong>, puedes agregarlas a tu documentación final de GitHub Pages.
            </p>
          </div>
        </div>

        {/* Simulador Interactivo de Interfaz */}
        <div className="lg:col-span-2 space-y-4">
          {/* Indicación de pasos del diagnóstico */}
          <div className="flex items-center justify-around bg-surface-2 border-2 border-border p-2 rounded-lg text-2xs font-extrabold uppercase">
            <span className={`px-2 py-1 rounded transition ${currentStep === 1 ? 'bg-primary text-white' : 'text-muted'}`}>
              01/Entrada
            </span>
            <ChevronRight className="w-3 h-3 text-muted" />
            <span className={`px-2 py-1 rounded transition ${currentStep === 2 ? 'bg-primary text-white' : 'text-muted'}`}>
              02/Análisis IA
            </span>
            <ChevronRight className="w-3 h-3 text-muted" />
            <span className={`px-2 py-1 rounded transition ${currentStep === 3 ? 'bg-success text-white' : 'text-muted'}`}>
              03/Resultados
            </span>
          </div>

          {/* Area de Visualización Activa */}
          <div className="bg-surface border-2 border-border rounded-lg p-6 min-h-[310px] flex flex-col justify-between relative shadow-sm overflow-hidden">
            <AnimatePresence mode="wait">
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col items-center justify-center py-6 text-center space-y-4 flex-grow"
                >
                  <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-border relative group">
                    <img 
                      src={selectedFrog.image} 
                      alt="Carga preliminar"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Upload className="w-6 h-6 text-white" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-text uppercase">Imagen: <span className="text-primary">{selectedFrog.nameCommon}</span></p>
                    <p className="text-xs text-muted max-w-sm font-semibold">
                      En tu aplicación real, el usuario puede arrastrar una foto desde sus archivos locales o capturarla en vivo usando la cámara de su smartphone.
                    </p>
                  </div>

                  <button
                    onClick={runAnalysis}
                    className="flex items-center gap-1.5 px-6 py-3 bg-primary hover:bg-primary-dark text-white rounded-md text-xs font-bold shadow-sm transition uppercase tracking-wider"
                  >
                    <Cpu className="w-4 h-4 text-white" />
                    Iniciar Identificación por IA
                  </button>
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col justify-center flex-grow py-6 space-y-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-extrabold text-text flex items-center gap-1 uppercase tracking-wide">
                        <Sparkles className="w-3.5 h-3.5 text-primary-light animate-spin" /> Analizando espécimen...
                      </span>
                      <span className="font-mono text-primary font-black text-sm">{progress}%</span>
                    </div>
                    {/* Barra de Progreso */}
                    <div className="w-full h-3 bg-surface-2 rounded-full border-2 border-border overflow-hidden">
                      <motion.div 
                        className="h-full bg-primary" 
                        initial={{ width: "0%" }}
                        animate={{ width: `${progress}%` }}
                        transition={{ ease: "easeInOut" }}
                      />
                    </div>
                  </div>

                  {/* Logs de la IA */}
                  <div className="bg-[#1a2414] text-[#a4f261] border-l-4 border-primary-light p-3.5 h-28 rounded-md font-mono text-[10px] space-y-1 overflow-y-auto">
                    {analysisLogs.map((log, i) => (
                      <p key={i}>&gt; {log}</p>
                    ))}
                  </div>
                </motion.div>
              )}

              {currentStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  className="space-y-4 flex-grow animate-fade-in"
                >
                  {/* Banner de Éxito de Clasificación */}
                  <div className="flex items-start gap-3 bg-[#eef5e6] border-2 border-[#d7e3c8] p-4 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <h4 className="text-xs font-black text-[#16240d] uppercase tracking-wide">
                        Clasificación Exitosa (iNaturalist API Grounding)
                      </h4>
                      <p className="text-[11px] text-[#62705a] leading-tight font-semibold">
                        La IA ha determinado la especie del anuro basándose en la correspondencia anatómica y las muestras biogeográficas.
                      </p>
                    </div>
                  </div>

                  {/* Tarjeta de Especie Final */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-2 border-border p-4 rounded-lg bg-surface-2">
                    <div className="sm:col-span-1 rounded-md overflow-hidden relative border-2 border-border/80 h-28 sm:h-auto">
                      <img 
                        src={selectedFrog.image} 
                        alt="Anura final diagnostic"
                        className="w-full h-full object-cover filter saturate-110"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-1.5 left-1.5 bg-primary/95 text-white font-mono text-[10px] px-2 py-0.5 rounded-full font-black shadow uppercase">
                        {selectedFrog.confidence}% Match
                      </div>
                    </div>
                    
                    <div className="sm:col-span-2 space-y-2 text-xs">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] bg-primary/10 text-primary font-black px-2 py-0.5 rounded uppercase tracking-wide">
                            {selectedFrog.family}
                          </span>
                          <span className="text-[9px] bg-earth/10 text-earth font-black px-2 py-0.5 rounded tracking-wide uppercase">
                            NATIVO
                          </span>
                        </div>
                        <h4 className="font-heading font-black text-lg text-text leading-tight mt-1 uppercase tracking-tight">
                          {selectedFrog.nameCommon}
                        </h4>
                        <p className="italic text-muted text-xs font-semibold font-mono">
                          {selectedFrog.nameScientific}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-1.5 bg-surface border-2 border-border p-3 rounded text-[10.5px] font-semibold text-muted leading-relaxed">
                        <p>
                          <strong className="text-text">Descripción:</strong> {selectedFrog.description}
                        </p>
                        <p className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-danger flex-none" />
                          <span><strong>Hábitat:</strong> {selectedFrog.habitat}</span>
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-[10px]">
                          <Music className="w-3.5 h-3.5 text-earth flex-none" />
                          <span><strong>Canto:</strong> {selectedFrog.soundDescription}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Boton de navegación posterior */}
                  <div className="flex justify-between items-center gap-2 text-2xs pt-1 flex-wrap">
                    <div>
                      {shareFeedback && (
                        <span className="text-success font-bold bg-success/10 px-3 py-1.5 rounded border border-success/30">
                          {shareFeedback}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentStep(1)}
                        className="px-4 py-2 border-2 border-border hover:bg-surface-2 rounded-md font-bold text-text transition uppercase tracking-wider"
                      >
                        Clasificar Otro
                      </button>
                      <button
                        onClick={handleShare}
                        className="px-4 py-2 bg-[#4f8f1f]/10 text-primary hover:bg-[#4f8f1f]/20 border-2 border-primary/20 rounded-md font-bold flex items-center gap-1 transition uppercase tracking-wider"
                      >
                        <Share2 className="w-3.5 h-3.5" /> Compartir Resultados
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
