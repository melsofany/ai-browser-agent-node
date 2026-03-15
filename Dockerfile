FROM node:22-bookworm-slim

WORKDIR /app

# Install dependencies including wget for model downloads
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl ca-certificates wget && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy application files
COPY . .

# Create directories for data and models
RUN mkdir -p /app/data /app/models/{llama,mistral,qwen}

# Download AI models (optional - can be skipped if models exist)
ENV USE_LOCAL_MODELS=true
ENV MODELS_PATH=/app/models
# Create a script to run both DB init and model download on startup
RUN echo '#!/bin/bash\n\n# Ensure data directory exists\nmkdir -p /app/data\n\n# Initialize DB\nnpm run init-db\n\n# Start model download in background if enabled\nif [ "$USE_LOCAL_MODELS" = "true" ]; then\n  echo "Starting model downloads in background..."\n  npm run download-models > /app/data/models_download.log 2>&1 &\nfi\n\n# Start the application\nexec npm start' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/app/data/app.db
ENV USE_LOCAL_MODELS=true
ENV MODELS_PATH=/app/models

EXPOSE 8080

# Health check
HEALTHCHECK --interval=60s --timeout=15s --start-period=180s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {if(r.statusCode !== 200) throw new Error(r.statusCode)})" || exit 1

# Start the application
ENTRYPOINT ["/app/entrypoint.sh"]
