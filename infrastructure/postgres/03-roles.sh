#!/bin/sh
# Espera el schema de init.sql, aplica phase2.sql y crea los roles.
set -eu

export PGHOST="${PGHOST:-localhost}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-postgres}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-anura}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-5}"

if [ -z "$PGPASSWORD" ]; then
  echo "POSTGRES_PASSWORD/PGPASSWORD requerido" >&2
  exit 1
fi

for var in AUTH_DB_PASSWORD OBSERVATION_DB_PASSWORD EXPLORER_DB_PASSWORD GEO_DB_PASSWORD THUMBNAIL_DB_PASSWORD NOTIFICATION_DB_PASSWORD DATASET_DB_PASSWORD; do
  eval "val=\${$var:-}"
  if [ -z "$val" ]; then
    echo "$var requerido" >&2
    exit 1
  fi
done

echo "esperando schema base..."
i=0
while true; do
  if psql -tAc "SELECT to_regclass('notifications.notifications')" | grep -q notifications; then
    break
  fi
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "el schema base no aparecio a tiempo" >&2
    exit 1
  fi
  sleep 2
done

echo "aplicando phase2.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase2.sql

echo "aplicando roles.sql"
psql -v ON_ERROR_STOP=1 \
  -v auth_pw="$AUTH_DB_PASSWORD" \
  -v obs_pw="$OBSERVATION_DB_PASSWORD" \
  -v explorer_pw="$EXPLORER_DB_PASSWORD" \
  -v geo_pw="$GEO_DB_PASSWORD" \
  -v thumb_pw="$THUMBNAIL_DB_PASSWORD" \
  -v notif_pw="$NOTIFICATION_DB_PASSWORD" \
  -v dataset_pw="$DATASET_DB_PASSWORD" \
  -f /sql/roles.sql

echo "aplicando phase3.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase3.sql

echo "aplicando phase4.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase4.sql

echo "aplicando phase5.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase5.sql

echo "aplicando phase6.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase6.sql

echo "aplicando phase7.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase7.sql

echo "aplicando phase8.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase8.sql

echo "aplicando phase9.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase9.sql

echo "aplicando phase10.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase10.sql

echo "aplicando phase11.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase11.sql

echo "aplicando phase12.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase12.sql

echo "aplicando phase13.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase13.sql

echo "aplicando phase14.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase14.sql

echo "aplicando phase15.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase15.sql

echo "aplicando phase16.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase16.sql

echo "aplicando phase17.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase17.sql

echo "aplicando phase18.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase18.sql

echo "aplicando phase19.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase19.sql

echo "aplicando phase20.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase20.sql

echo "aplicando phase21.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase21.sql

echo "aplicando phase22.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase22.sql

echo "aplicando phase23.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase23.sql

echo "aplicando phase24.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase24.sql

echo "aplicando phase25.sql"
psql -v ON_ERROR_STOP=1 -f /sql/phase25.sql

echo "phase 2 a 25 listas"
