#!/bin/sh
# Uso: sh bd_prueba.sh <nombre_bd>
# Base desechable en el contenedor anura_test_pg (127.0.0.1:55432, postgres/prueba), NUNCA producción.
# Crea el contenedor si no existe, crea la base si no existe y aplica init.sql + 03-roles.sh (todas las phaseN.sql).
set -eu
BD="${1:?nombre de la base}"
export MSYS_NO_PATHCONV=1
if ! docker ps --format '{{.Names}}' | grep -qx anura_test_pg; then
  docker run -d --rm --name anura_test_pg -e POSTGRES_PASSWORD=prueba -e POSTGRES_DB=anura \
    -v D:/server/Anura/infrastructure/postgres:/sql:ro -p 127.0.0.1:55432:5432 anura-postgres:16-3.4-pgvector >/dev/null
  i=0; until docker exec anura_test_pg pg_isready -h 127.0.0.1 -U postgres -d anura >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 60 ] && exit 1; sleep 1; done
  sleep 2
fi
if [ -z "$(docker exec anura_test_pg psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$BD'")" ]; then
  docker exec anura_test_pg createdb -U postgres "$BD"
fi
if [ -z "$(docker exec anura_test_pg psql -U postgres -d "$BD" -tAc "SELECT to_regclass('notifications.notifications')")" ]; then
  docker exec anura_test_pg psql -U postgres -d "$BD" -v ON_ERROR_STOP=1 -q -f /sql/init.sql >/dev/null
fi
docker exec -e PGDATABASE="$BD" -e PGPASSWORD=prueba -e PGHOST=localhost \
  -e AUTH_DB_PASSWORD=p -e OBSERVATION_DB_PASSWORD=p -e EXPLORER_DB_PASSWORD=p -e GEO_DB_PASSWORD=p \
  -e THUMBNAIL_DB_PASSWORD=p -e NOTIFICATION_DB_PASSWORD=p -e DATASET_DB_PASSWORD=p \
  anura_test_pg sh /sql/03-roles.sh 2>&1 | tail -3
echo "lista: postgres://postgres:prueba@127.0.0.1:55432/$BD"
