# Debian (glibc) y Node 22: el compilador de paquetes usa node:sqlite con la extensión
# sqlite-vec 0.1.9 (la misma del teléfono), que solo trae binario precompilado para glibc.
FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src/ ./src/
COPY scripts/ ./scripts/
EXPOSE 3008
CMD ["node", "src/index.js"]
