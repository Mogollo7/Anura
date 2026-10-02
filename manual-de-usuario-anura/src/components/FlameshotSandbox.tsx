import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowUpRight, 
  Square, 
  Type, 
  Hash, 
  RotateCcw, 
  Info, 
  Sliders, 
  Sparkles, 
  EyeOff, 
  HelpCircle,
  Scissors
} from 'lucide-react';
import { FLAMESHOT_TIPS } from '../data/anuransData';

interface Annotation {
  id: string;
  type: 'arrow' | 'rect' | 'num' | 'text' | 'blur';
  x: number;
  y: number;
  label?: string;
  color: string;
}

export default function FlameshotSandbox() {
  const [activeTool, setActiveTool] = useState<'arrow' | 'rect' | 'text' | 'blur' | 'num'>('arrow');
  const [annotations, setAnnotations] = useState<Annotation[]>([
    { id: '1', type: 'num', x: 200, y: 110, label: '1', color: '#c0392b' },
    { id: '2', type: 'arrow', x: 260, y: 150, label: 'Sección de Carga', color: '#4f8f1f' },
    { id: '3', type: 'rect', x: 290, y: 220, label: 'Enfoque IA', color: '#2f7d32' }
  ]);
  const [numCounter, setNumCounter] = useState(4);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    // Create new annotation
    let label = '';
    if (activeTool === 'num') {
      label = numCounter.toString();
      setNumCounter(numCounter + 1);
    } else if (activeTool === 'text') {
      label = prompt("Escribe tu anotación de texto:", "¡Análisis instantáneo!") || "Nota";
    }

    const colorMap = {
      arrow: '#c0392b', // danger/red
      rect: '#2f7d32',  // success/green
      text: '#4f8f1f',  // primary green
      blur: '#8b6f47',  // earth/brown
      num: '#8bcf43'    // primary-light/bright green
    };

    const newAnn: Annotation = {
      id: Date.now().toString(),
      type: activeTool,
      x,
      y,
      label,
      color: colorMap[activeTool]
    };

    setAnnotations([...annotations, newAnn]);
  };

  const clearCanvas = () => {
    setAnnotations([]);
    setNumCounter(1);
  };

  return (
    <div className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft mb-8">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-md bg-primary-light/10 text-primary">
              <Scissors className="w-5 h-5 stroke-[2.5]" />
            </span>
            <h3 className="bold-headline text-lg sm:text-2xl text-primary-dark">
              Simulador interactivo de capturas
            </h3>
          </div>
          <span className="bold-badge">Herramienta: Flameshot</span>
          <p className="text-muted text-xs font-semibold mt-2">
            Aprende a usar <strong>Flameshot</strong> para capturar, resaltar y documentar tu aplicación Anura. Haz clic en las herramientas inferiores y crea anotaciones en la pantalla de ejemplo.
          </p>
        </div>
        <button
          onClick={clearCanvas}
          className="flex items-center gap-1.5 text-xs text-danger border-2 border-danger/25 hover:bg-danger/5 px-3 py-2 rounded-md transition uppercase font-bold tracking-wider"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reiniciar marcas
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Guia lateral de Flameshot */}
        <div className="xl:col-span-1 space-y-4">
          <div className="bg-surface-2 border-2 border-border rounded-lg p-5">
            <h4 className="text-xs font-black text-text uppercase tracking-wider mb-3.5 flex items-center gap-1.5 border-b pb-1.5 font-heading">
              <Info className="w-3.5 h-3.5 text-primary" /> Atajos en Flameshot
            </h4>
            <div className="space-y-3">
              {FLAMESHOT_TIPS.map((tip) => (
                <div key={tip.key} className="flex gap-2">
                  <span className="flex-none w-5 h-5 flex items-center justify-center font-mono text-xs font-black bg-surface border-2 border-border rounded shadow-sm text-text">
                    {tip.key}
                  </span>
                  <div className="text-[11px] leading-tight">
                    <span className="font-extrabold text-text block flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: tip.colorHex }} />
                      {tip.tool}
                    </span>
                    <span className="text-muted font-semibold">{tip.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-4 text-[11px] text-muted space-y-2">
            <span className="font-extrabold text-primary-dark flex items-center gap-1 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Consejo pro:
            </span>
            <p className="font-semibold leading-relaxed">
              Usa el difuminador <strong>(Blur)</strong> para tapar llaves de API o configuración local antes de subir capturas a tu repositorio de GitHub.
            </p>
          </div>
        </div>

        {/* Simulador de Canvas */}
        <div className="xl:col-span-3 space-y-4">
          {/* Barra de herramientas */}
          <div className="flex flex-wrap gap-2 items-center bg-surface-2 border-2 border-border p-2.5 rounded-lg">
            <span className="text-[10px] font-black text-muted uppercase tracking-wider px-2">
              SELECCIONA:
            </span>
            {[
              { id: 'arrow', label: 'Flecha Roja', icon: ArrowUpRight, color: '#c0392b' },
              { id: 'rect', label: 'Marco Verde', icon: Square, color: '#2f7d32' },
              { id: 'text', label: 'Anotar Texto', icon: Type, color: '#4f8f1f' },
              { id: 'blur', label: 'Difuminar (Blur)', icon: EyeOff, color: '#8b6f47' },
              { id: 'num', label: 'Círculo Numérico', icon: Hash, color: '#8bcf43' },
            ].map((t) => {
              const Icon = t.icon;
              const isSelected = activeTool === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTool(t.id as any)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold border-2 transition ${
                    isSelected 
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-surface hover:bg-surface-2 text-text border-border'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Recinto del Canvas de la App Web Anura */}
          <div className="relative border-2 border-border rounded-lg overflow-hidden select-none shadow-md">
            {/* Cabecera simulada de la app Web Anura */}
            <div className="bg-surface border-b-2 border-border px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-danger inline-block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-earth inline-block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-success inline-block"></span>
                <span className="text-2xs font-mono text-muted ml-2">https://mogollo7.github.io/Anura</span>
              </div>
              <span className="text-2xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded uppercase tracking-wider">Rana Classifier v1.0</span>
            </div>

            {/* Espacio interactivo */}
            <div 
              ref={containerRef}
              onClick={handleCanvasClick}
              className="bg-[#111d12]/9 w-full h-[280px] sm:h-[320px] relative cursor-crosshair overflow-hidden"
              style={{
                backgroundImage: 'radial-gradient(var(--border) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
                backgroundColor: '#f5f7f3'
              }}
            >
              {/* Contenido simulado de fondo que se está capturando */}
              <div className="absolute inset-4 flex flex-col justify-between pointer-events-none opacity-40">
                <div className="flex justify-between items-start">
                  <div className="border border-[#4f8f1f]/30 p-2 rounded bg-surface w-44">
                    <div className="h-2 w-16 bg-muted/40 rounded mb-1"></div>
                    <div className="h-6 bg-primary-light/20 rounded mt-1"></div>
                  </div>
                  <div className="border border-[#4f8f1f]/30 p-2 rounded bg-surface w-36 text-right">
                    <div className="h-2 w-12 bg-muted/40 rounded ml-auto mb-1"></div>
                    <div className="h-4 w-20 bg-muted/20 rounded ml-auto"></div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center py-6">
                  <div className="w-16 h-16 rounded-full border-4 border-dashed border-primary/40 flex items-center justify-center text-primary/40 font-bold">
                    [+]
                  </div>
                  <p className="text-2xs text-muted/60 mt-1 font-mono">Arrastra tu foto de anuro aquí</p>
                </div>

                <div className="flex items-center justify-between border-t border-border pt-2 text-[9px] text-muted font-mono">
                  <span>API Status: Conectado</span>
                  <span>Model: BioClip-v2.5</span>
                </div>
              </div>

              {/* Guías explicativas del simulador */}
              {annotations.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-surface/80 pointer-events-none transition-all">
                  <HelpCircle className="w-8 h-8 text-primary animate-bounce mb-2" />
                  <p className="text-sm font-bold text-text uppercase tracking-wide">¡Simulador de Capturas Activo!</p>
                  <p className="text-xs text-muted max-w-sm mt-1 font-semibold">
                    Selecciona una herramienta arriba y haz clic en cualquier lugar de esta pantalla para simular una marca de Flameshot.
                  </p>
                </div>
              )}

              {/* Render de anotaciones */}
              {annotations.map((ann) => {
                return (
                  <motion.div
                    key={ann.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    style={{ left: ann.x, top: ann.y }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                  >
                    {/* Flecha Indicator v2.0 */}
                    {ann.type === 'arrow' && (
                      <div className="relative flex flex-col items-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-danger" />
                        <div className="w-0.5 h-8 bg-danger" />
                        <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[8px] border-t-danger" />
                        {ann.label && (
                          <span className="absolute -bottom-5 whitespace-nowrap text-[9px] font-bold text-white bg-danger px-1 rounded">
                            {ann.label}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Rectángulo de Enfoque */}
                    {ann.type === 'rect' && (
                      <div className="border-2 border-dashed border-success bg-success/10 w-24 h-14 rounded flex items-center justify-center">
                        <span className="text-[8px] font-mono font-bold text-success-dark bg-white/90 px-1 rounded shadow-sm">
                          {ann.label || 'Highlight'}
                        </span>
                      </div>
                    )}

                    {/* Texto explicativo */}
                    {ann.type === 'text' && (
                      <div className="bg-primary text-white text-[10px] py-0.5 px-2 rounded-full font-medium whitespace-nowrap shadow-sm border border-white flex items-center gap-1">
                        <Type className="w-2.5 h-2.5" />
                        <span>{ann.label}</span>
                      </div>
                    )}

                    {/* Difuminador */}
                    {ann.type === 'blur' && (
                      <div className="w-20 h-6 bg-muted/40 backdrop-blur-md rounded border border-white/20 flex items-center justify-center">
                        <span className="text-[7px] font-mono text-white select-none font-bold">••••••••••••</span>
                      </div>
                    )}

                    {/* Círculo numérico */}
                    {ann.type === 'num' && (
                      <div className="w-6 h-6 rounded-full bg-[#8bcf43] border border-white text-white text-[11px] font-bold flex items-center justify-center shadow-md animate-ping-once">
                        {ann.label}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
            
            {/* Indicaciones inferiores */}
            <div className="bg-[#eef5e6]/70 border-t-2 border-border px-3 py-2 text-[10px] text-muted flex items-center justify-between font-mono font-bold">
              <span>Anotaciones en lienzo: {annotations.length}</span>
              <span>Captura de Pantalla: <code className="bg-surface border px-1 rounded font-bold text-text">ImprPant</code> o <code className="bg-surface border px-1 rounded font-bold text-text">Meta+Shift+S</code></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
