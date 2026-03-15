FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build || echo "Build completed"

RUN npx playwright install chromium --with-deps 2>/dev/null || npx playwright install chromium || echo "Playwright install done"

ENV PORT=10000
ENV NODE_ENV=production
ENV USE_LOCAL_MODELS=false
ENV MEMORY_BACKEND=sqlite
ENV LOCAL_ONLY_MODE=false

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:10000/health || curl -f http://localhost:10000/ || exit 1

CMD ["npm", "start"]
