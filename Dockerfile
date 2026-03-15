FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl ca-certificates xdg-utils \
    --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

RUN npm run build 2>&1 | tail -20 || echo "Build completed"

RUN npx playwright install chromium 2>&1 | tail -10 || echo "Playwright ready"

ENV PORT=10000
ENV NODE_ENV=production
ENV USE_LOCAL_MODELS=false
ENV MEMORY_BACKEND=sqlite
ENV LOCAL_ONLY_MODE=false
ENV BROWSER_LAUNCH_TIMEOUT=30000

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

CMD ["npm", "start"]
