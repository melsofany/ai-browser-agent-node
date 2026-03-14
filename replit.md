# AI Browser Agent Platform

## Overview
A full-stack AI agent platform with a React frontend and Express/Socket.io backend. The app allows users to submit tasks to an AI browser agent that can browse the web, research topics, and execute complex tasks.

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express + Socket.io (real-time WebSocket communication)
- **Both served from a single server** on port 5000 (Vite middleware in dev mode)
- **Entry point**: `server.ts` (run via `tsx`)

## Project Structure
- `server.ts` - Main server entry (Express + Vite middleware + Socket.io)
- `src/` - React frontend (App.tsx, main.tsx, index.css)
- `api/` - Express routes and server class
- `agents/` - AI agent implementations (browser, memory, planning, etc.)
- `controllers/` - Task controller
- `config/config.js` - App configuration
- `integrations/` - External AI model integrations (Llama, Mistral, Qwen)
- `models/` - Local model weights directory (not included, must be downloaded)

## Running the App
```bash
PORT=5000 npm run dev
```

The workflow "Start application" is configured to run this automatically.

## Key Configuration
- Port: **5000** (set via `PORT` env var or defaults in `config/config.js`)
- Vite config (`vite.config.ts`): `allowedHosts: true`, `host: '0.0.0.0'` for Replit proxy
- Vite watches ignore `.local/`, `.cache/`, `node_modules/`, `models/` directories

## Environment Variables
Required (set in Secrets):
- `GEMINI_API_KEY` - For Gemini AI features
- `DEEPSEEK_API_KEY` - Optional DeepSeek API
- `OPENAI_API_KEY` - For OpenAI-based integrations
- `GITHUB_TOKEN` - For GitHub push functionality

## Browser Agent
Uses Playwright (Chromium). Browser initialization happens in background and may fail in some environments without system libraries. The server still runs normally even if browser init fails.

System libraries installed for Playwright: glib, nss, nspr, atk, at-spi2-atk, cups, libdrm, X11 libs, mesa, expat, libxkbcommon, alsa-lib.

## Deployment
Configured as `vm` deployment (needs persistent state for WebSocket + browser agent):
- Build: `npm run build`
- Run: `PORT=5000 NODE_ENV=production npm start`
