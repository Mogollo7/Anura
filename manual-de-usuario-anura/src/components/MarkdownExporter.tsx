import React, { useState } from 'react';
import { 
  FileText, 
  Copy, 
  Check, 
  Download, 
  ArrowUpRight, 
  Award,
  Sparkles
} from 'lucide-react';
import { ManualConfig } from '../types';

interface MarkdownExporterProps {
  config: ManualConfig;
}

export default function MarkdownExporter({ config }: MarkdownExporterProps) {
  const [copied, setCopied] = useState(false);

  const generateMarkdownString = () => {
    return `# Manual de Usuario: ${config.appName} 🐸

> **Identificación de Anuros mediante Inteligencia Artificial y Reconocimiento de Imágenes.**
> Guía oficial de despliegue, configuración y uso.

---

## 🎯 Introducción
${config.description}

* **Creador / Autor:** ${config.authorName}
* **Licencia:** ${config.license}
* **Repositorio GitHub:** [${config.repoUrl}](${config.repoUrl})
* **Aplicación Desplegada:** [${config.deploymentUrl}](${config.deploymentUrl})

---

## 🛠️ Tecnologías y Requerimientos
Antes de comenzar, asegúrate de cumplir con los siguientes componentes en tu máquina local:
${config.requirements.map(req => `- [x] ${req}`).join('\n')}

---

## 🚀 Instalación y Guía Rápida de Configuración

Sigue estos sencillos pasos para clonar el repositorio, instalar las dependencias necesarias y lanzar la aplicación de manera local:

${config.installationSteps.map((step, idx) => `### Paso ${idx + 1}: ${step.title}
\`\`\`bash
${step.command}
\`\`\`
*Explicación:* ${step.explanation}
`).join('\n')}

---

## 📱 Guía Detallada Paso a Paso de Funcionalidades

### 1. Carga de Imágenes de Anuros (Ranas / Sapos)
El sistema acepta archivos en formato \`png\`, \`jpeg\`, \`webp\` y \`heic\`. El usuario puede subir una foto arrastrándola directamente en el lienzo interactivo o abriendo la cámara del smartphone para capturar el anuro en su hábitat.

### 2. Procesamiento con Inteligencia Artificial (BioClip & iNaturalist Grounding)
Una vez cargada la imagen, el usuario presiona el botón **"Identificar por IA"**. 
Esto activa una llamada hacia la API de Inteligencia Artificial que ejecuta los siguientes pasos internos:
* **Segmentación morfológica ocular:** Determina características propias de la córnea y pupila.
* **Mapeo de coloración y textura:** Identifica patrones ventrales y dorsales del anuro.
* **Búsqueda taxonómica combinada:** Cruza los datos anatómicos resultantes con la base biogeográfica de la base iNaturalist.

### 3. Visualización y Lectura de Resultados
Los resultados se muestran de manera instantánea clasificados con los siguientes datos:
* **Taxonomía:** Familia (ej. *Hylidae*, *Bufonidae*) y Especie (científica y común).
* **Porcentaje de Confianza:** Un indicador preciso del grado de coincidencia calculado por el modelo de IA.
* **Rasgos & Hábitat:** Datos sintetizados sobre su entorno geográfico habitual.
* **Canto característico:** Descripción acústica del croar para una confirmación auditiva del espécimen.

---

## 📸 Guía para Capturas Profesionales (Uso de Flameshot)

Para documentar y compartir tus identificaciones con un formato pulcro e impecable, recomendamos utilizar **Flameshot**, la potente herramienta de captura de pantalla libre.

### Atajos recomendados de Flameshot para la documentación de ${config.appName}:
* **P (Pen / Lápiz):** Dibuja círculos de forma manual para encerrar rasgos morfológicos clave en el anuro.
* **A (Arrow / Flecha de Señalación):** Úsa la flecha para apuntar a botones críticos de la interfaz, como **"Subir Foto"** o los resultados taxonómicos.
* **R (Rectangle / Rectángulo de Enfoque):** Útil para encuadrar la tarjeta de resultados de iNaturalist o la confianza de la IA.
* **T (Text / Texto):** Añade anotaciones rápidas (ej. *"¡Sapito nativo!"*).
* **B (Blur / Difuminado):** **¡Súper Importante!** Usa esta herramienta para emborronar y proteger tu configuración local en tu archivo \`server.ts\` / \`.env\` antes de hacer capturas para publicar.
* **N (Contador):** Inserta burbujas de números ordenados (1, 2, 3...) para ilustrar el orden de interacción en tus tutoriales o videos explicativos.

---

## 📬 Soporte y Redirección
* **Repositorio de Trabajo Principal:** Visita nuestro repositorio de código colaborativo oficial en GitHub a través del siguiente enlace para realizar aportes, registrar bugs o descargar lanzamientos estables:  
  👉 **[Repositorio GitHub Anura ENLACE](${config.repoUrl})**

* Puedes escribirnos directamente al correo: **${config.contactEmail}** para consultas sobre colecciones de datos científicos de anuros.
`;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateMarkdownString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadReadmeFile = () => {
    const md = generateMarkdownString();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'README.md');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b-2 border-border/80">
        <div className="flex items-center gap-2">
          <span className="p-2 rounded-md bg-success/10 text-success">
            <FileText className="w-5 h-5 stroke-[2.5]" />
          </span>
          <div>
            <span className="bold-badge mb-1">04 / Markdown EXPORT</span>
            <h3 className="bold-headline text-lg sm:text-2xl text-primary-dark">
              Exportar Manual Oficial (README.md)
            </h3>
          </div>
        </div>
        
        <div className="flex gap-2.5">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-surface-2 border-2 border-border hover:bg-surface text-text hover:text-primary rounded-md text-xs font-bold shadow-sm transition uppercase tracking-wider"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-success stroke-[2.5]" />
                <span>¡Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copiar MD</span>
              </>
            )}
          </button>
          <button
            onClick={downloadReadmeFile}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-md text-xs font-bold shadow-sm transition uppercase tracking-wider"
          >
            <Download className="w-4 h-4 text-white" />
            <span>Descargar README.md</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-muted mb-4 font-semibold leading-relaxed">
        Este generador incluye todas tus ediciones del formulario superior. Copia este contenido directamente y pégalo en el archivo <code>README.md</code> del repositorio raíz de tu GitHub para renderizar automáticamente tu manual de usuario profesional compatible con GitHub Pages.
      </p>

      {/* Caja de Visor Markdown */}
      <div className="relative rounded-lg overflow-hidden border-2 border-border bg-[#182312] text-[#e3f0db] p-4 text-xs font-mono max-h-96 overflow-y-auto">
        <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[10px] bg-black/80 text-[#aec39e] px-2.5 py-1.5 rounded-md border border-border/60 select-none uppercase font-black tracking-wider">
          <Sparkles className="w-3 h-3 text-primary-light" /> Markdown Live Template
        </div>
        <pre className="whitespace-pre-wrap leading-relaxed select-all pt-8 font-semibold">
          {generateMarkdownString()}
        </pre>
      </div>

      <div className="mt-6 flex justify-center border-t-2 border-border/65 pt-4">
        <a 
          href={config.repoUrl}
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-primary font-black hover:underline uppercase tracking-wider bg-primary/10 px-4 py-2 rounded-full border-2 border-primary/20"
        >
          Ir al repositorio original de Anura ({config.repoUrl})
          <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
        </a>
      </div>
    </div>
  );
}
