
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev || npm install --only=production

COPY . .

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000
CMD ["node", "server.js"]
