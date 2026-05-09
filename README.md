# Anura 🐸

> Plataforma de identificación y monitoreo de anfibios colombianos mediante visión por computador e IA contextual.

---

## Estructura del Monorepo

```
anura/
├── frontend/              # React PWA (Vite)
├── gateway/               # Nginx Proxy Manager config
├── services/
│   ├── auth-service/      # Node.js · Autenticación JWT
│   ├── observation-service/# Node.js · Registro de observaciones
│   ├── ai-service/        # FastAPI · BioCLIP + clasificador
│   ├── geo-service/       # Node.js · Clima, altitud, bioma
│   └── thumbnail-service/ # Node.js · Resize + WebP + MinIO
├── shared/                # Código compartido Node (pg, jwt, constants)
├── infrastructure/        # PostgreSQL init SQL, Redis, MinIO, monitoring
├── datasets/              # raw / processed / labeled / augmented
├── models/                # Modelos exportados (cnn, multimodal, production)
├── docs/                  # Arquitectura, API, diagramas
├── scripts/               # migrate.sh, train.sh, deploy.sh
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Stack

| Capa          | Tecnología                          |
|---------------|-------------------------------------|
| Frontend      | React 18 + Vite + Leaflet           |
| Gateway       | Nginx Proxy Manager (NPM)           |
| Auth          | Node.js + Express + JWT + bcrypt    |
| Observations  | Node.js + Express + Multer + MinIO  |
| **AI**        | **FastAPI + BioCLIP (ViT-H/14)**    |
| Geo           | Node.js + Express + APIs externas   |
| Thumbnails    | Node.js + Sharp + WebP              |
| Base de datos | PostgreSQL 16 (multi-schema)        |
| Cache         | Redis 7                             |
| Storage       | MinIO (S3-compatible)               |

---

## Base de datos PostgreSQL (schemas)

| Schema          | Contenido                              |
|-----------------|----------------------------------------|
| `auth`          | users, refresh_tokens                  |
| `observations`  | observations (imágenes + metadata)     |
| `species`       | taxonomy, distribution GBIF            |
| `geo`           | biomes, altitude_cache, weather_cache  |
| `ai`            | predictions, model_versions            |
| `notifications` | notifications por usuario              |

---

## Inicio rápido

```bash
# 1. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 2. Levantar toda la infraestructura
docker compose up -d

# 3. Ver logs
docker compose logs -f

# 4. Acceder
#   NPM Admin:    http://localhost:81
#   AI Service:   http://localhost:8000/docs
#   Frontend dev: cd frontend && npm run dev
```

---

## Entrenamiento IA

```bash
bash scripts/train.sh
# O directamente:
cd services/ai-service
python training/train_finetune.py
```

---

## Licencia
MIT © Mogollo7
