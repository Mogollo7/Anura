import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import * as Minio from "minio";

/**
 * Fotos y archivos del paquete viven en MinIO, no en Postgres. El respaldo los copia al lado del
 * .dump; limpiar los borra; recuperar los vuelve a subir. Sin estas variables, la base se respalda
 * igual y las fotos se quedan donde están.
 */
export type ResumenFotos = { objetos: number; bytes: number; cubetas: string[]; manifiesto_sha256?: string };
type ArchivoManifiesto = { clave: string; size: number; sha256: string; etag: string | null };
type ManifiestoFotos = { version: 1; archivos: ArchivoManifiesto[] };

async function sha256Archivo(ruta: string) {
  const hash = createHash("sha256");
  for await (const bloque of createReadStream(ruta)) hash.update(bloque);
  return hash.digest("hex");
}

const cubetas = () =>
  (process.env.MINIO_BUCKETS || "anura-images,anura-dataset")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const fotosConfiguradas = () =>
  Boolean(process.env.MINIO_ENDPOINT && process.env.MINIO_ROOT_USER && process.env.MINIO_ROOT_PASSWORD);

function cliente() {
  return new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT || "minio",
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === "1",
    accessKey: process.env.MINIO_ROOT_USER || "",
    secretKey: process.env.MINIO_ROOT_PASSWORD || "",
  });
}

function nombreSeguro(nombre: string) {
  const partes = nombre.split("/").filter(Boolean);
  if (!partes.length || partes.some((p) => p === "." || p === "..")) {
    throw new Error("Hay un archivo de foto con un nombre que no se puede guardar.");
  }
  return partes;
}

function listar(minio: Minio.Client, cubeta: string): Promise<{ name: string; size: number; etag?: string }[]> {
  return new Promise((resolve, reject) => {
    const out: { name: string; size: number; etag?: string }[] = [];
    const stream = minio.listObjectsV2(cubeta, "", true);
    stream.on("data", (o: { name?: string; size?: number; etag?: string }) => {
      if (o.name) out.push({ name: o.name, size: o.size || 0, etag: o.etag });
    });
    stream.on("error", (err: Error & { code?: string }) => {
      if (err.code === "NoSuchBucket") resolve([]);
      else reject(err);
    });
    stream.on("end", () => resolve(out));
  });
}

/** Copia cada objeto a disco, junto al dump. */
export async function copiarFotos(dir: string): Promise<ResumenFotos> {
  const minio = cliente();
  const nombres = cubetas();
  let objetos = 0;
  let bytes = 0;
  const inventario: ArchivoManifiesto[] = [];
  await mkdir(dir, { recursive: true });
  for (const cubeta of nombres) {
    for (const obj of await listar(minio, cubeta)) {
      const partes = nombreSeguro(obj.name);
      const destino = path.join(dir, cubeta, ...partes);
      await mkdir(path.dirname(destino), { recursive: true });
      await minio.fGetObject(cubeta, obj.name, destino);
      const copia = await stat(destino);
      if (copia.size !== obj.size) throw new Error(`La copia de ${cubeta}/${obj.name} quedó incompleta.`);
      const info = await minio.statObject(cubeta, obj.name);
      if (obj.etag && info.etag !== obj.etag) throw new Error(`El objeto ${cubeta}/${obj.name} cambió mientras se copiaba.`);
      inventario.push({ clave: `${cubeta}/${obj.name}`, size: copia.size, sha256: await sha256Archivo(destino), etag: info.etag ?? null });
      objetos += 1;
      bytes += copia.size;
    }
  }
  const manifiesto = JSON.stringify({ version: 1, archivos: inventario } satisfies ManifiestoFotos);
  await writeFile(`${dir}.manifest.json`, manifiesto, { mode: 0o600 });
  return { objetos, bytes, cubetas: nombres, manifiesto_sha256: createHash("sha256").update(manifiesto).digest("hex") };
}

async function leerManifiestoFotos(dir: string, esperado: ResumenFotos): Promise<ManifiestoFotos | null> {
  if (!esperado.manifiesto_sha256) return null;
  let texto: string;
  try {
    texto = await readFile(`${dir}.manifest.json`, "utf8");
  } catch {
    throw new Error("Falta el manifiesto de integridad de las fotos.");
  }
  if (createHash("sha256").update(texto).digest("hex") !== esperado.manifiesto_sha256) {
    throw new Error("El manifiesto de las fotos está dañado.");
  }
  let manifiesto: ManifiestoFotos;
  try {
    manifiesto = JSON.parse(texto) as ManifiestoFotos;
  } catch {
    throw new Error("El manifiesto de las fotos no se puede leer.");
  }
  if (manifiesto.version !== 1 || !Array.isArray(manifiesto.archivos)) {
    throw new Error("La versión del manifiesto de fotos no es válida.");
  }
  return manifiesto;
}

/** Verifica que el snapshot local exista y coincida con el inventario guardado en la ficha. */
export async function verificarCopiaFotos(dir: string, esperado: ResumenFotos) {
  if (!Number.isInteger(esperado.objetos) || esperado.objetos < 0 || !Number.isFinite(esperado.bytes) || esperado.bytes < 0) {
    throw new Error("El inventario de fotos de la copia no es válido.");
  }
  if (!Array.isArray(esperado.cubetas) || esperado.cubetas.some((c) => {
    try {
      const partes = nombreSeguro(c);
      return partes.length !== 1 || partes[0] !== c;
    } catch {
      return true;
    }
  })) throw new Error("La copia contiene nombres de cubeta no válidos.");

  try {
    const raiz = await stat(dir);
    if (!raiz.isDirectory()) throw new Error("La carpeta de fotos de la copia no es válida.");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT" && esperado.objetos === 0 && esperado.bytes === 0 && !esperado.manifiesto_sha256) return [];
    throw new Error("No se encuentra el snapshot de fotos de esta copia.");
  }

  const archivos = await archivosDe(dir);
  const permitidas = new Set(esperado.cubetas);
  let bytes = 0;
  for (const archivo of archivos) {
    const partes = nombreSeguro(archivo.clave);
    if (partes.length < 2 || !permitidas.has(partes[0])) {
      throw new Error("El snapshot contiene archivos fuera de las cubetas respaldadas.");
    }
    bytes += archivo.size;
  }
  if (archivos.length !== esperado.objetos || bytes !== esperado.bytes) {
    throw new Error("El snapshot de fotos está incompleto o cambió desde que se hizo la copia.");
  }
  const manifiesto = await leerManifiestoFotos(dir, esperado);
  if (manifiesto) {
    if (manifiesto.archivos.length !== archivos.length) throw new Error("El manifiesto no coincide con el número de fotos copiadas.");
    const locales = new Map(archivos.map((a) => [a.clave, a]));
    const vistas = new Set<string>();
    for (const objeto of manifiesto.archivos) {
      nombreSeguro(objeto.clave);
      if (vistas.has(objeto.clave)) throw new Error("El manifiesto contiene una foto repetida.");
      vistas.add(objeto.clave);
      const local = locales.get(objeto.clave);
      if (!local || local.size !== objeto.size || await sha256Archivo(local.archivo) !== objeto.sha256) {
        throw new Error(`El archivo ${objeto.clave} no coincide con el respaldo.`);
      }
    }
  }
  return archivos;
}

/** Evita borrar objetos nuevos o distintos que aparecieron en MinIO después del respaldo. */
export async function verificarFotosRespaldadas(dir: string, esperado: ResumenFotos) {
  const archivos = await verificarCopiaFotos(dir, esperado);
  const manifiesto = await leerManifiestoFotos(dir, esperado);
  const copia = new Map(archivos.map((a) => [a.clave, { size: a.size, etag: null as string | null }]));
  if (manifiesto) for (const objeto of manifiesto.archivos) copia.set(objeto.clave, { size: objeto.size, etag: objeto.etag });
  const minio = cliente();
  for (const cubeta of cubetas()) {
    for (const objeto of await listar(minio, cubeta)) {
      const respaldo = copia.get(`${cubeta}/${objeto.name}`);
      if (!respaldo || respaldo.size !== objeto.size) {
        throw new Error("MinIO cambió desde el respaldo. Haz una copia nueva antes de limpiar para no perder archivos.");
      }
      if (respaldo.etag) {
        const etag = objeto.etag ?? (await minio.statObject(cubeta, objeto.name)).etag;
        if (etag !== respaldo.etag) throw new Error("MinIO cambió desde el respaldo. Haz una copia nueva antes de limpiar para no perder archivos.");
      }
    }
  }
}

/** Borra los objetos. Las cubetas se quedan. */
export async function vaciarFotos(cubetasAEvacuar = cubetas()): Promise<ResumenFotos> {
  const minio = cliente();
  const nombres = cubetasAEvacuar;
  let objetos = 0;
  let bytes = 0;
  for (const cubeta of nombres) {
    const objs = await listar(minio, cubeta);
    for (const obj of objs) {
      await minio.removeObject(cubeta, obj.name);
      objetos += 1;
      bytes += obj.size;
    }
  }
  return { objetos, bytes, cubetas: nombres };
}

/** Vuelve a subir lo que se copió junto al dump. Primero vacía, para no dejar fotos de más. */
async function archivosDe(raiz: string, rel = ""): Promise<{ clave: string; archivo: string; size: number }[]> {
  const out: { clave: string; archivo: string; size: number }[] = [];
  let entradas;
  try {
    entradas = await readdir(raiz, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw err;
  }
  for (const ent of entradas) {
    const clave = rel ? `${rel}/${ent.name}` : ent.name;
    const archivo = path.join(raiz, ent.name);
    if (ent.isDirectory()) out.push(...(await archivosDe(archivo, clave)));
    else if (ent.isFile()) out.push({ clave, archivo, size: (await stat(archivo)).size });
  }
  return out;
}

export async function restaurarFotos(dir: string, esperado: ResumenFotos): Promise<ResumenFotos> {
  await verificarCopiaFotos(dir, esperado);
  const nombres = [...new Set([...cubetas(), ...esperado.cubetas])];
  await vaciarFotos(nombres);
  const minio = cliente();
  let objetos = 0;
  let bytes = 0;
  for (const cubeta of esperado.cubetas) {
    const lista = await archivosDe(path.join(dir, cubeta));
    if (!lista.length) continue;
    if (!(await minio.bucketExists(cubeta))) await minio.makeBucket(cubeta);
    for (const item of lista) {
      const partes = nombreSeguro(item.clave);
      await minio.putObject(cubeta, partes.join("/"), createReadStream(item.archivo), item.size);
      objetos += 1;
      bytes += item.size;
    }
  }
  return { objetos, bytes, cubetas: esperado.cubetas };
}
