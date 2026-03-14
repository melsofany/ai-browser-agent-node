# Use Node.js official image with Python support
FROM node:22-bookworm

# Set working directory
WORKDIR /app

# Install system dependencies for Playwright and Python for local LLM inference
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    build-essential \
    && npx playwright install-deps chromium \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python libraries for local inference (llama-cpp-python, etc.)
# Note: This requires a high-RAM environment on Render
RUN pip3 install --no-cache-dir --break-system-packages \
    llama-cpp-python \
    numpy \
    pandas

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Build the UI
RUN npm run build

# Install Playwright browsers
RUN npx playwright install chromium

# Environment variables
ENV PORT=10000
ENV NODE_ENV=production
ENV LOCAL_ONLY_MODE=true

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:10000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Make scripts executable
RUN chmod +x /app/scripts/download_models.sh

# Start application with model download check
CMD ["/bin/bash", "-c", "/app/scripts/download_models.sh && npm start"]
