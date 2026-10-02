# Auditoría: ¿tiene sentido la creación automática de paquetes?

Fecha: 2026-09-30. Alcance: `services/dataset-service` (validación técnica, compilador, release, especies, ficha) y las
pantallas del Admin que los usan (Especies, Imágenes, Ficha, Worker, Centroides, OSR, Validación, Release).

## Respuesta corta

**Sí tiene sentido, y es el mismo proceso manual de siempre con las compuertas humanas en su sitio.** Lo "automático"
es solo el ensamblado final (armar el `package.sqlite` y el manifiesto desde la base). Nada de lo que exige criterio
se decide solo: una persona crea la especie, sube o consigue las fotos, decide la ficha, valida el umbral OSR y dos
cuentas aprueban antes de publicar. Para empezar a crear especies, fichas y paquetes desde el panel el camino es este:

| Paso (antes, a mano / scripts) | Ahora, en el Admin | Quién decide | Qué impide avanzar mal |
|---|---|---|---|
| Elegir la especie y su familia | **Especies → Añadir especie** | Una persona | Nombre en dos palabras, género coherente, familia `-idae`, sin duplicados; `taxon_id` (`COL_ANURA_NNNN`) lo da una secuencia |
| Conseguir fotos | **Scraping** / **Imágenes → Subir foto** | Una persona | Cada foto con licencia y autoría; invalidar o excluir exige motivo y se puede revertir |
| Limpiar coordenadas y fotos malas | **Calidad** | Una persona decide; lo automático solo propone | Decisión auditada; la coordenada original nunca se borra |
| Ficha ecológica (altitud, sustrato, pesos, LRC) | **Ficha** | Una persona | Pesos `wv+wg+wm` deben sumar 1 (bloquea) |
| Vectores con el encoder del teléfono | **Worker y embeddings** | Worker de GPU | Solo el encoder registrado (sha `219e860e…`); sin vectores no se compila |
| Centroides (global, regional, morfo) | **Centroides** | Cálculo | Un lote viejo respecto al dataset bloquea (`centroides_desactualizados`) |
| Umbral de rechazo τ | **OSR** | **Una persona valida** | Sin τ validado no hay paquete; el modelo (medias y precisión) debe coincidir con las especies del paquete |
| Compilar | **Release → Compilar paquete** | Cálculo, solo si la validación está lista | Si falta algo, dice qué y dónde se arregla |
| Aprobar y publicar | **Release → Aprobar (científica/técnica) → Publicar** | **Dos aprobaciones**, dos cuentas (la super puede ambas) | Un borrador cuya "huella" cambió ya no se aprueba ni se publica |

Una especie entra al paquete de una subregión solo si: tiene al menos **10 fotos activas** y **3 individuos**
(`reglas.js`, espejo de `admin/src/lib/dataset/reglas.ts`), tiene `taxon_id`, tiene centroide global y sus individuos
caen dentro de la subregión. Las demás quedan fuera con un aviso, no con un error.

## Lo que está bien hecho

- **Compuertas humanas donde importa**: τ, ficha, limpieza y aprobaciones. Lo automático solo propone.
- **Detección de paquetes viejos**: la "huella" de la validación (encoder, versión del dataset, lote de centroides,
  umbral OSR, especies con su ficha, morfos, clústeres) se compara al aprobar y al publicar.
- **Retroceso seguro**: las versiones retiradas se pueden restaurar sin repetir aprobaciones; el archivo es inmutable
  en MinIO.
- **Trazabilidad**: cada paso escribe en `audit.log` (quién, qué versión, hash).
- **Un solo formato**: `paqueteSqlite.js` arma el mismo `package.sqlite` que lee el teléfono (`PackageVectorIndex.kt`,
  sqlite-vec 0.1.9).

## Hallazgos

### 1. [Corregido] Renombrar una especie después de compilar no invalidaba el borrador
La huella no incluía el nombre científico, el género, la familia ni el `taxon_id`, pero el paquete sí los lleva
(`taxa`). Un borrador compilado con el nombre viejo seguía aprobándose y publicándose. Ahora forman parte de la huella
(`validacionTecnica.js`). Efecto: los borradores y aprobados sin publicar que existan hoy aparecerán una vez como
"desactualizados" y se recompilan; los publicados y los importados no cambian.

### 2. [Corregido] Los paquetes compilados por el servidor salían sin prior de zona ni de clima
`paqueteSqlite.js` dejaba vacías `zone_prior`, `zone_prior_meta`, `weather_prior` y `weather_prior_meta`, y el paquete
anterior importado (`legado.js`) sí las traía: publicar uno nuevo habría dejado la identificación solo con altitud y
sustrato. El servidor no puede *calcular* esos datos (salen de `pipeline_dataset/paquetes_zonales.py`, con
P(s|z) = (N(s,z)+α)/(N(z)+α·K), y de `evaluation/geo_weather_v1`, con datos y control de fuga que no están aquí).

**Corrección, sin tocar la app:** al compilar, `priors.js` lee el paquete que la app ya descargó antes (el más reciente con
origen `legado` del departamento, en MinIO) y copia a `package.sqlite`:
- la rejilla completa (`grid_cells`, `zones`) y los pesos (`zone_prior_meta`, `weather_prior_meta`), tal cual;
- las filas de `zone_prior` y `weather_prior` **solo de las especies del paquete nuevo**, valor a valor.

Probado contra el paquete real y con las mismas consultas SQL que ejecuta la app (`PackageVectorIndex.kt`,
`NearbySpecies.kt`; `_pruebas/prueba_priors.js`): una coordenada de Medellín cae en `ZONE_006`, una fuera de cobertura no
tiene zona, `zone_prior_meta` trae peso 0.75, `weather_prior_meta.weight` = 0.2, y las 90 filas de zona son idénticas a
las del paquete anterior. El manifiesto y `package_info` declaran el origen y qué especies quedaron sin fila.

**Límite que queda (viene del dato, no del código):** el paquete anterior solo tenía 30 especies (21 con clima). Las
especies creadas después (hoy: *Sachatamia electrops*, *Pristimantis bogotensis*, *Dendropsophus molitor*,
*Phyllomedusa tarsius*) no tienen fila. La app lo contempla: en zona usa `p_unobserved` (≈ 6×10⁻⁴ en `ZONE_006`) y en
clima no ajusta. Como los priors solo **reordenan candidatas y nunca deciden la especie** (`AnuraIdentifier.kt`), esas
especies no se rechazan, pero en la lista de candidatas con ubicación quedan por debajo de las que sí tienen prior.
Resolverlo bien exige recalcular el prior de zona con las observaciones del dataset (α, tope de esfuerzo y N(z) de
`paquetes_zonales.py`); no se hizo porque implica cambiar el dato del modelo, no solo moverlo.

### 3. [Aviso] La regla "10 fotos y 3 individuos" vive en dos sitios
`services/dataset-service/src/reglas.js` y `admin/src/lib/dataset/reglas.ts` deben coincidir; hay una prueba del bloque 4
que los compara. Si cambias una, cambia la otra y corre `_pruebas`.

### 4. [Aviso] Crear especies nuevas deja el paquete vigente "desactualizado" en cadena
Añadir fotos nuevas hace que los centroides queden viejos → no se puede compilar ni publicar hasta recalcular centroides,
revalidar τ (porque cambian las especies cubiertas) y recompilar. Es correcto, pero son 4 pasos seguidos: el orden en el
Admin es Imágenes → Worker → Centroides → OSR → Validación → Release. Conviene una sola vez por lote de especies, no por
foto.

### 5. [Aviso] Permisos y caché de sesión
`panelAuth.js` guarda 60 s la respuesta de `/api/panel/me`: a una cuenta suspendida o degradada todavía le funcionan sus
permisos hasta un minuto. Aceptable; ahora que el Admin es público, no subir ese TTL.

## Recomendación

Usar el flujo del Admin como camino normal para especies, fichas y paquetes. Con el hallazgo 2 corregido, un paquete
nuevo ya conserva la rejilla de zonas y los priors del paquete anterior para las especies que ya tenía. Antes de
**publicar** y reemplazar uno que ya sirve, compáralo en el Simulador, sobre todo si incluye especies nuevas (sin prior
propio). Compilar y aprobar no cambia lo que la app descarga: la versión anterior sigue siendo la publicada hasta que
pulses Publicar, y puedes restaurarla.
