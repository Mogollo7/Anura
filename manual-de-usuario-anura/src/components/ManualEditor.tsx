import React from 'react';
import { 
  Settings, 
  Github, 
  Globe, 
  Mail, 
  Tag, 
  Layers, 
  Plus, 
  Trash2, 
  HelpCircle,
  FileCode,
  Sparkles
} from 'lucide-react';
import { ManualConfig } from '../types';

interface ManualEditorProps {
  config: ManualConfig;
  onChange: (updatedConfig: ManualConfig) => void;
  iframeUrls: {
    login: string;
    map: string;
    species: string;
    taxonomy: string;
    profile: string;
    search: string;
    users: string;
    observers: string;
  };
  onIframeUrlsChange: (urls: {
    login: string;
    map: string;
    species: string;
    taxonomy: string;
    profile: string;
    search: string;
    users: string;
    observers: string;
  }) => void;
}

export default function ManualEditor({ config, onChange, iframeUrls, onIframeUrlsChange }: ManualEditorProps) {

  const handleTextChange = (field: keyof ManualConfig, value: string) => {
    onChange({
      ...config,
      [field]: value
    });
  };

  const handleRequirementChange = (index: number, value: string) => {
    const updated = [...config.requirements];
    updated[index] = value;
    onChange({
      ...config,
      requirements: updated
    });
  };

  const addRequirement = () => {
    onChange({
      ...config,
      requirements: [...config.requirements, "Nueva dependencia o requerimiento"]
    });
  };

  const removeRequirement = (index: number) => {
    const updated = config.requirements.filter((_, i) => i !== index);
    onChange({
      ...config,
      requirements: updated
    });
  };

  const handleInstallationStepChange = (index: number, field: 'title' | 'command' | 'explanation', value: string) => {
    const updatedSteps = config.installationSteps.map((step, i) => {
      if (i === index) {
        return { ...step, [field]: value };
      }
      return step;
    });
    onChange({
      ...config,
      installationSteps: updatedSteps
    });
  };

  return (
    <div className="bg-surface border-2 border-border p-8 rounded-brand shadow-soft mb-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="p-2 rounded-md bg-earth/10 text-earth">
          <Settings className="w-5 h-5 stroke-[2.5]" />
        </span>
        <h3 className="bold-headline text-lg sm:text-xl text-primary-dark">
          Panel de Personalización en Vivo
        </h3>
      </div>
      
      <p className="text-xs text-muted mb-6 font-semibold">
        Modifica los campos inferiores. El manual de usuario interactivo que se muestra en pantalla **se actualizará de forma instantánea**. Una vez terminada tu edición, puedes ir a la sección de exportación para guardar tu manual en Markdown.
      </p>

      <div className="space-y-6">
        {/* Datos Identitarios */}
        <div>
          <h4 className="bold-headline text-xs text-primary tracking-wider mb-4">
            Información de la Aplicación Anura
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Nombre de la Aplicación</label>
              <input
                type="text"
                value={config.appName}
                onChange={(e) => handleTextChange('appName', e.target.value)}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Enlace GitHub de tu Proyecto</label>
              <div className="relative">
                <Github className="w-4 h-4 text-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={config.repoUrl}
                  onChange={(e) => handleTextChange('repoUrl', e.target.value)}
                  className="w-full bg-surface-2 border-2 border-border rounded pl-9 pr-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Enlace del Despliegue (Ej. GitHub Pages)</label>
              <div className="relative">
                <Globe className="w-4 h-4 text-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={config.deploymentUrl}
                  onChange={(e) => handleTextChange('deploymentUrl', e.target.value)}
                  className="w-full bg-surface-2 border-2 border-border rounded pl-9 pr-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Correo del Desarrollador / Contacto</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={config.contactEmail}
                  onChange={(e) => handleTextChange('contactEmail', e.target.value)}
                  className="w-full bg-surface-2 border-2 border-border rounded pl-9 pr-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Descripción Corta</label>
            <textarea
              rows={2}
              value={config.description}
              onChange={(e) => handleTextChange('description', e.target.value)}
              className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Autor / Creador</label>
              <input
                type="text"
                value={config.authorName}
                onChange={(e) => handleTextChange('authorName', e.target.value)}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Licencia del Proyecto</label>
              <input
                type="text"
                value={config.license}
                onChange={(e) => handleTextChange('license', e.target.value)}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
          </div>
        </div>

        <hr className="border-border border-b-2" />

        {/* Enlaces de los Iframes */}
        <div>
          <h4 className="bold-headline text-xs text-primary tracking-wider mb-4">
            Enlaces de los Iframes del Manual
          </h4>
          <p className="text-2xs text-muted mb-3 font-semibold">
            Modifica las URLs para los iframes integrados en el simulador de navegador del manual interactivo.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Inicio de Sesión (Login)</label>
              <input
                type="text"
                value={iframeUrls.login}
                onChange={(e) => onIframeUrlsChange({ ...iframeUrls, login: e.target.value })}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Mapa de Distribución</label>
              <input
                type="text"
                value={iframeUrls.map}
                onChange={(e) => onIframeUrlsChange({ ...iframeUrls, map: e.target.value })}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Especies y Observaciones</label>
              <input
                type="text"
                value={iframeUrls.species}
                onChange={(e) => onIframeUrlsChange({ ...iframeUrls, species: e.target.value })}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Información Taxonómica (Leer más)</label>
              <input
                type="text"
                value={iframeUrls.taxonomy}
                onChange={(e) => onIframeUrlsChange({ ...iframeUrls, taxonomy: e.target.value })}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Perfil de Usuario</label>
              <input
                type="text"
                value={iframeUrls.profile}
                onChange={(e) => onIframeUrlsChange({ ...iframeUrls, profile: e.target.value })}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Sección de Búsqueda</label>
              <input
                type="text"
                value={iframeUrls.search}
                onChange={(e) => onIframeUrlsChange({ ...iframeUrls, search: e.target.value })}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Sección de Usuarios</label>
              <input
                type="text"
                value={iframeUrls.users}
                onChange={(e) => onIframeUrlsChange({ ...iframeUrls, users: e.target.value })}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
            <div>
              <label className="block text-2xs font-extrabold text-muted mb-1 uppercase">Sección de Observadores</label>
              <input
                type="text"
                value={iframeUrls.observers}
                onChange={(e) => onIframeUrlsChange({ ...iframeUrls, observers: e.target.value })}
                className="w-full bg-surface-2 border-2 border-border rounded px-3 py-2 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
              />
            </div>
          </div>
        </div>

        <hr className="border-border border-b-2" />

        {/* Requerimientos */}
        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="bold-headline text-xs text-primary tracking-wider">
              Requerimientos y Tecnologías
            </h4>
            <button
              type="button"
              onClick={addRequirement}
              className="flex items-center gap-1 text-[11px] font-extrabold text-primary hover:text-primary-dark transition uppercase"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" /> Agregar Requerimiento
            </button>
          </div>
          <div className="space-y-2">
            {config.requirements.map((req, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Tag className="w-3.5 h-3.5 text-muted flex-none" />
                <input
                  type="text"
                  value={req}
                  onChange={(e) => handleRequirementChange(i, e.target.value)}
                  className="flex-grow bg-surface-2 border-2 border-border rounded px-3 py-1.5 text-xs font-bold text-text focus:outline-none focus:border-primary transition"
                />
                <button
                  type="button"
                  onClick={() => removeRequirement(i)}
                  className="p-1 px-2 text-danger hover:bg-danger/5 rounded transition text-xs flex items-center justify-center font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <hr className="border-border border-b-2" />

        {/* Pasos de Instalacion custom */}
        <div>
          <h4 className="bold-headline text-xs text-primary tracking-wider mb-3">
            Guía de Configuración e Instalación Rápida
          </h4>
          <p className="text-2xs text-muted mb-3 font-semibold">
            Personaliza los comandos y explicaciones de tu terminal. Estos cambios modifican la guía de inicio rápido del manual.
          </p>
          <div className="space-y-4">
            {config.installationSteps.map((step, index) => (
              <div key={step.id} className="bg-surface-2 p-4 rounded-lg border-2 border-border space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-6 h-6 flex items-center justify-center rounded-full bg-primary text-white text-2xs font-extrabold font-mono">
                    {index + 1}
                  </span>
                  <input
                    type="text"
                    value={step.title}
                    onChange={(e) => handleInstallationStepChange(index, 'title', e.target.value)}
                    className="flex-grow bg-surface border-2 border-border rounded px-2.5 py-1.5 text-xs font-extrabold text-text focus:outline-none focus:border-primary transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-muted mb-0.5 uppercase">Comando de consola</label>
                  <div className="relative">
                    <FileCode className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={step.command}
                      onChange={(e) => handleInstallationStepChange(index, 'command', e.target.value)}
                      className="w-full bg-surface border-2 border-border rounded pl-8 pr-2 py-2 text-xs font-mono text-primary-dark font-extrabold focus:outline-none focus:border-primary transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold text-muted mb-0.5 uppercase">Explicación del paso</label>
                  <input
                    type="text"
                    value={step.explanation}
                    onChange={(e) => handleInstallationStepChange(index, 'explanation', e.target.value)}
                    className="w-full bg-surface border-2 border-border rounded px-2.5 py-1.5 text-xs text-text font-bold focus:outline-none focus:border-primary transition"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 bg-success/5 border-2 border-success/25 p-4 rounded-lg text-2xs text-success font-bold">
          <Sparkles className="w-4 h-4 flex-none" />
          <p>
            ¡Todo listo! Los cambios se propagan de manera automática a la vista previa del manual a la derecha y al descargador/exportador.
          </p>
        </div>
      </div>
    </div>
  );
}
