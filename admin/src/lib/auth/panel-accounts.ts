/**
 * Cuentas del panel administrativo (ciencia de datos), distintas de los
 * usuarios de ANURA Mobile. Roles del Admin del vault: administrador técnico
 * y herpetólogo, con permiso por ACCIÓN. El super usuario raíz no se degrada
 * ni se suspende. Las cuentas viven en Postgres (auth.panel_accounts); aquí
 * solo están los tipos, las etiquetas y las plantillas de rol.
 */

export type PanelAction =
  | "verEspecies"
  | "editarTaxonomia"
  | "revisarFotografias"
  | "validarEstadio"
  | "definirMorfo"
  | "definirLRC"
  | "definirMicrohabitat"
  | "definirPesos"
  | "crearComplejo"
  | "ejecutarEntrenamiento"
  | "modificarWorker"
  | "verGPU"
  | "configurarOSR"
  | "generarPaquete"
  | "aprobarCientifico"
  | "publicarPaquete"
  | "gestionarCuentas"
  | "debugTecnico"
  | "editarContenido"
  | "publicarContenido";

export const PANEL_ACTION_LABEL: Record<PanelAction, string> = {
  verEspecies: "Ver especies",
  editarTaxonomia: "Editar taxonomía",
  revisarFotografias: "Revisar fotografías",
  validarEstadio: "Validar adulto o juvenil",
  definirMorfo: "Definir morfos",
  definirLRC: "Definir LRC",
  definirMicrohabitat: "Definir microhábitat",
  definirPesos: "Definir pesos wv / wg / wm",
  crearComplejo: "Crear complejo críptico",
  ejecutarEntrenamiento: "Ejecutar entrenamiento",
  modificarWorker: "Modificar el worker",
  verGPU: "Ver GPU y VRAM",
  configurarOSR: "Configurar OSR técnico",
  generarPaquete: "Generar paquete",
  aprobarCientifico: "Aprobar paquete científico",
  publicarPaquete: "Publicar paquete",
  gestionarCuentas: "Administrar cuentas del panel",
  debugTecnico: "Debug técnico",
  editarContenido: "Editar contenido (ficha pública)",
  publicarContenido: "Publicar ficha pública",
};

export const PANEL_ACTIONS = Object.keys(PANEL_ACTION_LABEL) as PanelAction[];

/** Plantillas de la matriz real de "Roles del Admin" — punto de partida al crear una cuenta. */
export const PANEL_ROLE_TEMPLATES: Record<"administrador" | "herpetologo", Record<PanelAction, boolean>> = {
  administrador: Object.fromEntries(PANEL_ACTIONS.map((a) => [a, true])) as Record<PanelAction, boolean>,
  herpetologo: {
    verEspecies: true,
    editarTaxonomia: true,
    revisarFotografias: true,
    validarEstadio: true,
    definirMorfo: true,
    definirLRC: true,
    definirMicrohabitat: true,
    definirPesos: true,
    crearComplejo: true,
    ejecutarEntrenamiento: false,
    modificarWorker: false,
    verGPU: false,
    configurarOSR: false,
    generarPaquete: false,
    aprobarCientifico: true,
    publicarPaquete: false,
    gestionarCuentas: false,
    debugTecnico: false,
    editarContenido: true,
    publicarContenido: true,
  },
};

export type PanelAccount = {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  permissions: Record<PanelAction, boolean>;
  createdAt: string;
};
