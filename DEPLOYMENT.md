# Deployment Guide

This guide provides instructions for deploying the AI Browser Agent to various platforms.

## Prerequisites

- Node.js 22 or higher
- Docker (for containerized deployment)
- Git
- API keys for required services (GitHub, DeepSeek, Render)

## Environment Variables

Before deploying, ensure you have the following environment variables configured:

```bash
# Server Configuration
PORT=10000
NODE_ENV=production

# API Keys and Tokens
GITHUB_TOKEN=your_github_token_here
DEEPSEEK_API_KEY=your_deepseek_api_key_here
RENDER_API_KEY=your_render_api_key_here

# Logging Configuration
LOG_LEVEL=info

# Browser Configuration
BROWSER_TIMEOUT=30000

# Task Configuration
MAX_CONCURRENT_TASKS=5

# Memory Backend Configuration
MEMORY_BACKEND=memory
```

## Deployment to Render

### Method 1: Using Render Dashboard

1. **Connect Your Repository**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" and select "Web Service"
   - Connect your GitHub repository
   - Select the `ai-browser-agent-node` repository

2. **Configure Service**
   - **Name**: `ai-browser-agent`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Standard or higher (required for Playwright)

3. **Set Environment Variables**
   - Add all environment variables from the `.env.example` file
   - Ensure `GITHUB_TOKEN`, `DEEPSEEK_API_KEY`, and `RENDER_API_KEY` are set

4. **Deploy**
   - Click "Create Web Service"
   - Render will automatically build and deploy your application

### Method 2: Using render.yaml

The project includes a `render.yaml` file that defines the deployment configuration:

```bash
git push origin main
```

Render will automatically detect the `render.yaml` file and deploy accordingly.

### Method 3: Using GitHub Actions (Automated)

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) for automated deployment:

1. **Add GitHub Secrets**
   - Go to your GitHub repository settings
   - Navigate to "Secrets and variables" > "Actions"
   - Add the following secrets:
     - `RENDER_SERVICE_ID`: Your Render service ID
     - `RENDER_API_KEY`: Your Render API key

2. **Push to Main Branch**
   ```bash
   git push origin main
   ```

3. **Automatic Deployment**
   - GitHub Actions will automatically trigger the deployment workflow
   - Monitor the deployment in the "Actions" tab

## Docker Deployment

### Build Docker Image

```bash
docker build -t ai-browser-agent:latest .
```

### Run Docker Container

```bash
docker run -p 10000:10000 \
  -e GITHUB_TOKEN=your_token \
  -e DEEPSEEK_API_KEY=your_key \
  -e RENDER_API_KEY=your_key \
  ai-browser-agent:latest
```

### Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  ai-browser-agent:
    build: .
    ports:
      - "10000:10000"
    environment:
      - NODE_ENV=production
      - PORT=10000
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
      - RENDER_API_KEY=${RENDER_API_KEY}
    restart: unless-stopped
```

Run with:
```bash
docker-compose up -d
```

## Local Development

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your values
nano .env
```

### Run Development Server

```bash
npm run dev
```

The server will start on `http://localhost:10000`

### Access Dashboard

- Dashboard: `http://localhost:10000`
- API: `http://localhost:10000/api`
- Health Check: `http://localhost:10000/health`

## Troubleshooting

### Playwright Installation Issues

If you encounter issues with Playwright installation during deployment:

1. Ensure the Dockerfile includes the `playwright install-deps` command
2. Check that the base image is `node:22-slim` or compatible
3. Verify that all system dependencies are installed

### Port Issues

- Ensure port 10000 is available
- For Render, the port is automatically configured
- For local development, you can change the PORT environment variable

### Browser Initialization Errors

- Check that Playwright is properly installed
- Verify that system dependencies for Chromium are available
- Review logs for specific error messages

### Memory Issues

- Increase the allocated memory for the container
- Reduce `MAX_CONCURRENT_TASKS` if needed
- Monitor memory usage in production

## Monitoring

### Health Check

The application includes a health check endpoint:

```bash
curl http://localhost:10000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-03-13T10:30:00.000Z"
}
```

### Logs

View logs in Render Dashboard:
1. Go to your service
2. Click "Logs"
3. Filter by date and level as needed

## Security Considerations

1. **Never commit `.env` files** - Use `.env.example` as a template
2. **Rotate API keys regularly** - Update tokens in Render dashboard
3. **Use HTTPS** - Render provides free SSL/TLS certificates
4. **Monitor logs** - Check for suspicious activity
5. **Limit concurrent tasks** - Set `MAX_CONCURRENT_TASKS` appropriately

## Performance Optimization

1. **Browser Timeout**: Adjust `BROWSER_TIMEOUT` based on your needs
2. **Memory Backend**: Consider using SQLite for persistent memory
3. **Concurrent Tasks**: Balance between performance and resource usage
4. **Logging Level**: Set to `warn` or `error` in production for better performance

## Support

For issues or questions:
1. Check the logs in Render Dashboard
2. Review the `DEVELOPMENT_GUIDE.md` for technical details
3. Check GitHub Issues for known problems
4. Contact support with detailed error messages and logs
