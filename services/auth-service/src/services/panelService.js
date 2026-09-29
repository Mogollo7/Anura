const panelAccountRepository = require('../repositories/panelAccountRepository');
const auditRepository = require('../repositories/auditRepository');

/**
 * Las 18 acciones de 19_ADMIN/Roles del Admin. Espejo de PANEL_ACTIONS en
 * admin/src/lib/auth/panel-accounts.ts — si se agrega una acción ahí, se agrega aquí.
 */
const PANEL_ACTIONS = [
  'verEspecies', 'editarTaxonomia', 'revisarFotografias', 'validarEstadio',
  'definirMorfo', 'definirLRC', 'definirMicrohabitat', 'definirPesos',
  'crearComplejo', 'ejecutarEntrenamiento', 'modificarWorker', 'verGPU',
  'configurarOSR', 'generarPaquete', 'aprobarCientifico', 'publicarPaquete',
  'gestionarCuentas', 'debugTecnico', 'editarContenido', 'publicarContenido',
];

const ALL_TRUE = Object.fromEntries(PANEL_ACTIONS.map((a) => [a, true]));

/** Plantillas de creación: el cliente manda el nombre, nunca los permisos crudos. */
const ROLE_TEMPLATES = {
  administrador: ALL_TRUE,
  herpetologo: {
    verEspecies: true, editarTaxonomia: true, revisarFotografias: true, validarEstadio: true,
    definirMorfo: true, definirLRC: true, definirMicrohabitat: true, definirPesos: true,
    crearComplejo: true, ejecutarEntrenamiento: false, modificarWorker: false, verGPU: false,
    configurarOSR: false, generarPaquete: false, aprobarCientifico: true, publicarPaquete: false,
    gestionarCuentas: false, debugTecnico: false, editarContenido: true, publicarContenido: true,
  },
};

exports.PANEL_ACTIONS = PANEL_ACTIONS;

/**
 * Cuenta del panel para este JWT + el resto de cuentas (para el selector "operar como"
 * en modo demostración y para que un super usuario administre). Primer login real de
 * esa cuenta: ata el user_id, ya no cambia después.
 */
exports.getMe = async (jwtUser) => {
  const account = await panelAccountRepository.findByEmail(jwtUser.email);
  if (!account) return null;
  if (!account.userId) {
    await panelAccountRepository.linkUserId(account.id, jwtUser.id);
    // Si otra persona ganó la carrera, el UPDATE no cambió nada: se vuelve a leer quién quedó atado.
    const atada = await panelAccountRepository.findById(account.id);
    if (!atada) return null;
    account.userId = atada.userId;
  }
  // La cuenta del panel pertenece a UNA persona (auth.users.id), no a un correo: sin esta
  // comparación, otra cuenta con el mismo correo (mayúsculas distintas, o una registrada después
  // de borrar a la dueña) heredaría todos sus permisos.
  if (account.userId !== jwtUser.id) return null;
  return account;
};

exports.list = () => panelAccountRepository.list();

exports.create = async ({ name, email, template }, actor) => {
  if (!name || !email) throw new Error('Nombre y correo son obligatorios');
  if (!ROLE_TEMPLATES[template]) throw new Error('Plantilla inválida');
  if (await panelAccountRepository.findByEmail(email)) throw new Error('Ya existe una cuenta del panel con ese correo');

  // Si la persona ya tiene cuenta en ANURA, la cuenta del panel nace atada a ella: nadie más puede
  // reclamarla registrándose con ese correo. Si aún no se registró, se ata en su primer ingreso.
  const userId = await panelAccountRepository.findUserIdByEmail(email);
  const account = await panelAccountRepository.create({
    name,
    email,
    permissions: ROLE_TEMPLATES[template],
    createdBy: actor.id,
    userId,
  });
  await auditRepository.log({
    actorId: actor.userId,
    action: 'panel_account.create',
    targetType: 'panel_account',
    targetId: account.id,
    metadata: { name, email, template },
  });
  return account;
};

exports.updatePermission = async (id, action, value, actor) => {
  if (!PANEL_ACTIONS.includes(action)) throw new Error('Acción desconocida');
  if (typeof value !== 'boolean') throw new Error('El valor debe ser verdadero o falso');

  const target = await panelAccountRepository.findById(id);
  if (!target) throw new Error('Cuenta no encontrada');
  if (target.isSuperAdmin) throw new Error('El super usuario no es degradable');

  const updated = await panelAccountRepository.updatePermission(id, action, value);
  await auditRepository.log({
    actorId: actor.userId,
    action: 'panel_account.permission_change',
    targetType: 'panel_account',
    targetId: id,
    metadata: { action, value },
  });
  return updated;
};

exports.remove = async (id, actor) => {
  const target = await panelAccountRepository.findById(id);
  if (!target) throw new Error('Cuenta no encontrada');
  if (target.isSuperAdmin) throw new Error('El super usuario no es suspendible');

  await panelAccountRepository.remove(id);
  await auditRepository.log({
    actorId: actor.userId,
    action: 'panel_account.remove',
    targetType: 'panel_account',
    targetId: id,
    metadata: { email: target.email },
  });
};
