# Anura AI Landing Page

Landing page estatica y documentacion visual para explicar la arquitectura de Anura AI, su pipeline grafico, sus microservicios, su modelo IA y las herramientas usadas.

## Contenido

- `index.html`: estructura de la landing, secciones tecnicas, diagramas y documentacion del proyecto.
- `styles.css`: diseno visual moderno, responsive y animaciones.
- `app.js`: estados visuales ligeros del pipeline arquitectonico.

## Como abrir

Abre `index.html` directamente en el navegador.

Tambien puedes servir la carpeta con cualquier servidor estatico:

```bash
python -m http.server 5174
```

Luego visita:

```text
http://localhost:5174
```

## Que muestra

El pipeline principal representa:

```text
Usuario
  -> Frontend React PWA
  -> NGINX Gateway
  -> observation-service
  -> PostgreSQL
  -> MinIO
  -> Redis Streams
  -> thumbnail-service
  -> ai-service
  -> geo-service
  -> ai_prediction_completed
  -> notification-service
  -> Frontend
```

## Alcance

Esta landing no modifica el proyecto base. Es una pieza autocontenida para presentar:

- Microservicios.
- Event-Driven Architecture.
- PostgreSQL como DB principal.
- Redis como bus de eventos, colas, cache y sesiones.
- MinIO como almacenamiento de objetos.
- Pipeline de desarrollo de software.
- Diagrama de comunicacion entre frontend, gateway, microservicios y almacenamiento.
- Diagrama de base de datos PostgreSQL por schemas.
- Diagramas tecnicos para arquitectura general, dominios DDD-like, secuencia del flujo, ERD y pipeline de modelo.
- Consideraciones PWA: camara, galeria, geolocalizacion, notificaciones, cache offline, IndexedDB y privacidad.
- Flujo del modelo IA: imagen, preprocesamiento, BioCLIP 2.5, re-ranking ecologico y validacion.
- Tablas de entrenamiento del modelo: anotaciones, clases semanticas, mascara binaria, division del dataset y augmentaciones.
- Contexto ecologico inteligente: OpenStreetMap, Leaflet, OpenTopoData, OpenWeather, Nominatim, GBIF, PostGIS, Redis, MinIO, PyTorch, OpenCV, Docker y NGINX.
- Catalogo de conceptos usados: microservicios moderados, DDD-like, Gateway-Centric, REST, Event-Driven parcial, object storage, IA multimodal contextual y geoespacial integrada.
- Herramientas por capa: React, Vite, Tailwind, PWA, Service Worker, IndexedDB, FastAPI, NGINX, Docker Compose, PostgreSQL, PostGIS, Redis Streams, MinIO, PyTorch, OpenCV, BioCLIP 2.5, U-Net, ResNet-34, SegFormer, Label Studio, Albumentations, Sharp, WebP, OpenStreetMap, Leaflet, OpenTopoData, OpenWeather, Nominatim, GBIF y Hugging Face.
- Fuentes desplegables con resumen, proposito y enlace de documentacion.
- Docker Compose conceptual.
- Enlaces al repositorio Anura y a BioCLIP 2.5 ViT-H/14.
