# ── Dependencies ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Build ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Runtime (standalone) ────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
# pg_dump y psql para Sistema → Respaldar base (cliente 16, el mismo que usa db-migrate con el servidor 16).
RUN apk add --no-cache postgresql16-client
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
