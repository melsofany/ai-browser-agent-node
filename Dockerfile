FROM node:22-bookworm-slim

WORKDIR /app

# Install minimal dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl ca-certificates && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies (no build step - production only)
RUN npm ci --omit=dev --legacy-peer-deps 2>&1 | grep -E "(added|up to date|packages)" || true

# Copy application files
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/app/data/app.db
ENV USE_LOCAL_MODELS=false

EXPOSE 8080

# Simple health check (no curl dependency required)
HEALTHCHECK --interval=60s --timeout=10s --start-period=120s --retries=2 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if(r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Start the application
CMD ["npm", "start"]
