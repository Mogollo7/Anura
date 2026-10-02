# Admin público y avisos enriquecidos

## Admin en https://admin.juanlabs.me

El panel (`admin-web`, contenedor `anura_admin`) ya no depende de `localhost:3010`.

Lo que está hecho en el repo:

- **Sin pasar por NPM**: `npm:80` es de la web pública (`anura.juanlabs.me`), así que el Admin tiene su propia puerta. El
  túnel de Cloudflare entrega `admin.juanlabs.me` directo a `http://admin-web:3000`: `anura_tunnel` y `anura_admin`
  están en la misma red de Docker (`anura_anura-net`), comprobado.
- **Admin** (`admin/next.config.ts`, `admin/public/robots.txt`): cabeceras de seguridad (HSTS, `frame-ancestors 'none'`,
  `nosniff`, sin referrer, permisos del navegador cerrados) y `Disallow: /`.
- **Rutas del Admin sin servicio detrás** (`/api/scraping/*`, `/api/system/health`): antes estaban abiertas (un proxy a
  iNaturalist/GBIF y el mapa interno de servicios). Ahora exigen una cuenta del panel (`lib/auth/require-panel.ts`, pregunta
  a auth-service con el mismo token).
- **Intentos de entrar** (`services/auth-service/src/middleware/rateLimit.js`): 8 fallos por cuenta+IP y 40 por IP cada
  10 min en `/api/auth/login` y `/api/auth/register` (`429` con `Retry-After`). Un éxito borra el contador de esa cuenta.
- **Web**: el botón «Modo administrativo» apunta a `ADMIN_PUBLIC_URL` (por defecto `https://admin.juanlabs.me`) y entra
  con el mismo `#token=` de siempre.

### Lo único que falta (se hace en Cloudflare, no desde el servidor)

Zero Trust → Networks → Tunnels → el túnel de ANURA → **Public Hostname** → Añadir:

| Campo | Valor |
|---|---|
| Subdomain / Domain | `admin` / `juanlabs.me` |
| Service | `HTTP` · `admin-web:3000` |

**No uses `npm:80`** (ese es de la web). Cloudflare crea solo el registro DNS. Hasta que se añada, `admin.juanlabs.me` no responde y el botón «Modo administrativo»
de la web llevará a una página que no carga. Para volver al panel local mientras tanto: `ADMIN_PUBLIC_URL=http://localhost:3010`
en `.env` y `.\scripts\up.ps1 -Build`.

Recomendado además (opcional, desde el mismo panel de Cloudflare): una regla de **Access** para `admin.juanlabs.me` que
pida el correo de quienes administran. Es una segunda puerta delante del login del panel.

## Avisos (notificaciones del Admin)

La app móvil **no cambia**: sigue leyendo `GET /api/notifications` (`title`, `body`). El envío ahora puede llevar, como un
correo: texto de hasta 4000 caracteres, hasta 5 botones con enlace y una imagen de hasta 2 MB.

- Si el aviso cabe en el teléfono (texto corto y nada más), se guarda exactamente igual que antes.
- Si trae más, el `body` del teléfono lleva un **resumen (≈300 caracteres) y el enlace** `https://anura.juanlabs.me/a/<token>`
  («Ver completo (imagen y 1 enlace): …»). Esa página es pública, sin sesión, con el token imposible de adivinar (128 bits).
- La imagen se guarda en Postgres (`notifications.avisos_media`, migración `phase25.sql`), no en MinIO.
- Se puede **elegir uno, varios o todos** los destinatarios, ver una **vista previa** exacta de lo que verá el teléfono antes
  de enviar y **retirar** un aviso (desaparece de la web y de la app; el enlace público deja de funcionar).
- Protecciones: el tipo de imagen se decide por sus bytes; solo enlaces `http(s)` sin usuario/contraseña; el HTML se
  escapa; CSP estricta en la página pública; antirrebote (mismo aviso en 60 s) y tope de 10 envíos cada 10 min por cuenta.
- Todo queda en `audit.log` (`aviso.send`, `aviso.retirado`).

Pruebas: `services/notification-service/test/aviso.test.js` y `services/auth-service/test/rateLimit.test.js`
(`node --test`). Ver también `docs/AUDITORIA_PAQUETES.md`.
