# Use a smaller base image
FROM node:22-bookworm-slim

WORKDIR /app

# Install only essential system deps including Chromium for Playwright
# Clean up apt cache immediately to save space
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl ca-certificates wget xvfb \
  chromium \
  libglib2.0-0 libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libdbus-1-3 libatspi2.0-0 libx11-6 libxcomposite1 \
  libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libxkbcommon0 \
  libpango-1.0-0 libcairo2 libasound2 \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV DISPLAY=:99

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies with production flag to skip devDependencies
# Use --legacy-peer-deps to avoid conflicts and --ignore-scripts for speed
RUN npm install --production --legacy-peer-deps --ignore-scripts

# Rebuild sqlite3 native bindings if needed
RUN cd node_modules/sqlite3 && npm run install 2>/dev/null || true

# Copy application files (respecting .dockerignore)
COPY . .

# Build frontend (optional if pre-built)
RUN npm run build 2>/dev/null || echo "Build optional"

# Create directories for persistent data
RUN mkdir -p /app/data /app/models /app/sandbox

# Set environment
ENV NODE_ENV=production
ENV PORT=10000
ENV DB_PATH=/app/data/app.db
ENV MODELS_PATH=/app/models
ENV USE_LOCAL_MODELS=false

EXPOSE 10000

# Healthcheck to ensure service is alive
HEALTHCHECK --interval=60s --timeout=30s --start-period=120s --retries=5 \
  CMD curl -f http://localhost:10000/health || exit 1

# Start with virtual display for browser and run the app
CMD ["sh", "-c", "Xvfb :99 -screen 0 1280x720x24 & sleep 1 && node main.js"]
