# Postgres de ANURA: PostGIS 16 + pgvector (M2: embeddings del encoder, float32 x 512).
# Misma versión mayor que antes (16): el volumen anura_postgres_data se reutiliza sin migrar.
FROM postgis/postgis:16-3.4
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-16-pgvector \
 && rm -rf /var/lib/apt/lists/*
