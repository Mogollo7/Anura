# Guía de uso del panel Admin de ANURA

Para quien administra: crear especies, fichas, paquetes, avisos y cuentas. Escrita sobre lo que el panel hace hoy
(auditado el 30-sep-2026 contra el servidor real).

## 0. Estado auditado: qué funciona y qué te toca a ti

**Funciona** (probado contra la base real): los 9 servicios del servidor (todos "healthy"), las 29 pantallas del panel
(responden), las consultas de solo lectura del dataset (sin ningún error del servidor), los avisos de punta a punta (17 comprobaciones:
enviar, vista previa, imagen, enlaces, página pública, retirar), los candados del Admin público y el freno de login.

**No es solo «añadir imágenes y texto».** Además de contenido, hay tres cosas que no se pueden hacer por ti, y una de
ellas bloquea los paquetes hoy:

| # | Qué falta | Quién | Por qué |
|---|---|---|---|
| 1 | **Validar el umbral OSR de cada subregión** (Modelo → OSR) | Tú, en el panel | Es el único motivo por el que las 9 subregiones de Antioquia están «no listas para compilar». Es una decisión humana a propósito: nadie lo valida por ti. |
| 2 | **Añadir `admin.juanlabs.me` al túnel de Cloudflare** apuntando a `http://admin-web:3000` (no a `npm:80`, que es de la web) | Tú, en Cloudflare | Sin eso el Admin público no responde desde fuera y el botón «Modo administrativo» de la web no carga. Ver `docs/ADMIN_PUBLICO.md`. |
| 3 | **Encender el modelo** cuando subas fotos nuevas: `.\scripts\up.ps1 -Model` en el PC con GPU | Tú, en el PC | El worker calcula los vectores de las fotos nuevas; está apagado ahora (las 12 209 fotos actuales ya tienen vector). |
| 4 | **Priors de zona y clima**: ya se toman del paquete que la app descargó antes (corregido) | Ya hecho | Ver `docs/AUDITORIA_PAQUETES.md`, hallazgo 2. Las especies creadas después de ese paquete no tienen fila propia: la app las trata sin ajuste de contexto (no las rechaza). |

Datos hoy: 43 especies (9 sin `taxon_id`, quedan fuera de los paquetes), 12 209 fotos con vector, 9 subregiones de
Antioquia, 9 paquetes publicados (el anterior importado, uno por subregión), 15 cuentas de la app, 1 cuenta del panel (la tuya, super),
13 fichas públicas en borrador y 0 publicadas, 0 destacados.

## 1. Entrar

- **Desde la web de ANURA**: inicia sesión con tu cuenta y pulsa **Modo administrativo** (solo aparece si tu cuenta es del
  panel). Te lleva a `https://admin.juanlabs.me` ya con la sesión.
- **Directo**: `https://admin.juanlabs.me/login` con tu correo y contraseña. En este PC también: `http://localhost:3010`.
- Si fallas la contraseña 8 veces en 10 minutos esa cuenta se frena 10 minutos (es normal, protege el panel).
- Arriba a la derecha ves tu nombre y «super usuario». El botón de salida cierra la sesión.
- Cada cuenta del panel tiene permisos por acción (sección 9). Si un botón sale con candado, te falta ese permiso.

## 2. El mapa del panel

Barra lateral, por áreas:

| Área | Para qué |
|---|---|
| **Inicio** | Cuatro indicadores (observaciones refutadas, paquetes descargables, especies, actividad 7 días), problemas abiertos y actividad reciente. |
| **Analítica** | Crecimiento y mapa de actividad. Solo lectura. |
| **Modelo** | El ciclo: **Conseguir → Limpiar → Procesar → Resultado**. Aquí vives al crear especies y paquetes (secciones 3 a 5). |
| **App** | Usuarios, Dispositivos y Observaciones de ANURA Mobile (sección 7). |
| **Operación** | Actualizaciones, **Notificaciones**, Sincronización y Auditoría (secciones 6 y 8). |
| **Sistema** | Estado de los servicios y cuentas del panel (sección 9). |

## 3. Crear una especie nueva (el ciclo completo)

Haz los pasos **en este orden**. Cada pantalla te dice qué falta y adónde ir si algo bloquea.

### 3.1 Conseguir
1. **Modelo → Especies → Añadir especie.** Escribe el nombre científico (dos palabras: «Boana boans») y la familia
   («Hylidae»). El sistema valida el nombre, evita duplicados y le asigna solo el `taxon_id` (`COL_ANURA_NNNN`).
   **Editar nombre y familia** corrige después, con opción de aplicar la familia a los congéneres.
2. **Fotos**, por cualquiera de dos caminos:
   - **Imágenes → Subir foto** (una por una): la foto, **latitud y longitud** en grados decimales (p. ej. 6,2518 y
     -75,5636), precisión en metros (opcional), fecha (opcional), **licencia** y **autor** (va en la atribución). Solo las
     licencias CC se pueden mostrar en la ficha pública; una «todos los derechos reservados» sirve para entrenar.
   - **Scraping**: consulta iNaturalist o GBIF con **Consultar muestra** para ver qué hay (la casilla «Ensayo…» solo cuenta,
     no baja nada). El Admin **no descarga** los archivos: eso lo hace el script del PC (`scraper_inaturalist.py`); la
     pantalla te muestra el comando exacto que corresponde a tus filtros.
3. **Imágenes**, por especie: **Excluir** una foto mala (con motivo) o **Invalidar observación** si toda la observación es
   dudosa; **Revertir invalidación** / **Reincluir** lo deshacen. Nada se borra.
4. **Regiones** (Modelo → Regiones): ya está **Antioquia activa** con sus 9 subregiones. Para otro departamento: agrégalo,
   asigna todos sus municipios a una subregión y pulsa **Activar departamento**.

Una especie entra a un paquete solo con **≥ 10 fotos activas** y **≥ 3 individuos** (observaciones distintas) y con
`taxon_id`. Si no llega, queda fuera con un aviso (no es un error).

### 3.2 Limpiar
5. **Calidad**: la limpieza automática *propone* qué coordenada usar y marca las atípicas, sin licencia o sin coordenada.
   Tú decides en **Pendientes** / **Decididos**; **Aceptar las N propuestas** acepta un tipo entero. Queda en la auditoría
   y la coordenada original nunca se borra. Usa **Correr la limpieza** si añadiste fotos.
6. **Ficha** (la ficha *técnica*, la que usa el modelo): **Calcular altitudes faltantes**, el rango de altitud
   («Guardar como manual» / «Volver al calculado»), el sustrato y los pesos `wv + wg + wm`, que **deben sumar 1**.

### 3.3 Procesar
7. **Worker**: con el modelo encendido (`.\scripts\up.ps1 -Model`), **Crear trabajo** calcula los vectores de las fotos que
   no lo tienen (campo «Fotos»: todas las que faltan o una especie). No lo afirmes terminado hasta que la cola lo diga.
8. **DB vectorial**: mira dónde quedaron esos vectores; **Medir latencia** es solo diagnóstico.
9. **Centroides**: **Crear versión** (reparte fotos entre entrenamiento, validación y prueba, siempre por individuo) y
   luego **Calcular centroides** / «Recalcular». Hazlo **una vez por lote**, no por foto.
10. **Clústeres**: revisa las especies que se confunden y acepta las agrupaciones que quieras que viajen en el paquete.
11. **OSR** (*el paso que hoy bloquea*): elige la subregión en «Paquete (una calibración por paquete)» → **Calcular
    propuesta** (KAR objetivo, 95 % por defecto) → revisa la tabla de **Puntos de operación** (**Usar** copia un τ) →
    escribe una nota («Por qué este τ») → **Validar τ**. Sin τ validado la insignia dice «Sin τ validado» y no hay paquete.
    Se valida **por subregión** (9 veces en Antioquia).

### 3.4 Resultado: validar, compilar, aprobar, publicar
12. **Validación** (Modelo → Resultado): para cada subregión dice «lista» o te da el motivo y la pantalla donde arreglarlo.
13. **Release**: elige la subregión → **Compilar paquete** (el botón dice «Compilando…» mientras trabaja). Nace como
    **Borrador**.
14. Las **dos aprobaciones**: **Aprobar (científica)** y **Aprobar (técnica)**. Las dan dos cuentas distintas; tu cuenta
    super puede darlas las dos. Con ambas pasa a «Aprobado, sin publicar».
15. **Publicar** → confirmas. Es lo que la app descarga para esa subregión; la versión anterior queda **retirada** (se puede
    **restaurar** sin repetir aprobaciones: es tu botón de marcha atrás).
16. Si después de compilar cambia algo (centroides, τ, ficha, nombre o familia de una especie, morfos), el borrador sale
    «Desactualizado: compila otra» y no deja aprobar ni publicar. Es el seguro, no un fallo.

**Simulador** (Resultado): sube o elige una foto y mira qué identificaría un paquete, sin modificar nada. Úsalo antes de
publicar un paquete nuevo sobre uno que ya sirve (ver hallazgo 2 de la auditoría). **Métricas**: cómo le fue al paquete ya
publicado.

## 4. Contenido que la gente lee (ficha pública y carrusel)

Esto es lo que sí es solo texto e imágenes. Vive aparte del modelo: corregir un nombre común **no** recompila nada.

**Modelo → Conseguir → Contenido** (una ficha por especie, estados *Borrador → En revisión → Publicada*).

Para **enviar a revisión** y publicar son obligatorios:
- **Nombre común** en español **+ su fuente**.
- **Categoría UICN** (LC, NT, VU, EN, CR, EW, EX, DD) **+ fuente**.
- **Toxicidad** (inofensiva, tóxica al tacto, tóxica por ingestión) **+ fuente**.
- **Foto principal con licencia Creative Commons** (una «todos los derechos reservados» no se puede mostrar).
- Al menos una observación con coordenada (de ahí salen la altitud y las subregiones automáticas).

Opcionales (un campo vacío simplemente no se muestra): hábitat, morfología, especies con las que se confunde, otros
nombres, autoría, sinónimos, descripción, actividad (diurna / nocturna / crepuscular / ambas), dieta, reproducción,
distribución, altitud de literatura, LHC, dato curioso, endemismo, amenazas y la **galería**.

Flujo: quien **edita** (permiso «Editar contenido») pulsa **Enviar a revisión**; quien tiene el aval del herpetólogo
(«Publicar contenido») pulsa **Publicar** o **Devolver** (con motivo). Tu cuenta super puede hacer las dos. Hoy hay 13
fichas en borrador esperando fuente, UICN, toxicidad y foto.

**Destacados** (carrusel de inicio, día por día): **Programar** una especie para una fecha en una de cuatro categorías:
*Rana del día*, *Dónde buscarla*, *Foto destacada*, *Especie amenazada*. **Quitar** deshace. Solo entran especies con la
ficha **publicada** que cumplan la condición de la categoría:

| Categoría | La ficha publicada necesita |
|---|---|
| Rana del día | foto principal **y** dato curioso |
| Dónde buscarla | hábitat |
| Foto destacada | foto principal con licencia CC **y** autor |
| Especie amenazada | UICN en VU, EN o CR |

## 5. Dato para el modelo vs. dato público

| Quiero… | Voy a… | ¿Recompila el paquete? |
|---|---|---|
| Corregir cómo se identifica una rana | Imágenes / Ficha técnica / OSR | Sí (queda «Desactualizado») |
| Corregir un nombre común, la UICN o una foto de la ficha | Contenido | No |
| Cambiar el nombre científico o la familia | Especies | Sí |

## 6. Notificaciones (Operación → Notificaciones)

Mandan un aviso a la web y a la app **sin cambiar la app móvil**.

1. **Título** (hasta 80) y **Mensaje** (hasta 4000; una línea en blanco separa párrafos; las direcciones web se vuelven
   enlaces).
2. **Botones con enlace**: hasta 5, cada uno con texto y dirección `https://…`.
3. **Imagen** (JPG, PNG, WebP o GIF, hasta 2 MB).
4. **Para quién**: todas las cuentas activas, una cuenta o varias (con buscador).
5. **Revisar y enviar** muestra **exactamente lo que verá el teléfono** y a cuántas personas llega. Confirma con **Enviar
   aviso**.

Cómo llega: si el aviso es corto y sin extras, el teléfono recibe el texto tal cual. Si lleva imagen, enlaces o texto
largo, el teléfono recibe un **resumen y un enlace** (`https://anura.juanlabs.me/a/…`) a una página tipo correo con todo.
La app revisa avisos cada ~15 minutos (no hay *push* instantáneo). En la lista de enviados ves cuántos lo leyeron y
puedes **Retirar** un aviso (desaparece de la web y la app, y su enlace deja de funcionar). Hay antirrebote: el mismo
aviso dos veces seguidas o más de 10 envíos en 10 minutos se frenan.

## 7. App: usuarios, teléfonos y observaciones

- **Usuarios**: cuentas de ANURA Mobile. **Suspender cuenta** (con motivo) / **Reactivar cuenta**.
- **Dispositivos**: teléfonos, versión y espacio. **Bloquear teléfono** (con motivo) / **Desbloquear teléfono**.
- **Observaciones**: lo que llega de la app, incluidas las **refutaciones** de otros usuarios. **Rechazar observación**
  (con motivo) o validarla.
Todo esto pide el permiso «Administrar cuentas del panel» o el de revisión correspondiente.

## 8. Operación

- **Actualizaciones**: qué paquetes puede descargar la app hoy (lo publicado en Release).
- **Sincronización**: **Pedir sincronización** hace que los teléfonos suban lo pendiente ya (si no, lo hacen al abrir la app
  y cada ~15 min). Muestra qué subió y qué falló.
- **Auditoría**: quién hizo qué y cuándo (compilar, aprobar, publicar, enviar y retirar avisos, decisiones de limpieza…).

## 9. Sistema y cuentas del panel

- **Sistema**: estado real de cada servicio y las integraciones (se actualiza al abrir la pantalla).
- **Cuentas del panel** (**Crear cuenta**): cada cuenta lleva permisos por acción: ver especies, editar taxonomía, revisar
  fotografías, validar estadio, definir morfo / LRC / microhábitat / pesos, crear complejo, ejecutar entrenamiento,
  modificar el worker, ver GPU, configurar OSR, **generar paquete**, **aprobar paquete científico**, **publicar paquete**,
  administrar cuentas, debug técnico, **editar contenido** y **publicar contenido**.
  La cuenta super no se degrada ni se suspende. Para la regla de las dos aprobaciones necesitas una **segunda cuenta**
  (por ejemplo, la de quien actúa como herpetólogo): una da la científica, la otra la técnica.

## 10. Ruta mínima para tu primer paquete nuevo

1. Admin público: añade el nombre en Cloudflare, apuntando a `admin-web:3000` (tabla del punto 0, #2).
2. Especies → **Añadir especie** → Imágenes → **Subir foto** (≥ 10 fotos, ≥ 3 observaciones distintas, con licencia y coordenada).
3. Enciende el modelo → **Worker → Crear trabajo**.
4. Calidad → decide los pendientes · Ficha → altitud y pesos.
5. Centroides → **Crear versión** → **Calcular centroides**.
6. **OSR → Calcular propuesta → Validar τ** (por subregión).
7. Validación → «lista» · Release → **Compilar paquete** → **Aprobar** ×2 → Simulador (comparar) → **Publicar**.
8. Contenido → completa la ficha pública → **Enviar a revisión** → **Publicar** · Notificaciones → avisa si quieres.

## 11. Si algo no va

- **Un botón no hace nada / sale candado**: te falta un permiso (Sistema → cuentas del panel).
- **«No se pudo conectar con…»**: mira Sistema; reinicia con `.\scripts\up.ps1` (añade `-Model` para el modelo).
- **«Desactualizado: compila otra»**: cambió algo desde que compilaste; recompila.
- **Una subregión no está «lista»**: Validación te dice el motivo y la pantalla exacta.
- **Muchos intentos de login**: espera 10 minutos.
- **Documentos**: `docs/ADMIN_PUBLICO.md` (acceso y avisos), `docs/AUDITORIA_PAQUETES.md` (el proceso y sus riesgos).
