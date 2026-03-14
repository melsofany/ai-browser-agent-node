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
- `DEEPSEEK_API_KEY` - Primary AI model for planning and reasoning
- `OPENAI_API_KEY` - For OpenAI-based integrations
- `GITHUB_TOKEN` - For GitHub push functionality

## Browser Agent
Uses Playwright (Chromium) with stealth plugin. Has two-layer initialization:
1. First tries the Playwright bundled Chromium
2. Falls back to system Chromium (auto-detected via `which chromium` or common paths)

System libraries installed for Playwright: glib, nss, nspr, atk, at-spi2-atk, cups, libdrm, X11 libs, mesa, libgbm, expat, libxkbcommon, alsa-lib, chromium (system package).

## Bug Fixes Applied
- Added missing `getObservation()` method to `BrowserAgent` (was called by `ReActLoop` but didn't exist)
- Fixed `getAccessibilityTree()` to use `page.ariaSnapshot()` (Playwright v1.46+ API) instead of removed `page.accessibility.snapshot()`
- Added browser initialization fallback to system Chromium for NixOS/Replit environment
- Removed Gemini (Google AI) dependency - media tools now return a disabled message

## Deployment
Configured as `vm` deployment (needs persistent state for WebSocket + browser agent):
- Build: `npm run build`
- Run: `PORT=5000 NODE_ENV=production npm start`
