# Guía de Despliegue en Servidor Linux (Cloud / VPS) y Protección de Puertos

Esta guía explica cómo desplegar **ANURA** en un servidor Linux (Ubuntu/Debian, Hostinger VPS, AWS, etc.), cómo funciona la protección de puertos y qué valores debes editar manualmente.

---

## 1. Arquitectura de Red y Protección de Puertos

Todos los puertos sensibles y paneles administrativos han sido asegurados en `docker-compose.server.yml` vinculándolos exclusivamente a `127.0.0.1` (loopback interno) para que **nunca queden expuestos a internet (0.0.0.0)** ante escaneos de puertos en tu IP pública.

### Matriz de Exposición de Puertos

| Servicio | Puerto Interno | Enlace Host | Expuesto a Internet (0.0.0.0) | Acceso Permitido |
|---|---|---|:---:|---|
| **Web Pública (NPM)** | 80 / 443 | `80:80`, `443:443` | Sí (o solo túnel) | Tráfico público web y llamadas API |
| **Panel de Nginx Proxy Manager** | 81 | `127.0.0.1:81:81` | ❌ **BLOQUEADO** | Solo localhost del servidor o vía Túnel SSH |
| **pgAdmin 4** | 80 | `127.0.0.1:5050:80` | ❌ **BLOQUEADO** | Solo localhost del servidor o vía Túnel SSH |
| **MinIO API y Consola Web** | 9000, 9001 | `127.0.0.1:9000`, `127.0.0.1:9001` | ❌ **BLOQUEADO** | Microservicios internos (`minio:9000`), fotos vía Nginx (`/anura-dataset/`) |
| **Modo Admin (Next.js)** | 3000 | `127.0.0.1:3010:3000` | ❌ **BLOQUEADO** | Cloudflare Tunnel directo a `http://admin-web:3000` |
| **Microservicios (Auth, Obs, Geo, etc.)** | 3001 a 3008 | `127.0.0.1:300x` | ❌ **BLOQUEADO** | Red interna Docker `anura-net` |
| **PostgreSQL & Redis** | 5432, 6379 | No publicados | ❌ **BLOQUEADO** | Únicamente red interna `anura-net` |

---

## 2. Configuración del Túnel de Cloudflare (2 Subdominios)

El contenedor `anura_tunnel` (`cloudflare/cloudflared`) se ejecuta dentro de la misma red Docker `anura-net`. Por lo tanto, el túnel resuelve los nombres de los contenedores directamente:

En **Cloudflare Zero Trust** → **Networks** → **Tunnels** → Tu Túnel → pestaña **Public Hostnames**, agrega dos rutas:

### Subdominio 1: Web Pública y API
- **Subdomain**: `anura` (o el que uses para la web pública)
- **Domain**: `tudominio.com` (ej: `juanlabs.me`)
- **Type**: `HTTP`
- **URL**: `npm:80` *(o directo a `frontend:80`)*

### Subdominio 2: Modo Administrativo
- **Subdomain**: `admin`
- **Domain**: `tudominio.com` (ej: `juanlabs.me`)
- **Type**: `HTTP`
- **URL**: `admin-web:3000`

> **Recomendación de Seguridad Extra (Cloudflare Access):**  
> Para `admin.tudominio.com`, crea una aplicación en **Access** → **Applications** que exija ingresar tu correo o código PIN de un solo uso antes de mostrar la pantalla del panel.

---

## 3. Lo que te toca editar MANUALMENTE en el Servidor

Cuando clones el repositorio en tu servidor Linux, sigue estos pasos:

### Paso 3.1: Instalar dependencias previas en Linux (si no las tienes)
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git curl
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
# Reinicia tu sesión SSH para aplicar el grupo docker
```

### Paso 3.2: Clonar el proyecto
```bash
git clone <TU_URL_DE_GITHUB> anura
cd anura
```

### Paso 3.3: Crear tu archivo `.env`
```bash
cp .env.example .env
nano .env
```

### Paso 3.4: Valores obligatorios a editar a mano en `.env`

1. **`TUNNEL_TOKEN`**:
   - Pega el token que te da Cloudflare cuando creas el túnel (el valor que viene tras `tunnel run --token ...`).

2. **Subdominios / URLs Públicas**:
   - `APP_DOMAIN=anura.tudominio.com`
   - `FRONTEND_URL=https://anura.tudominio.com`
   - `PUBLIC_BASE_URL=https://anura.tudominio.com`
   - `ADMIN_PUBLIC_URL=https://admin.tudominio.com`
   - `MINIO_PUBLIC_ENDPOINT=https://anura.tudominio.com`
   - `GOOGLE_CALLBACK_URL=https://anura.tudominio.com/api/auth/google/callback`

3. **Contraseñas y Secretos Maestros** (cámbialas por contraseñas seguras y únicas):
   - `POSTGRES_PASSWORD=...`
   - `DATABASE_URL=postgresql://anura_user:<MISMA_POSTGRES_PASSWORD>@postgres:5432/anura`
   - `BACKUP_DATABASE_URL=postgresql://anura_user:<MISMA_POSTGRES_PASSWORD>@postgres:5432/anura`
   - `AUTH_DB_PASSWORD`, `OBSERVATION_DB_PASSWORD`, `EXPLORER_DB_PASSWORD`, `GEO_DB_PASSWORD`, `THUMBNAIL_DB_PASSWORD`, `NOTIFICATION_DB_PASSWORD`, `DATASET_DB_PASSWORD` (y sus respectivas URLs correspondientes).
   - `MINIO_ROOT_USER` y `MINIO_ROOT_PASSWORD`
   - `PGADMIN_EMAIL` y `PGADMIN_PASSWORD`

4. **Tokens criptográficos**:
   - `JWT_SECRET`: Llave secreta para tokens JWT de usuarios.
     ```bash
     openssl rand -hex 32
     ```
   - `INTERNAL_SERVICE_TOKEN`: Token para llamadas de microservicio a microservicio.
     ```bash
     openssl rand -hex 32
     ```
   - `WORKER_TOKEN`: Si conectas el worker de IA.
     ```bash
     openssl rand -hex 32
     ```
   - `CONTENT_MANIFEST_PRIVATE_KEY_B64`: Firma Ed25519 del catálogo público.
     ```bash
     node -e "const c=require('crypto');const{privateKey}=c.generateKeyPairSync('ed25519');console.log(Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'))"
     ```

5. **Google OAuth (Opcional si usas login con Google)**:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

---

## 4. Despliegue y Arranque

Una vez editado el archivo `.env`:

```bash
# Dar permisos de ejecución al script de arranque
chmod +x scripts/up.sh

# Construir y levantar todo en segundo plano
./scripts/up.sh --build
```

El script se encargará de:
1. Levantar la base de datos Postgres con PostGIS y pgvector.
2. Ejecutar las migraciones y creación de roles (`03-roles.sh`).
3. Inicializar MinIO y crear los buckets requeridos.
4. Levantar todos los microservicios y comprobar su salud (`healthcheck`).
5. Iniciar el túnel de Cloudflare y Nginx.

---

## 5. Cómo acceder de forma segura a los Paneles de Administración

Como los puertos de administración están atados a `127.0.0.1`, ningún atacante en internet puede ingresar por IP. Para entrar tú:

### Opción A: Vía Túnel SSH (Recomendada y más segura)
Desde tu máquina local (tu PC), abre un túnel SSH hacia tu servidor Linux:

```bash
# Para acceder al panel de Nginx Proxy Manager (puerto 81):
ssh -L 8181:127.0.0.1:81 usuario@IP_DE_TU_SERVIDOR

# Para acceder a pgAdmin (puerto 5050):
ssh -L 5050:127.0.0.1:5050 usuario@IP_DE_TU_SERVIDOR

# Para acceder a la consola de MinIO (puerto 9001):
ssh -L 9001:127.0.0.1:9001 usuario@IP_DE_TU_SERVIDOR
```
Luego en el navegador de tu PC abres:
- Nginx Proxy Manager: `http://localhost:8181`
- pgAdmin: `http://localhost:5050`
- MinIO Console: `http://localhost:9001`

### Opción B: Vía Cloudflare Access (Túnel Privado)
Si prefieres no usar SSH, puedes crear un tercer hostname en Cloudflare Tunnel (ej. `pgadmin.tudominio.com` apuntando a `HTTP pgadmin:80`) y colocarle una política de **Cloudflare Access** que solo permita tu correo.
