#!/usr/bin/env bash
# Arranque de ANURA en servidores Linux.
# Uso:
#   ./scripts/up.sh              Servidor base (web, panel, microservicios). Sin modelo de GPU.
#   ./scripts/up.sh --model      Incluye el servicio con modelo de IA (si el servidor tiene GPU).
#   ./scripts/up.sh --build      Reconstruye imágenes antes de levantar los contenedores.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

WITH_MODEL=0
WITH_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --model|-m|-Model)
      WITH_MODEL=1
      ;;
    --build|-b|-Build)
      WITH_BUILD=1
      ;;
    *)
      echo "Argumento desconocido: $arg"
      echo "Uso: ./scripts/up.sh [--model] [--build]"
      exit 1
      ;;
  esac
done

COMPOSE_CMD=(docker compose)
if [ "$WITH_MODEL" -eq 1 ]; then
  COMPOSE_CMD+=(--profile model)
fi
COMPOSE_CMD+=(up -d)
if [ "$WITH_BUILD" -eq 1 ]; then
  COMPOSE_CMD+=(--build)
fi

echo "=========================================================="
echo " Levantando ANURA en Linux"
echo " Postgres conserva sus datos en volúmenes persistentes."
echo "=========================================================="
"${COMPOSE_CMD[@]}"

EXPECT_UP=(
  "anura_postgres"
  "anura_redis"
  "aistor-server"
  "anura_auth"
  "anura_observations"
  "anura_geo"
  "anura_thumbnails"
  "anura_explorer"
  "anura_notifications"
  "anura_dataset"
  "anura_validation"
  "anura_frontend"
  "anura_admin"
  "anura_npm"
  "anura_tunnel"
)

if [ "$WITH_MODEL" -eq 1 ]; then
  EXPECT_UP+=("anura_model_service")
fi

echo ""
echo "Estado de contenedores:"
docker compose ps -a --format "table {{.Name}}\t{{.Status}}"
echo ""

DOWN=()
for name in "${EXPECT_UP[@]}"; do
  STATUS=$(docker inspect -f "{{.State.Status}}" "$name" 2>/dev/null || echo "missing")
  if [ "$STATUS" != "running" ]; then
    DOWN+=("$name (estado: $STATUS)")
  fi
done

for name in "anura_db_migrate" "anura_minio_init"; do
  STATUS=$(docker inspect -f "{{.State.Status}}" "$name" 2>/dev/null || echo "missing")
  if [ "$STATUS" = "running" ]; then
    continue
  fi
  CODE=$(docker inspect -f "{{.State.ExitCode}}" "$name" 2>/dev/null || echo "1")
  if [ "$CODE" != "0" ]; then
    DOWN+=("$name terminó con error (código $CODE)")
  fi
done

if [ ${#DOWN[@]} -gt 0 ]; then
  echo "⚠️ Contenedores con problemas:" >&2
  for item in "${DOWN[@]}"; do
    echo "  - $item" >&2
  done
  exit 1
fi

echo "✅ Todos los servicios están corriendo y saludables."
echo "Web pública lista en el túnel Cloudflare y puertos 80/443."
