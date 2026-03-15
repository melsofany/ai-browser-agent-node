FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl ca-certificates --no-install-recommends && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev --legacy-peer-deps

COPY . .

RUN npm run build 2>&1 | tail -5 || true

ENV PORT=10000
ENV NODE_ENV=production
ENV USE_LOCAL_MODELS=false
ENV MEMORY_BACKEND=sqlite

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 CMD curl -f http://localhost:10000/health || exit 1

CMD ["npm", "start"]
