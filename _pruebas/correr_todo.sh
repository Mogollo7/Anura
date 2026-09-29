#!/bin/sh
# Recrea cada base desechable y corre todas las pruebas de los bloques. Uso: sh correr_todo.sh
export MSYS_NO_PATHCONV=1
P=D:/server/Anura/_pruebas
DS=D:/server/Anura/services/dataset-service
export NODE_PATH=$P/node_modules
[ -d $P/node_modules ] || (cd $P && npm i --silent >/dev/null 2>&1)
sh $P/bd_prueba.sh anura >/dev/null 2>&1
docker rm -f anura_test_minio_release >/dev/null 2>&1
docker run -d --rm --name anura_test_minio_release -e MINIO_ROOT_USER=prueba -e MINIO_ROOT_PASSWORD=prueba-prueba -p 127.0.0.1:39139:9000 minio/minio:latest server /data >/dev/null 2>&1
docker rm -f anura_test_minio_osrpaq >/dev/null 2>&1
docker run -d --rm --name anura_test_minio_osrpaq -e MINIO_ROOT_USER=prueba -e MINIO_ROOT_PASSWORD=prueba-prueba -p 127.0.0.1:39219:9000 minio/minio:latest server /data >/dev/null 2>&1
docker rm -f anura_test_minio_legado >/dev/null 2>&1
docker run -d --rm --name anura_test_minio_legado -e MINIO_ROOT_USER=prueba -e MINIO_ROOT_PASSWORD=prueba-prueba -p 127.0.0.1:39249:9000 minio/minio:latest server /data >/dev/null 2>&1
sleep 5
corre() { # nombre_bd prueba cwd
  docker exec anura_test_pg dropdb -U postgres --force --if-exists "$1" >/dev/null 2>&1
  sh $P/bd_prueba.sh "$1" >/dev/null 2>&1
  out=$(cd "$3" && node "$P/$2" 2>&1); code=$?
  echo "$2 → exit $code"; echo "$out" | grep -v "^    at" | tail -${4:-2}
}
corre anura prueba_etiquetas.js $DS
corre anura_ficha prueba_ficha.js $DS
corre anura_especies prueba_especies.js $DS
corre anura_vectores prueba_vectores.js $DS
corre anura_osr prueba_osr.js $DS
corre anura_release prueba_release.js $DS
corre anura_clave prueba_clave.js $DS
corre anura_osrpaq prueba_osrpaquete.js $DS
corre anura_legado prueba_legado.js $DS 14
corre anura_versiones prueba_versiones.js $DS
corre anura_explorer prueba_explorer.js D:/server/Anura/services/explorer-service
corre anura_salidas prueba_salidas.js D:/server/Anura/services/observation-service
corre anura_despliegue prueba_seguridad_auth.js D:/server/Anura/services/auth-service
corre anura_despliegue prueba_seguridad_dataset.js $DS
corre anura_despliegue_ex prueba_seguridad_explorer.js D:/server/Anura/services/explorer-service
docker rm -f anura_test_minio_release >/dev/null 2>&1
docker rm -f anura_test_minio_osrpaq >/dev/null 2>&1
docker rm -f anura_test_minio_legado >/dev/null 2>&1
