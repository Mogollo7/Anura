FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src/ ./src/
COPY paquetes/ ./paquetes/
EXPOSE 3008
CMD ["node", "src/index.js"]
