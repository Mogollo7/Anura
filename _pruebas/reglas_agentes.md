# ANURA — reglas comunes para los agentes de la fase 2 ("quitar lo simulado")

## Objetivo global
El panel admin (Next.js, `D:\server\Anura\admin`) muestra un banner (`admin/src/components/layout/mock-banner.tsx`)
con lo que todavía se simula en el navegador. La meta es que TODO salga del servidor (Postgres + servicios Node en
`D:\server\Anura\services\*`) para poder borrar el banner. Únicas excepciones aceptadas por el usuario:
- C3 (sincronización de observaciones/rechazos basada en BioCLIP en el servidor): no se toca.
- Audio ID / Sonidos nocturnos en Android: se queda como demo marcada.
Después de todo, el usuario borrará todos los datos (dejando solo el super usuario) y reconstruirá especie → paquete →
observaciones desde el admin. Por eso: **nada de datos sembrados, semillas mágicas, listas hardcodeadas de especies,
valores inventados ni "fallbacks" que finjan datos**. Una tabla vacía debe verse como un estado vacío honesto que dice
qué hacer ("Aún no hay … Para empezar, …").

## Lo que NO debes hacer
- No despliegues, no reconstruyas contenedores, no arranques ni toques los contenedores de producción (`anura_*`,
  base `anura_postgres`). Producción está apagada ahora mismo; déjala así.
- No hagas `git commit`, `git stash`, `git checkout -- …`, ni reviertas cambios que no hiciste. El coordinador commitea.
- No edites `admin/src/components/layout/mock-banner.tsx` (lo actualiza el coordinador con tu reporte).
- Otros agentes trabajan EN PARALELO en el mismo árbol. Archivos compartidos (`services/dataset-service/src/index.js`,
  `admin/src/lib/dataset/dataset-client.ts`, `admin/src/lib/app-data/app-client.ts`, `admin/src/config/nav.ts`,
  `infrastructure/postgres/03-roles.sh`, `docker-compose.server.yml`, `admin/src/lib/auth/panel-accounts.ts`): relee
  justo antes de editar, haz ediciones pequeñas y localizadas (añadir, no reescribir), y pon tu lógica nueva en
  módulos propios (p. ej. `services/dataset-service/src/<tema>.js`, `admin/src/lib/<tema>/…`).
  Si un Edit falla porque el archivo cambió, vuelve a leerlo y reintenta; nunca sobrescribas el archivo entero.

## Base de datos de prueba (desechable)
- Contenedor `anura_test_pg` (imagen de producción PostGIS+pgvector) en `127.0.0.1:55432`, usuario `postgres`,
  clave `prueba`. Crea TU propia base: `sh D:/server/Anura/_pruebas/bd_prueba.sh <tu_bd>`
  (crea contenedor/base si faltan y aplica `init.sql` + `03-roles.sh` con todas las phaseN.sql). Vuelve a correrlo
  después de añadir tu migración: todas son idempotentes. `phase12` ya siembra Antioquia y sus 9 subregiones.
- Tus fixtures (especies, fotos, etc.) créalos en TU base desde tus scripts de prueba en el scratchpad.
- Migraciones: `infrastructure/postgres/phaseN.sql` idempotentes (`IF NOT EXISTS`, `ON CONFLICT`, `DO $$`),
  registradas en `03-roles.sh` (bloque `echo "aplicando phaseN.sql"` + `psql -v ON_ERROR_STOP=1 -f /sql/phaseN.sql`,
  en orden numérico, conservar finales de línea LF) y montadas en `docker-compose.server.yml` (servicio db-migrate,
  junto a las otras `phaseN.sql`). Usa SOLO el número que te asignaron. `ALTER DEFAULT PRIVILEGES` ya da el esquema
  `dataset` a `dataset_service`; para otros esquemas añade los GRANT en tu phase.

## Convenciones del código (imítalas)
- dataset-service (Express, CommonJS, identificadores en español): rutas en `src/index.js` con
  `requirePanelAction('<permiso>')` (deja `req.panelAccount` y `req.userId`), errores con `falla(msg, status)`,
  auditoría con `src/audit.js` (`registrar(db, userId, action, targetType, targetId, metadata)` / `auditorDe`).
  Ejemplo reciente y completo: `src/etiquetas.js` + sus rutas (bloque 1). Pruebas: script node en el scratchpad
  contra tu base (mira `scratchpad/prueba_etiquetas.js`).
- Admin: cliente en `admin/src/lib/dataset/dataset-client.ts` (y `lib/app-data/app-client.ts` para la app móvil);
  sesión `usePanelSession()` con `session.can('<permiso>')`; permisos en `admin/src/lib/auth/panel-accounts.ts`;
  componentes UI en `admin/src/components/ui/*` (Card, Badge, Button, Field/Input/Select, DataState…).
  Ejemplo reciente: `components/curation/morfos-card.tsx`, `components/curation/server-photos-card.tsx`.
  Reglas del dataset en `admin/src/lib/dataset/reglas.ts`.
- Cuando un módulo de `admin/src/lib/mock/*` (o `lib/*/sim-*.ts`, stores en localStorage) se quede sin consumidores,
  bórralo. Busca consumidores con grep antes de borrar.
- Textos (ux-writing): español neutro, frases cortas, verbo primero en botones, errores que dicen qué pasó y qué hacer,
  estados vacíos que guían. Nada de "mock", "demo", "simulado" en la UI final. Diseño: reutiliza los componentes y
  tokens existentes; sin lógica duplicada (si dos pantallas calculan lo mismo, extrae una función).

## Verificación mínima antes de reportar
- `cd D:/server/Anura/admin && npx tsc --noEmit -p .` limpio (un error en `.next/types/validator.ts` por
  `paquetes/[id]` es residuo viejo; ignóralo).
- Backend: tu script de pruebas pasa contra tu base.
- Si pruebas la UI: arranca TU propio entorno copiando `scratchpad/entorno_prueba.js` a `scratchpad/entorno_<tuyo>.js`
  con TUS puertos (auth stub, dataset-service, `next dev -p <puerto>`) y `NEXT_DIST_DIR=.next-<tuyo>`; añade una
  entrada `anura-admin-<tuyo>` a `D:\Anura\.claude\launch.json` y úsala con preview_start. JWT falso: en localStorage
  `anura-admin:panel-jwt:v1` = `<b64url({alg:'HS256',typ:'JWT'})>.<b64url({id:'d81f2281-6086-435e-9de6-603f766fdf5e'})>.firma`
  (inserta ese usuario en `auth.users` de tu base con `username` y `email`). Detén tu servidor al terminar.
- Android (solo si lo tocas): `cd D:/Anura/anura-android && ./gradlew :app:compileDebugKotlin` (gradle puede
  esperar el lock de otro agente; es normal).

## Reporte final (breve, en español)
1. Qué quedó real y cómo lo verificaste. 2. Archivos creados/editados/borrados (rutas). 3. Migración y endpoints nuevos.
4. Lo que sigue simulado o quedó pendiente y por qué. 5. Texto sugerido para quitar tu parte del banner.
