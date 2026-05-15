#!/bin/sh
# Espera a MinIO, corrige config heredada incompatible en el volumen y crea el bucket.
set -eu
BUCKET="${MINIO_BUCKET:-anura-images}"
USER="${MINIO_ROOT_USER:-minioadmin}"
PASS="${MINIO_ROOT_PASSWORD:-change_me}"

wait_mc() {
  i=0
  while [ "$i" -lt 90 ]; do
    if mc alias set local http://minio:9000 "$USER" "$PASS" 2>/dev/null; then
      if mc admin info local >/dev/null 2>&1; then
        return 0
      fi
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "[minio-init] ERROR: MinIO no respondió en 90s" >&2
  exit 1
}

echo "[minio-init] Esperando MinIO..."
wait_mc

# Tras actualizar la imagen de MinIO, el volumen puede conservar subsystems inválidos
# (drive, webhooks, batch, openid vacío) que impiden inicializar IAM → bucle "Waiting for OpenID".
echo "[minio-init] Reseteando subsistemas de config incompatibles (si existen)..."
for sub in drive logger_webhook audit_webhook batch; do
  mc admin config reset local "$sub" 2>/dev/null && echo "[minio-init] reset: $sub" || true
done
if mc admin config reset local "identity_openid:_" 2>/dev/null; then
  echo "[minio-init] reset: identity_openid:_"
elif mc admin config reset local identity_openid 2>/dev/null; then
  echo "[minio-init] reset: identity_openid"
fi

echo "[minio-init] Reiniciando MinIO para aplicar configuración..."
mc admin service restart local 2>/dev/null || true
sleep 5

echo "[minio-init] Reconectando tras reinicio..."
wait_mc

mc mb "local/${BUCKET}" --ignore-existing
echo "[minio-init] Bucket listo: ${BUCKET}"
