FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache vips-dev
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3004
CMD ["node", "src/index.js"]
