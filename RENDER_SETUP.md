# Render Deployment Setup Guide

This guide provides step-by-step instructions for deploying the AI Browser Agent to Render.

## Step 1: Prepare Your Repository

Ensure your repository is up to date with all the necessary files:

- ✅ `Dockerfile` - Container configuration
- ✅ `render.yaml` - Render deployment configuration
- ✅ `.env.example` - Environment variables template
- ✅ `.dockerignore` - Docker build optimization
- ✅ `.gitignore` - Git ignore rules
- ✅ `package.json` - Dependencies
- ✅ `main.js` - Entry point

## Step 2: Create Render Account

1. Go to [Render.com](https://render.com)
2. Sign up or log in with your account
3. Connect your GitHub account

## Step 3: Create a New Web Service

1. Click **"New +"** button
2. Select **"Web Service"**
3. Select your GitHub repository (`ai-browser-agent-node`)
4. Click **"Connect"**

## Step 4: Configure Service Settings

### Basic Settings

| Setting | Value |
|---------|-------|
| **Name** | `ai-browser-agent` |
| **Environment** | `Node` |
| **Region** | Choose closest to your users |
| **Branch** | `main` or `master` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

### Plan Selection

- **Free Plan**: Limited resources, suitable for testing
- **Standard Plan**: Recommended for production (required for Playwright)
- **Pro Plan**: High performance, recommended for heavy usage

**Note**: Playwright requires at least Standard plan due to system dependencies.

## Step 5: Add Environment Variables

In the Render dashboard, add the following environment variables:

| Key | Value | Type |
|-----|-------|------|
| `NODE_ENV` | `production` | Fixed |
| `PORT` | `10000` | Fixed |
| `LOG_LEVEL` | `info` | Fixed |
| `BROWSER_TIMEOUT` | `30000` | Fixed |
| `MAX_CONCURRENT_TASKS` | `5` | Fixed |
| `MEMORY_BACKEND` | `memory` | Fixed |
| `GITHUB_TOKEN` | Your GitHub token | Secret |
| `DEEPSEEK_API_KEY` | Your DeepSeek API key | Secret |
| `RENDER_API_KEY` | Your Render API key | Secret |

### How to Add Environment Variables

1. Scroll to **"Environment"** section
2. Click **"Add Environment Variable"**
3. Enter the key and value
4. For sensitive values, mark as **"Secret"**
5. Click **"Save"**

## Step 6: Configure Health Check (Optional)

1. Scroll to **"Health Check"** section
2. Set **"Health Check Path"**: `/health`
3. Set **"Health Check Interval"**: `30` seconds
4. Set **"Health Check Timeout"**: `10` seconds
5. Set **"Start Period"**: `5` seconds
6. Set **"Retries"**: `3`

## Step 7: Deploy

1. Click **"Create Web Service"**
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Build the Docker image
   - Start the service

3. Monitor the deployment in the **"Logs"** tab

## Step 8: Verify Deployment

Once deployment is complete:

1. Get your service URL from the Render dashboard
2. Test the health check:
   ```bash
   curl https://your-service-url.onrender.com/health
   ```

3. Access the dashboard:
   ```
   https://your-service-url.onrender.com
   ```

## Step 9: Setup Automatic Deployments (Optional)

### Option A: Auto-Deploy on Push

1. In Render dashboard, go to your service
2. Click **"Settings"**
3. Enable **"Auto-Deploy"**
4. Select **"Yes"** for "Auto-Deploy on Push"

### Option B: Use GitHub Actions

1. In your GitHub repository, go to **Settings** > **Secrets and variables** > **Actions**
2. Add the following secrets:
   - `RENDER_SERVICE_ID`: Found in Render service URL
   - `RENDER_API_KEY`: Your Render API key

3. The workflow in `.github/workflows/deploy.yml` will automatically deploy on push to main

## Troubleshooting

### Deployment Fails During Build

**Error**: `npm install` fails

**Solution**:
- Check `package.json` for syntax errors
- Ensure all dependencies are listed
- Try building locally first: `npm install`

### Playwright Installation Fails

**Error**: Missing system dependencies

**Solution**:
- Ensure you're using **Standard plan or higher**
- Check Dockerfile includes `playwright install-deps`
- Review logs for specific missing libraries

### Service Won't Start

**Error**: Port binding error or startup timeout

**Solution**:
- Verify `PORT` environment variable is set to `10000`
- Check `main.js` starts the server correctly
- Review logs for error messages
- Increase startup timeout in health check settings

### Health Check Failing

**Error**: Health check endpoint returns 500

**Solution**:
- Verify `/health` endpoint is implemented
- Check server is listening on correct port
- Review application logs
- Increase health check timeout

### Out of Memory

**Error**: Service crashes with memory error

**Solution**:
- Upgrade to higher plan
- Reduce `MAX_CONCURRENT_TASKS`
- Change `MEMORY_BACKEND` to `sqlite`
- Monitor memory usage in logs

## Monitoring and Logs

### View Logs

1. Go to your service in Render dashboard
2. Click **"Logs"** tab
3. View real-time logs
4. Use filters to find specific messages

### Common Log Messages

- `[INFO] AI Agent Platform Started` - Service started successfully
- `[ERROR] Failed to initialize browser` - Playwright issue
- `[WARNING] Playwright dependencies might be missing` - Install system dependencies

## Updating Your Application

### Deploy New Changes

1. Commit and push to your main branch:
   ```bash
   git add .
   git commit -m "Update application"
   git push origin main
   ```

2. If auto-deploy is enabled, Render will automatically redeploy
3. Monitor the deployment in the **"Logs"** tab

### Rollback to Previous Version

1. In Render dashboard, go to **"Settings"**
2. Click **"Deployments"**
3. Find the previous successful deployment
4. Click **"Redeploy"**

## Performance Tips

1. **Use Standard Plan or Higher**: Required for Playwright
2. **Enable Auto-Deploy**: Automatically deploy on push
3. **Monitor Logs**: Check for performance issues
4. **Optimize Concurrent Tasks**: Balance between performance and resources
5. **Use Persistent Disk**: For storing screenshots and downloads

## Security Best Practices

1. ✅ Never commit `.env` file - Use `.env.example`
2. ✅ Use Render's secret management for API keys
3. ✅ Rotate API keys regularly
4. ✅ Monitor logs for suspicious activity
5. ✅ Use HTTPS (automatically provided by Render)
6. ✅ Keep dependencies updated

## Additional Resources

- [Render Documentation](https://render.com/docs)
- [Node.js on Render](https://render.com/docs/deploy-node-express-app)
- [Environment Variables](https://render.com/docs/environment-variables)
- [Troubleshooting Guide](https://render.com/docs/troubleshooting)

## Support

For additional help:
- Check Render's [Status Page](https://status.render.com)
- Review [GitHub Issues](https://github.com/melsofany/ai-browser-agent-node/issues)
- Contact Render Support through dashboard
