/**
 * Copia al servicio los artefactos que el teléfono ya sabe leer:
 * el sqlite de identificación de Antioquia y el catálogo JSON de cada subregión.
 * No inventa un formato nuevo.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const androidSqlite = 'D:/Anura/anura-android/app/src/main/assets/packages/antioquia/package.sqlite';
const subregionesDir = 'D:/Anura/COLOMBIA_ANURA/ANTIOQUIA/SUBREGIONS';
const outRoot = new URL('../paquetes/', import.meta.url);

const ORDEN = [
  ['VALLE_DE_ABURRA', 'Valle de Aburrá'],
  ['ORIENTE', 'Oriente'],
  ['SUROESTE', 'Suroeste'],
  ['OCCIDENTE', 'Occidente'],
  ['NORTE', 'Norte'],
  ['NORDESTE', 'Nordeste'],
  ['MAGDALENA_MEDIO', 'Magdalena Medio'],
  ['BAJO_CAUCA', 'Bajo Cauca'],
  ['URABA', 'Urabá'],
];

const sqliteRel = 'antioquia/package.sqlite';
const sqliteAbs = new URL(sqliteRel, outRoot);
mkdirSync(dirname(sqliteAbs.pathname.replace(/^\/([A-Z]:)/, '$1')), { recursive: true });
copyFileSync(androidSqlite, fileUrlToPath(sqliteAbs));

const hijos = ORDEN.map(([clave, nombre]) => {
  const src = join(subregionesDir, clave, 'subregion.json');
  const data = JSON.parse(readFileSync(src, 'utf8'));
  const rel = `antioquia/subregiones/${clave}.json`;
  const dest = new URL(rel, outRoot);
  mkdirSync(dirname(fileUrlToPath(dest)), { recursive: true });
  copyFileSync(src, fileUrlToPath(dest));
  return {
    id: `ANTIOQUIA.${clave}`,
    nivel: 'subregion',
    nombre,
    version: data.generated_on,
    especies: data.species_observed,
    formato: 'json',
    archivo: rel,
    nota: 'Catálogo de especies de la subregión. No reemplaza el paquete de identificación del departamento.',
  };
});

const indice = {
  paises: [
    {
      id: 'colombia',
      nivel: 'pais',
      nombre: 'Colombia',
      nota: 'Bajar el país baja los paquetes de sus departamentos.',
      hijos: [
        {
          id: 'ANTIOQUIA',
          nivel: 'departamento',
          nombre: 'Antioquia',
          version: '1.1.0',
          especies: 30,
          formato: 'sqlite',
          archivo: sqliteRel,
          nota: 'Paquete de identificación (SQLite). Bajar el departamento completo incluye sus subregiones.',
          hijos,
        },
      ],
    },
  ],
};

writeFileSync(new URL('indice.json', outRoot), `${JSON.stringify(indice, null, 2)}\n`);
console.log('indice listo', hijos.length, 'subregiones');

function fileUrlToPath(url) {
  let p = decodeURIComponent(url.pathname);
  if (/^\/[A-Z]:/i.test(p)) p = p.slice(1);
  return p;
}
