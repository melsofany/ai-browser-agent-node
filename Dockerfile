FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
  curl ca-certificates && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --only=production --legacy-peer-deps 2>&1

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["npm", "start"]
