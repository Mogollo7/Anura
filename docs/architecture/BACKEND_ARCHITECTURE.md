---
title: "Arquitectura de Backend — Servicios Distribuidos"
proyecto: Anura
tipo: arquitectura
estado: vigente
supersede: "Second Brain/Brain/04 Desarrollo Técnico/API Backend.md, Second Brain/Brain/06 Proceso de Desarrollo de la App/Arquitectura de la Aplicación.md (server-side), docs/architecture/TEXT.TXT + DIAGRAMS.puml (Proyecto Sapito)"
---

# Arquitectura de Backend — Anura Server

## 0. Por qué este documento reemplaza a los anteriores

Existían dos fuentes de arquitectura para el servidor, ninguna vigente:

1. **`docs/architecture/TEXT.TXT` + `DIAGRAMS.puml`** — "Proyecto Sapito": un único servidor Flask con BioCLIP embebido. Es el prototipo original, no el sistema actual.
2. **`Second Brain/Brain/.../API Backend.md`** y **`Arquitectura de la Aplicación.md`** — marcadas explícitamente `estado: propuesta` / `propuesta-de-diseño`, "aún no es código existente". Proponían FastAPI + Supabase + Qdrant + inferencia en el servidor.

Ninguna refleja lo que hay: un **monorepo de microservicios Node.js/Express** (`services/*`) + un servicio Python/FastAPI solo para IA, con PostgreSQL propio (no Supabase), Redis, MinIO, Nginx Proxy Manager y un túnel Cloudflare — y una decisión posterior que invalida la premisa de inferencia-en-servidor: **la identificación corre on-device en la app Android** (ONNX + sqlite-vec, ver memoria `anura_android_sqlite_vec_integracion`). Este documento es la fuente de verdad a partir de ahora para el servidor; **no toca la app Android**.

## 1. Rol del servidor (alcance decidido)

El servidor **no** es un servidor de inferencia. Tiene tres trabajos, y deliberadamente ya no un cuarto:

1. **Identidad y social** — cuentas, seguir/ser seguido, perfiles públicos.
2. **Repositorio de observaciones** — CRUD, favoritos, feed, búsqueda, mapa comunitario.
3. **Distribución de paquetes** — sirve el modelo ONNX y los paquetes regionales `.sqlite-vec` que la app descarga (gestionados desde un panel admin).
4. ~~Inferencia~~ — **fuera de alcance**. `services/ai-service` (BioCLIP) queda en el repo pero desconectado del frontend activo, igual que `Camera.jsx` en el frontend. No se borra: puede reconectarse si el proyecto vuelve a necesitar evaluación server-side (p. ej. para batch reprocessing), pero no es parte del contrato actual.

Esto retoma la separación de responsabilidades de `API Backend.md` (una buena idea del documento viejo) pero sin la responsabilidad de inferencia, que ya no aplica.

### 1.1 Correspondencia con la visión completa de ANURA (app + servidor)

| Pieza de la visión | ¿Se cumple? | Dónde |
|---|---|---|
| Identificación 100% on-device (ONNX → embedding → k-NN/centroides → Open Set), servidor nunca la ejecuta | ✅ | §1 |
| Offline-first: identificar/consultar/guardar sin red | ✅ (no es responsabilidad del servidor romperlo) | §1, §7 |
| Servidor = datos, sync, distribución de paquetes, no identificación | ✅ | §1, §7, §8 |
| Auth opcional para identificar, necesaria solo para "compartir" | ✅ (el servidor nunca ve una identificación; auth solo aplica a follow/favoritos/perfil) | §1, §3 |
| PostgreSQL + **PostGIS** | ⚠️ **era un hueco, cerrado en esta revisión** | §2, §4 |
| Object Storage para imágenes/audio | ✅ MinIO | §2 |
| Package Manager (paquetes regionales + modelo) | ✅ | §8 |
| Superficies API: Auth, Observations, Species, Packages, Sync, Geo | ✅ todas mapeadas — Species sin servicio propio, ver nota en §3 | §3, §5, §7, §8 |

## 2. Stack real (no el propuesto)

| Capa | Elección real | Nota |
|---|---|---|
| Servicios de aplicación | **Node.js + Express**, 7 servicios independientes | `auth`, `observation`, `explorer`, `geo`, `thumbnail`, `notification`, `validation` |
| IA (fuera de alcance activo) | Python + FastAPI (`ai-service`) | Se mantiene en el repo, sin tráfico del frontend actual |
| Base de datos | **PostgreSQL self-hosted + extensión PostGIS**, un solo cluster, **schemas por dominio** (`auth`, `observations`, `species`, `geo`, `ai`, `notifications`), **aislados con roles/`GRANT` por servicio** (§2.1) | No Supabase, no una instancia física por servicio. `lat`/`lon` pasan de `DOUBLE PRECISION` sueltos a `geography(Point)` — necesario para bounding-box del mapa comunitario y para que la ofuscación geográfica (§4) use `ST_Buffer`/`ST_SnapToGrid` de verdad, no redondeo manual. |
| Cache / mensajería | **Redis** — cache **y** bus de eventos pub/sub entre servicios (§2.2) | Ya en `docker-compose.yml`, hoy sin ningún consumidor; pasa a ser el mecanismo de desacople real entre servicios |
| Archivos | **MinIO** (S3-compatible, self-hosted) | No Supabase Storage |
| Gateway | **Nginx Proxy Manager** | `gateway/` — hoy sin reglas de ruteo configuradas (`gateway/conf.d/` vacío) |
| Exposición externa | **Cloudflare Tunnel** (Zero Trust) | Ya en `docker-compose.yml`; sin puertos públicos expuestos — cumple RNF-018/RNF-023 del documento de requisitos |
| Vectores | **Ninguno en el servidor** | El espacio vectorial vive on-device (sqlite-vec regional); el servidor no necesita Qdrant/pgvector porque no compara embeddings |

### 2.1 Aislamiento real: un rol de Postgres por servicio

Hoy todos los servicios se conectan con las mismas credenciales de superusuario (`DATABASE_URL` compartida) y nada impide que `explorer-service` haga `SELECT` directo sobre `auth.users`. Eso no es una arquitectura distribuida, es un monolito con carpetas. El cambio:

```sql
-- Un rol por servicio, con acceso SOLO a su propio schema.
CREATE ROLE auth_service        LOGIN PASSWORD '...';
CREATE ROLE observation_service LOGIN PASSWORD '...';
CREATE ROLE explorer_service    LOGIN PASSWORD '...';
CREATE ROLE geo_service         LOGIN PASSWORD '...';
CREATE ROLE thumbnail_service   LOGIN PASSWORD '...';

GRANT ALL ON SCHEMA auth         TO auth_service;
GRANT ALL ON SCHEMA observations TO observation_service;
GRANT ALL ON SCHEMA species, geo TO explorer_service;   -- lectura de catálogo/geo que ya expone
GRANT ALL ON SCHEMA geo          TO geo_service;
-- explorer_service NO recibe grant sobre `auth` ni `observations`:
-- si necesita datos de usuario u observaciones, los pide por HTTP a
-- auth-service / observation-service, no los lee directo de la tabla.
```

Cada servicio pasa de usar `DATABASE_URL` (compartida) a su propia variable (`AUTH_DB_URL`, `EXPLORER_DB_URL`, ...) apuntando al mismo host de Postgres pero con su rol restringido. El costo es bajo (una instancia, no N), el beneficio es real: un bug o una inyección SQL en `explorer-service` no puede leer contraseñas de `auth.users` porque su rol no tiene permiso, ni a nivel de convención sino a nivel de motor de base de datos.

### 2.2 Desacople real: eventos por Redis pub/sub en vez de llamadas en cadena

Patrón a evitar: que `observation-service`, al crear una observación, llame síncronamente a `notification-service`, que a su vez llame a `explorer-service` para invalidar cache — una cadena de llamadas HTTP acopla la disponibilidad de los tres. En su lugar:

```
observation-service  → PUBLISH  observation:created   {observation_id, user_id}
notification-service → SUBSCRIBE observation:created  (genera notificación a seguidores)
explorer-service      → SUBSCRIBE observation:created  (invalida su cache de feed/stats)
```

Ningún publicador conoce ni espera a sus suscriptores. Si `notification-service` está caído, `observation-service` sigue funcionando y el evento queda pendiente de consumir cuando vuelva (con un stream de Redis, `XADD`/`XREADGROUP`, en vez de pub/sub puro, que si no hay nadie escuchando en el momento pierde el mensaje — preferible para no perder eventos mientras un servicio reinicia).

## 3. Mapa de servicios: responsabilidad y estado real

| Servicio | Puerto | Responsabilidad | Estado actual | Endpoints objetivo (Fase 2) |
|---|---|---|---|---|
| `auth-service` | 3001 | Identidad, sesión, perfil público, seguir/dejar de seguir | Login/registro reales; `/me`, `/profile`, `/public/:username`, `/follow` **no existen** | ver §5 |
| `observation-service` | 3002 | CRUD de observaciones + subida a MinIO | Todo stub (`501`) salvo el esqueleto de create | CRUD completo |
| `explorer-service` | 3005 | Feed, stats, búsqueda, favoritos, sugerencias, thumbnails | Solo placeholders (`/search`, `/stats`, `/rankings`) | ver §5 |
| `geo-service` | 3003 | Clima/altitud/bioma por coordenada | **Funcional** — el único servicio realmente completo hoy | Sin cambios |
| `thumbnail-service` | 3004 | Redimensionar imagen a WebP | Implementado pero no conectado (observation-service no lo invoca aún) | Conectar al flujo de create |
| `notification-service` | 3006 | Notificaciones in-app | Solo `/health` | Fuera de Fase 2 — placeholder consciente |
| `validation-service` | 3007 | Validación experta de observaciones | Solo `/health` | Se decide en Fase 3 si se pliega al panel admin |

`ai-service` no aparece en esta tabla a propósito: no forma parte del contrato activo del servidor (§1).

**Species, como superficie propia (no un servicio nuevo).** No hay ni va a haber un `species-service`: agregar un octavo servicio para una tabla que casi no escribe no se justifica. Lo que sí se formaliza es la separación de responsabilidad:
- **Lectura pública** (`GET /api/explorer/species`, ficha de especie, distribución) — la sirve `explorer-service`, con `GRANT` de solo lectura sobre el schema `species` (§2.1).
- **Escritura** — no ocurre por API. `species.taxonomy`/`species.distribution` se pueblan desde los scripts de `tools/catalog/` (fuera del runtime de los servicios), igual que hoy. Es una decisión, no un olvido: el catálogo taxonómico cambia por lotes curados (nueva especie validada, no una request de usuario), no por tráfico HTTP.

## 4. Modelo de datos — lo que ya existe y lo que falta

**Ya existe** (`infrastructure/postgres/init.sql`): `auth.users` (con `role`, ya soporta roles), `auth.user_permissions` (`can_validate`, `can_moderate` — sin usar todavía), `auth.oauth_accounts`, `auth.user_sessions`, `observations.observations` (con `status` genérico), `ai.predictions`, `ai.model_versions`, `geo.*`, `notifications.notifications`, `species.taxonomy` + `species.distribution`.

**Falta** (idea rescatada de `API Backend.md`, adaptada a Postgres plano en vez de Supabase):

```sql
-- extensión geoespacial (hoy no habilitada) — necesaria para bbox del mapa
-- comunitario y para que la ofuscación de coordenadas (más abajo) sea real
CREATE EXTENSION IF NOT EXISTS postgis;

-- observations.observations.lat/lon pasan de dos columnas float sueltas a
-- un punto geográfico real, indexado espacialmente
ALTER TABLE observations.observations ADD COLUMN location geography(Point, 4326);
UPDATE observations.observations SET location = ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography
  WHERE lat IS NOT NULL AND lon IS NOT NULL;
CREATE INDEX obs_location_gix ON observations.observations USING GIST (location);
-- lat/lon se mantienen (no se borran) para no romper lo que ya los lee;
-- `location` es la fuente de verdad para bbox/distancia/ofuscación nuevas.

-- auth: relación social, hoy inexistente
CREATE TABLE auth.follows (
  follower_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  followee_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, followee_id)
);

-- observations: favoritos, hoy inexistente
CREATE TABLE observations.favorites (
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  observation_id UUID REFERENCES observations.observations(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, observation_id)
);

-- observations: máquina de estados real, en vez del `status` de texto libre actual
-- (idea de "Pipeline del Sistema.md", adaptada: sin el estado ligado a inferencia)
-- valores: draft | synced | in_review | validated | rejected
ALTER TABLE observations.observations
  ADD CONSTRAINT observations_status_check
  CHECK (status IN ('draft','synced','in_review','validated','rejected'));

-- nuevo schema: distribución de paquetes/modelo (Fase 3b)
CREATE SCHEMA IF NOT EXISTS packages;
CREATE TABLE packages.regional_packages (
  id            SERIAL PRIMARY KEY,
  region_id     TEXT NOT NULL,          -- p.ej. "antioquia"
  version       INT NOT NULL,
  storage_key   TEXT NOT NULL,          -- ruta en MinIO
  sha256        TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  is_published  BOOLEAN NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (region_id, version)
);
-- ai.model_versions ya existe y sirve para el modelo ONNX: agregar una columna
-- `target` ('server' | 'mobile-onnx') para no mezclarlo con versiones de un
-- futuro modelo server-side.
ALTER TABLE ai.model_versions ADD COLUMN target TEXT NOT NULL DEFAULT 'mobile-onnx';

-- nuevo schema: auditoría (RNF-025 del documento de requisitos)
CREATE SCHEMA IF NOT EXISTS audit;
CREATE TABLE audit.log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id),
  action      TEXT NOT NULL,            -- 'observation.delete', 'user.role_change', ...
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Regla de ofuscación geográfica** (rescatada de `API Backend.md`, RNF-013/RNF-024 del documento de requisitos): las coordenadas de observaciones de especies con `iucn_status` en `CR`/`EN`/`VU` se guardan exactas en `location` (arriba), pero **la serialización pública** (lo que devuelve `explorer-service` a un usuario sin permiso elevado) aplica `ST_SnapToGrid(location::geometry, 0.02)` (grilla de ~2 km) antes de responder. Es una regla de autorización en la capa de lectura — la fila real nunca se toca — y con PostGIS es una función del motor, no aritmética manual propensa a errores de proyección.

## 5. Endpoints objetivo (Fase 2 — sin cambios respecto al plan previo, consolidados aquí)

```
auth-service
  GET  /api/auth/me
  PUT  /api/auth/profile
  GET  /api/auth/public/:username
  POST /api/auth/follow/:username
  GET  /api/auth/follow/:username/status

observation-service
  GET    /api/observations
  POST   /api/observations
  GET    /api/observations/:id
  PUT    /api/observations/:id
  DELETE /api/observations/:id

explorer-service
  GET  /api/explorer/feed
  GET  /api/explorer/stats
  GET  /api/explorer/species
  GET  /api/explorer/observers[/by-species]
  GET  /api/explorer/favorites[/feed/user/:username]
  POST /api/explorer/favorites/:id
  GET  /api/explorer/observation/:id
  GET  /api/explorer/search
  GET  /api/explorer/suggest
  GET  /api/explorer/thumbnail/:size/:filename
```

## 6. Seguridad — hueco real a cerrar + ideas rescatadas

- **Hueco real, alta prioridad**: `POST /api/auth/register` acepta `role` del body del cliente sin validar → escalación de privilegios. Se corrige en Fase 2: `role` siempre `'user'` en registro; el cambio de rol es una acción admin explícita, auditada (`audit.log`).
- **Hueco real**: 5 archivos usan `'fallback_secret'` como JWT secret por defecto. Se corrige: si `JWT_SECRET` no está seteado, el servicio falla al arrancar (no un secreto adivinable en producción).
- **Rescatado del documento de requisitos** (RNF-023): 2FA (TOTP) para el rol `admin` — no existe hoy, se documenta como pendiente de Fase 3 (panel admin), no se implementa en Fase 2.
- **Rescatado**: rate limiting en endpoints costosos (`/favorites/:id`, `/search`, `/thumbnail/*`) — pendiente, no bloqueante para Fase 2.
- Hashing de contraseñas: ya usa `bcryptjs` (adecuado); no se fuerza migración a Argon2 salvo pedido explícito.

## 7. Sincronización móvil — contrato reservado, no implementado aún

`API Backend.md` proponía un endpoint de sync idempotente para cuando el móvil, tras capturar offline, sube observaciones pendientes. La idea es correcta independientemente del stack; se reserva el contrato para cuando la app lo necesite (no se construye en Fase 2 salvo pedido explícito):

```
POST /api/observations/sync
  { device_id, last_sync_at, observations: [{ client_uuid, ... }] }
  → { accepted: [...], conflicts: [...], new_sync_marker }
```

Reglas ya decididas en el documento original y que siguen siendo válidas: **idempotencia por UUID generado en el dispositivo** (reintentos en campo con red intermitente no duplican), **el servidor gana en metadatos de validación experta, el dispositivo gana en datos de campo**, **rechazo explícito y legible** si el paquete/modelo del dispositivo quedó obsoleto (nunca fallar en silencio).

## 8. Distribución de paquetes/modelo (Fase 3b, formalizada aquí)

```
GET /api/packages/manifest                    → versión vigente por región + hash
GET /api/packages/:regionId/download
GET /api/model/onnx/manifest
GET /api/model/onnx/download
```

Todos de solo lectura para el móvil; la gestión (publicar/despublicar, subir nueva versión) vive exclusivamente en el panel admin de Fase 3, sobre `packages.regional_packages` y `ai.model_versions` (§4), usando MinIO como storage — mismo bucket que ya existe, sin infraestructura nueva.

## 9. Infraestructura — qué se confirma y qué cambia

`docker-compose.yml` ya implementa correctamente RNF-017/018/037/038 (Docker, Cloudflare Zero Trust sin puertos públicos, TLS vía el túnel, Nginx Proxy Manager como gateway) — eso se confirma, no se rediseña.

Lo que sí cambia con este documento, y es lo que hace la arquitectura genuinamente distribuida en vez de "microservicios de nombre":

1. **Roles de Postgres por servicio** (§2.1) — reemplaza el `DATABASE_URL` único compartido por una variable de conexión por servicio, cada una con un rol restringido a su schema.
2. **Redis pasa de "declarado pero sin uso" a bus de eventos** (§2.2) — `observation:created` como primer evento real, consumido por `notification-service` y `explorer-service`.
3. `gateway/conf.d/` está vacío — hay que escribir las reglas de proxy host-por-servicio para que el gateway realmente rutee.
4. Backups automáticos de Postgres (RNF-010/027) no están configurados todavía.

## 10. Qué queda explícitamente sin decidir

- [ ] Si `validation-service` se pliega al panel admin (Fase 3) o queda como servicio propio.
- [ ] Si/cuándo se implementa el endpoint de sync (§7) — depende de si la app Android termina necesitando subir observaciones al servidor comunitario, o si eso queda fuera del alcance de la app también.
- [ ] Reglas de retención de imágenes originales en MinIO (peso/privacidad).
- [ ] Si el bus de eventos (§2.2) usa Redis Streams (recomendado, no pierde eventos si un consumidor está caído) o pub/sub puro (más simple, pero un servicio caído pierde el evento) — se decide al implementar, no cambia el diseño general.
