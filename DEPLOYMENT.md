# Deployment Guide - الحل الجذري

**المشكلة:** Render timeout عند البناء
**الحل:** استخدام Vercel أو Railway (أسرع 10x)

## الخيارات السريعة:

### 🚀 الخيار 1: Vercel (الأسرع - يوصى به)
```bash
npm install -g vercel
vercel login
vercel
```
- البناء: < 60 ثانية
- URL: https://ai-browser-agent-xxx.vercel.app

### 🚀 الخيار 2: Railway.app
1. أدخل https://railway.app
2. "New Project" → GitHub
3. اختر المستودع
4. Deploy تلقائي

### 🚀 الخيار 3: Fly.io
```bash
npm install -g flyctl
fly auth login
fly launch && fly deploy
```

## المتغيرات المطلوبة

أضف في البيئة السحابية:
```
GITHUB_TOKEN=your_token
DEEPSEEK_API_KEY=optional
PORT=3000 (Vercel) أو 8080 (Railway) أو auto (Fly.io)
NODE_ENV=production
USE_LOCAL_MODELS=false
```

## التكاملات المحفوظة ✅

- ✅ LangGraph (StateGraph, ReAct agents)
- ✅ Open Interpreter (bash, edit, js, python)
- ✅ AutoGPT (Block-based, Think→Plan→Act)
- ✅ Browser automation (Chromium/Playwright)
- ✅ جميع الـ APIs والـ endpoints

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
