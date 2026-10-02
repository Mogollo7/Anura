import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { copiarFotos, fotosConfiguradas, restaurarFotos, vaciarFotos, type ResumenFotos } from "@/lib/system/fotos";

/**
 * Respaldo de la base de datos desde Sistema. Corre en el servidor del Admin con las herramientas
 * de cliente de Postgres (pg_dump, psql); no hay contraseñas en el código ni en los logs:
 *  - BACKUP_DATABASE_URL: conexión con permiso de lectura sobre todos los esquemas (y de escritura
 *    solo si se va a permitir limpiar). Se descompone en variables PG* para el proceso hijo, así no
 *    aparece en la lista de procesos ni en ningún mensaje.
 *  - BACKUP_DIR: dónde quedan las copias (.dump formato custom + .json con huella y tamaño).
 *  - PG_DUMP_BIN / PSQL_BIN: rutas de los binarios si no están en el PATH. También acepta una lista JSON
 *    ["docker","exec","contenedor","pg_dump"] para correrlos dentro de otro contenedor (se usa en las pruebas).
 *  - BACKUP_ALLOW_CLEAN=1: sin esto la ruta de limpieza responde 403. Está apagada por defecto.
 */

export class RespaldoError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

const NOMBRE_ARCHIVO = /^anura-[a-z0-9_]+-\d{8}T\d{6}Z\.dump$/;

type Conexion = { base: string; env: Record<string, string> };

function conexion(): Conexion {
  const url = process.env.BACKUP_DATABASE_URL;
  if (!url) throw new RespaldoError("El respaldo no está configurado en este servidor: falta BACKUP_DATABASE_URL.", 503);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new RespaldoError("BACKUP_DATABASE_URL no es una dirección válida.", 503);
  }
  const base = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!base) throw new RespaldoError("BACKUP_DATABASE_URL no dice qué base respaldar.", 503);
  const env: Record<string, string> = { PGDATABASE: base, PGCONNECT_TIMEOUT: "10" };
  if (u.hostname) env.PGHOST = u.hostname;
  if (u.port) env.PGPORT = u.port;
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  return { base, env };
}

const dirRespaldos = () => process.env.BACKUP_DIR || path.join(homedir(), "anura-respaldos");
const permiteLimpiar = () => process.env.BACKUP_ALLOW_CLEAN === "1";

/** Quita de un texto de error cualquier valor sensible antes de devolverlo o escribirlo. */
function limpiar(texto: string, env: Record<string, string>) {
  let t = texto;
  for (const secreto of [env.PGPASSWORD, process.env.BACKUP_DATABASE_URL]) if (secreto) t = t.split(secreto).join("***");
  return t.trim().slice(0, 600);
}

/** El binario y los argumentos que lo preceden: "pg_dump", o la lista JSON de la variable de entorno. */
function comando(variable: string, defecto: string): string[] {
  const valor = process.env[variable];
  if (!valor) return [defecto];
  if (!valor.trim().startsWith("[")) return [valor];
  try {
    const lista = JSON.parse(valor) as unknown;
    if (Array.isArray(lista) && lista.length > 0 && lista.every((x) => typeof x === "string")) return lista as string[];
  } catch {
    /* cae al error de abajo */
  }
  throw new RespaldoError(`${variable} no es una lista JSON de textos válida.`, 503);
}

/** Ejecuta un binario de cliente de Postgres; la salida estándar va a `salida` si se pide. */
function correr(cmd: string[], args: string[], env: Record<string, string>, salida?: NodeJS.WritableStream): Promise<void> {
  const [bin, ...previos] = cmd;
  return new Promise((resolve, reject) => {
    const hijo = spawn(bin, [...previos, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", salida ? "pipe" : "ignore", "pipe"] });
    let err = "";
    hijo.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.length > 4000) err = err.slice(-4000);
    });
    if (salida && hijo.stdout) hijo.stdout.pipe(salida);
    hijo.on("error", (e) =>
      reject(new RespaldoError(`No se pudo ejecutar ${path.basename(bin)}: ${limpiar(e.message, env)}. ¿Está instalado el cliente de Postgres en el servidor del Admin?`, 500))
    );
    hijo.on("close", (code) =>
      code === 0 ? resolve() : reject(new RespaldoError(`${path.basename(bin)} terminó con error ${code}: ${limpiar(err, env)}`, 500))
    );
  });
}

export type Respaldo = {
  archivo: string;
  base: string;
  creado: string;
  bytes: number;
  sha256: string;
  por: string | null;
  fotos: ResumenFotos | null;
  fotos_nota: string | null;
};

async function huella(ruta: string): Promise<string> {
  const h = createHash("sha256");
  for await (const trozo of createReadStream(ruta)) h.update(trozo);
  return h.digest("hex");
}

let enCurso = false;

/** Hace la copia completa (formato custom de pg_dump, comprimido). No modifica la base. */
export async function crearRespaldo(por: string | null, opciones: { conFotos?: boolean } = {}): Promise<Respaldo> {
  const conFotos = opciones.conFotos !== false;
  const { base, env } = conexion();
  if (enCurso) throw new RespaldoError("Ya hay un respaldo en curso. Espera a que termine.", 409);
  enCurso = true;
  const dir = dirRespaldos();
  const ahora = new Date();
  const marca = ahora.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const archivo = `anura-${base.toLowerCase().replace(/[^a-z0-9_]/g, "_")}-${marca}.dump`;
  const parcial = path.join(dir, `${archivo}.parcial`);
  try {
    await mkdir(dir, { recursive: true });
    const destino = createWriteStream(parcial, { mode: 0o600 });
    const terminado = new Promise<void>((ok, ko) => {
      destino.on("finish", ok);
      destino.on("error", ko);
    });
    await correr(comando("PG_DUMP_BIN", "pg_dump"), ["--format=custom", "--no-password"], env, destino);
    await terminado;
    const { size } = await stat(parcial);
    const f = await open(parcial, "r");
    const buf = Buffer.alloc(5);
    await f.read(buf, 0, 5, 0).finally(() => f.close());
    const cabecera = buf.toString("latin1");
    if (size === 0 || cabecera !== "PGDMP") throw new RespaldoError("El archivo de respaldo salió vacío o dañado; no se guardó.", 500);
    const ruta = path.join(dir, archivo);
    await rename(parcial, ruta);
    let fotos: ResumenFotos | null = null;
    let fotos_nota: string | null = null;
    if (!conFotos) {
      fotos_nota = "Se pidió no copiar las fotos: esta copia solo trae la base.";
    } else if (fotosConfiguradas()) {
      try {
        fotos = await copiarFotos(`${ruta}.fotos`);
      } catch (err) {
        fotos_nota = err instanceof Error ? err.message : "No se pudieron copiar las fotos.";
        await rm(`${ruta}.fotos`, { recursive: true, force: true }).catch(() => {});
      }
    } else {
      fotos_nota = "MinIO no está configurado en el admin: la copia no incluye fotos.";
    }
    const r: Respaldo = { archivo, base, creado: ahora.toISOString(), bytes: size, sha256: await huella(ruta), por, fotos, fotos_nota };
    await writeFile(`${ruta}.json`, JSON.stringify(r, null, 2), { mode: 0o600 });
    await auditar(env, "respaldo.crear", base, { archivo, bytes: size, fotos, fotos_nota, por });
    return r;
  } catch (err) {
    await rm(parcial, { force: true }).catch(() => {});
    throw err;
  } finally {
    enCurso = false;
  }
}

export async function listarRespaldos(): Promise<{ base: string; permiteLimpiar: boolean; respaldos: Respaldo[] }> {
  const { base } = conexion();
  const dir = dirRespaldos();
  const respaldos: Respaldo[] = [];
  for (const nombre of await readdir(dir).catch(() => [] as string[])) {
    if (!NOMBRE_ARCHIVO.test(nombre)) continue;
    try {
      respaldos.push(JSON.parse(await readFile(path.join(dir, `${nombre}.json`), "utf8")) as Respaldo);
    } catch {
      /* copia sin ficha: no se ofrece */
    }
  }
  respaldos.sort((a, b) => b.creado.localeCompare(a.creado));
  return { base, permiteLimpiar: permiteLimpiar(), respaldos: respaldos.filter((r) => r.base === base) };
}

/** Ruta de una copia ya hecha, validando el nombre (nada de rutas) y la ficha. */
export async function rutaDeRespaldo(archivo: string): Promise<{ ruta: string; respaldo: Respaldo }> {
  if (!NOMBRE_ARCHIVO.test(archivo)) throw new RespaldoError("Ese respaldo no existe.", 404);
  const ruta = path.join(dirRespaldos(), archivo);
  try {
    const respaldo = JSON.parse(await readFile(`${ruta}.json`, "utf8")) as Respaldo;
    await stat(ruta);
    return { ruta, respaldo };
  } catch {
    throw new RespaldoError("Ese respaldo no existe.", 404);
  }
}

/** Script de vaciado: TRUNCATE de las tablas propias de todos los esquemas, sin las de extensiones (PostGIS). */
const SQL_LIMPIAR = `
DO $limpieza$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT format('%I.%I', n.nspname, c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE 'TRUNCATE TABLE ' || t || ' RESTART IDENTITY CASCADE';
  END LOOP;
END
$limpieza$;`;

/**
 * Vacía la base actual y deja la copia. Solo si: el servidor lo permite (BACKUP_ALLOW_CLEAN=1), la
 * copia existe, es de esta base y su huella sigue siendo la del momento del respaldo, y quien pide
 * escribió el nombre exacto de la base. Todo en una sola sentencia: o se vacía entera o no se toca.
 */
export async function limpiarBase(
  archivo: string,
  confirmacion: string,
  opciones: { borrarFotos?: boolean } = {},
): Promise<{ base: string; archivo: string; fotos: ResumenFotos | null; fotos_nota: string | null }> {
  const borrarFotos = opciones.borrarFotos !== false;
  const { base, env } = conexion();
  if (!permiteLimpiar()) {
    throw new RespaldoError("La limpieza está desactivada en este servidor (BACKUP_ALLOW_CLEAN). La copia se conserva y la base no se tocó.", 403);
  }
  if (confirmacion !== base) throw new RespaldoError(`Para limpiar escribe el nombre de la base: ${base}.`, 400);
  const { ruta, respaldo } = await rutaDeRespaldo(archivo);
  if (respaldo.base !== base) throw new RespaldoError("Esa copia es de otra base.", 409);
  if ((await huella(ruta)) !== respaldo.sha256) throw new RespaldoError("La copia cambió desde que se hizo (la huella no coincide). Haz un respaldo nuevo antes de limpiar.", 409);
  await correr(comando("PSQL_BIN", "psql"), ["--no-password", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--single-transaction", "--command", SQL_LIMPIAR], env);
  let fotos: ResumenFotos | null = null;
  let fotos_nota: string | null = null;
  if (!borrarFotos) {
    fotos_nota = "Pediste conservar las fotos: siguen en MinIO.";
  } else if (fotosConfiguradas()) {
    try {
      fotos = await vaciarFotos();
    } catch (err) {
      fotos_nota = err instanceof Error ? err.message : "La base se vació, pero las fotos no se pudieron borrar.";
    }
  } else {
    fotos_nota = "MinIO no está configurado: las fotos no se borraron.";
  }
  await auditar(env, "respaldo.limpiar", base, { archivo, fotos, fotos_nota });
  return { base, archivo, fotos, fotos_nota };
}

/** Anota la operación en audit.log. Si la tabla no acepta la fila, el respaldo igual queda hecho. */
async function auditar(env: Record<string, string>, action: string, base: string, metadata: object) {
  const acciones = new Set(["respaldo.crear", "respaldo.limpiar", "respaldo.recuperar", "respaldo.cargar", "respaldo.eliminar"]);
  if (!acciones.has(action)) return;
  const json = JSON.stringify(metadata).replace(/'/g, "''");
  const id = base.replace(/'/g, "");
  const sql = `INSERT INTO audit.log (action, target_type, target_id, metadata) VALUES ('${action}', 'base', '${id}', '${json}'::jsonb)`;
  try {
    await correr(comando("PSQL_BIN", "psql"), ["--no-password", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--command", sql], env);
  } catch (err) {
    console.error("[respaldo] auditoría:", err instanceof Error ? err.message : err);
  }
}

/**
 * Sustituye la base actual por una copia ya guardada, y vuelve a subir las fotos de esa copia.
 * Misma llave que limpiar: BACKUP_ALLOW_CLEAN=1 y el nombre exacto de la base.
 */
export async function recuperarBase(archivo: string, confirmacion: string, por: string | null) {
  const { base, env } = conexion();
  if (!permiteLimpiar()) {
    throw new RespaldoError("Recuperar está desactivado en este servidor (BACKUP_ALLOW_CLEAN). La base no se tocó.", 403);
  }
  if (confirmacion !== base) throw new RespaldoError(`Para recuperar escribe el nombre de la base: ${base}.`, 400);
  const { ruta, respaldo } = await rutaDeRespaldo(archivo);
  if ((await huella(ruta)) !== respaldo.sha256) throw new RespaldoError("La copia cambió desde que se hizo (la huella no coincide).", 409);
  if (enCurso) throw new RespaldoError("Ya hay un respaldo en curso. Espera a que termine.", 409);
  enCurso = true;
  try {
    await correr(comando("PG_RESTORE_BIN", "pg_restore"), ["--clean", "--if-exists", "--no-owner", "--no-privileges", "--exit-on-error", "--dbname", base, ruta], env);
    let fotos: ResumenFotos | null = null;
    let fotos_nota: string | null = null;
    if (fotosConfiguradas()) {
      try {
        fotos = await restaurarFotos(`${ruta}.fotos`);
      } catch (err) {
        fotos_nota = err instanceof Error ? err.message : "La base se recuperó, pero las fotos no.";
      }
    } else {
      fotos_nota = respaldo.fotos ? "MinIO no está configurado: las fotos de la copia no se subieron." : null;
    }
    await auditar(env, "respaldo.recuperar", base, { archivo, fotos, fotos_nota, por });
    return { base, archivo, fotos, fotos_nota };
  } finally {
    enCurso = false;
  }
}

/** Borra una copia guardada (dump, ficha y carpeta de fotos). No toca la base ni MinIO. */
export async function eliminarRespaldo(archivo: string, por: string | null): Promise<{ archivo: string }> {
  const { base, env } = conexion();
  const { ruta, respaldo } = await rutaDeRespaldo(archivo);
  if (enCurso) throw new RespaldoError("Hay un respaldo en curso. Espera a que termine.", 409);
  await rm(ruta, { force: true });
  await rm(`${ruta}.json`, { force: true });
  await rm(`${ruta}.fotos`, { recursive: true, force: true });
  await auditar(env, "respaldo.eliminar", base, { archivo, bytes: respaldo.bytes, por });
  return { archivo };
}

/** Guarda un dump subido (cabecera PGDMP) para poder descargarlo y recuperarlo después. */
export async function cargarDump(bytes: Buffer, por: string | null): Promise<Respaldo> {
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("latin1") !== "PGDMP") {
    throw new RespaldoError("Ese archivo no es un dump de Postgres (formato custom).", 400);
  }
  if (bytes.length > 512 * 1024 * 1024) throw new RespaldoError("El dump pasa de 512 MB. No se guardó.", 413);
  const { base, env } = conexion();
  const dir = dirRespaldos();
  await mkdir(dir, { recursive: true });
  const marca = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const archivo = `anura-${base.toLowerCase().replace(/[^a-z0-9_]/g, "_")}-${marca}.dump`;
  const ruta = path.join(dir, archivo);
  await writeFile(ruta, bytes, { mode: 0o600 });
  const r: Respaldo = {
    archivo, base, creado: new Date().toISOString(), bytes: bytes.length, sha256: await huella(ruta), por,
    fotos: null, fotos_nota: "Dump cargado a mano: no trae carpeta de fotos.",
  };
  await writeFile(`${ruta}.json`, JSON.stringify(r, null, 2), { mode: 0o600 });
  await auditar(env, "respaldo.cargar", base, { archivo, bytes: bytes.length, por });
  return r;
}

/**
 * Operar sobre la base entera es de administrador técnico: super usuario o permiso «Debug técnico»
 * (el que la plantilla de herpetólogo no trae). Devuelve el nombre de la cuenta, o la respuesta de error.
 */
export async function requireAdminTecnico(req: NextRequest): Promise<{ nombre: string } | NextResponse> {
  const authorization = req.headers.get("authorization");
  if (!authorization) return NextResponse.json({ message: "Inicia sesión en el panel" }, { status: 401 });
  const base = process.env.AUTH_SERVICE_URL || "http://localhost:3001";
  try {
    const res = await fetch(`${base}/api/panel/me`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (res.status === 401) return NextResponse.json({ message: "La sesión ya no es válida" }, { status: 401 });
    if (res.status === 403) return NextResponse.json({ message: "Esta cuenta no está en el panel administrativo" }, { status: 403 });
    if (!res.ok) return NextResponse.json({ message: "No se pudo verificar la cuenta" }, { status: 502 });
    const { account } = (await res.json()) as { account?: { name?: string; email?: string; isSuperAdmin?: boolean; permissions?: Record<string, boolean> } };
    if (!account || !(account.isSuperAdmin || account.permissions?.debugTecnico)) {
      return NextResponse.json({ message: "Respaldar la base necesita el permiso Debug técnico." }, { status: 403 });
    }
    return { nombre: account.name || account.email || "cuenta del panel" };
  } catch {
    return NextResponse.json({ message: "No se pudo verificar la cuenta con el servicio de cuentas" }, { status: 502 });
  }
}

export function respuestaDeError(err: unknown): NextResponse {
  if (err instanceof RespaldoError) return NextResponse.json({ message: err.message }, { status: err.status });
  return NextResponse.json({ message: "No se pudo completar la operación de respaldo." }, { status: 500 });
}
