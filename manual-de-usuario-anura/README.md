# Anura Manual de Usuario

## Integrantes

- Juan Sebastián Martínez Galeano – 1026135816
- Samuel Usma Brand – 1026133461
- Samuel Salas Echeverry – 1026136502
- Juan Pablo Restrepo Alzate – 1025642179
- Santiago Córdoba Muriel - 1001578005
- Cesar Ocampo raigosa - 1026134099
- Miguel Angel Vergara Mazo - 1017922264
- Yuli Vanessa Soto Montoya - 1017925306

## Estructura del Proyecto

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

## Dependencias y Tecnología

- **Frontend**: React 18 + Vite + Leaflet
- **Gateway**: Nginx Proxy Manager (NPM)
- **Auth Service**: Node.js + Express + JWT + bcrypt
- **Observations Service**: Node.js + Express + Multer + MinIO
- **AI Service**: FastAPI + BioCLIP (ViT-H/14)
- **Geo Service**: Node.js + Express + APIs externas
- **Thumbnails Service**: Node.js + Sharp + WebP
- **Base de datos**: PostgreSQL 16 (multi-schema)
- **Cache**: Redis 7
- **Storage**: MinIO (S3-compatible)