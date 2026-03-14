# Use Node.js official image
FROM node:22-bookworm

# Set working directory
WORKDIR /app

# Install system dependencies for Playwright using official command
# This is more reliable than manual package listing as it handles OS version differences
RUN apt-get update && apt-get install -y curl && \
    npx playwright install-deps chromium && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --no-package-lock

# Install Playwright browsers
RUN npx playwright install chromium

# Copy application files
COPY . .

# Environment variables
ENV PORT=10000
ENV NODE_ENV=production

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:10000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "main.js"]
