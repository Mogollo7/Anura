import { createReadStream } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import * as Minio from "minio";

/**
 * Fotos y archivos del paquete viven en MinIO, no en Postgres. El respaldo los copia al lado del
 * .dump; limpiar los borra; recuperar los vuelve a subir. Sin estas variables, la base se respalda
 * igual y las fotos se quedan donde están.
 */
export type ResumenFotos = { objetos: number; bytes: number; cubetas: string[] };

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

function listar(minio: Minio.Client, cubeta: string): Promise<{ name: string; size: number }[]> {
  return new Promise((resolve, reject) => {
    const out: { name: string; size: number }[] = [];
    const stream = minio.listObjectsV2(cubeta, "", true);
    stream.on("data", (o: { name?: string; size?: number }) => {
      if (o.name) out.push({ name: o.name, size: o.size || 0 });
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
  for (const cubeta of nombres) {
    for (const obj of await listar(minio, cubeta)) {
      const partes = nombreSeguro(obj.name);
      const destino = path.join(dir, cubeta, ...partes);
      await mkdir(path.dirname(destino), { recursive: true });
      await minio.fGetObject(cubeta, obj.name, destino);
      objetos += 1;
      bytes += obj.size;
    }
  }
  return { objetos, bytes, cubetas: nombres };
}

/** Borra los objetos. Las cubetas se quedan. */
export async function vaciarFotos(): Promise<ResumenFotos> {
  const minio = cliente();
  const nombres = cubetas();
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
  } catch {
    return out;
  }
  for (const ent of entradas) {
    const clave = rel ? `${rel}/${ent.name}` : ent.name;
    const archivo = path.join(raiz, ent.name);
    if (ent.isDirectory()) out.push(...(await archivosDe(archivo, clave)));
    else if (ent.isFile()) out.push({ clave, archivo, size: (await stat(archivo)).size });
  }
  return out;
}

export async function restaurarFotos(dir: string): Promise<ResumenFotos> {
  const vacio = await vaciarFotos();
  const minio = cliente();
  let objetos = 0;
  let bytes = 0;
  for (const cubeta of vacio.cubetas) {
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
  return { objetos, bytes, cubetas: vacio.cubetas };
}
