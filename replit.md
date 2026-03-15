# AI Browser Agent Platform

## Overview
A full-stack autonomous AI agent platform with a React frontend and Express/Socket.io backend. The agent can browse the web, fill forms, research topics, and execute complex tasks. Supports both cloud AI (DeepSeek) and local AI (Ollama with Llama/Mistral/Qwen/DeepSeek-R1).

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Express + Socket.io (real-time WebSocket communication)
- **Both served from a single server** on port 5000 (Vite middleware in dev mode)
- **Entry point**: `server.ts` (run via `tsx`)

## Project Structure
- `server.ts` - Main server entry (Express + Vite middleware + Socket.io)
- `src/` - React frontend (App.tsx, main.tsx, index.css)
- `api/` - Express routes and server class
- `agents/` - AI agent implementations:
  - `reactLoop.js` - Core ReAct loop (Observe→Think→Plan→Act→Verify)
  - `plannerAgent.js` - High-level goal → plan breakdown
  - `browserAgent.js` - Playwright browser control
  - `memorySystem.js` - SQLite + vector memory
  - `toolRouter.js` - Tool routing (browser/terminal/filesystem/search/code)
  - `ollamaIntegration.js` - Local AI via Ollama
  - `integrationsManager.js` - Unified AI provider manager
  - `thinkingAgent.js` - Thinking logs display
  - `visionNavigator.js` - Visual element analysis
- `config/config.js` - App configuration
- `integrations/` - Full source copies + local model integrations:
  - `langgraph/` - LangGraph source (StateGraph, channels, checkpointing)
  - `open-interpreter/` - Open Interpreter source (tools, computer-use loop)
  - `autogpt/` - AutoGPT classic + platform source

## Integration Modules (agents/)
- `langgraphIntegration.js` - StateGraph, RetryPolicy, Checkpointing, Streaming, ReAct agent builder
- `openInterpreterIntegration.js` - ToolCollection, BashTool, EditTool, JS/Python tools, SamplingLoop
- `autogptIntegration.js` - Block system, BlockType/Category, AgentGraph, AgentMemory, TaskManager, SelfImprovement

## Running the App
```bash
PORT=5000 npm run dev
```

## AI Model Priority
1. **DeepSeek** (cloud) - if `DEEPSEEK_API_KEY` is set
2. **Ollama** (local) - if Ollama is running at `OLLAMA_URL`
3. **Rule-based fallback** - no AI required for basic tasks

## Environment Variables
```
DEEPSEEK_API_KEY=     # Cloud AI (primary)
OLLAMA_URL=http://localhost:11434  # Local AI server
OLLAMA_MODEL=llama3   # Model to use (llama3, mistral, qwen2, deepseek-r1...)
USE_LOCAL_MODELS=true
MEMORY_BACKEND=sqlite  # 'memory' or 'sqlite'
GITHUB_TOKEN=          # For GitHub push
```

## Key Technical Decisions
- **Accessibility Tree only** (not full DOM) sent to AI → reduces tokens by ~90%
- Tree limited to 3000 chars, interactive elements limited to 25 per request
- `callAI()` helper in reactLoop + plannerAgent tries DeepSeek first, then Ollama
- Memory: SQLite for persistence, keyword-based vector search fallback

## Browser Agent
Uses Playwright (Chromium) with stealth plugin. Two-layer initialization:
1. Playwright bundled Chromium (primary)
2. System Chromium fallback (for NixOS/Replit)

## Bug Fixes Applied
- Fixed syntax error in `reactLoop.js` constructor (extra closing brace)
- Removed full DOM/outerHTML from AI context (was causing 100k+ token issues)
- Removed Gemini dependency entirely
- Added Ollama integration for local model support
- Unified AI call with DeepSeek→Ollama→fallback chain

## Deployment
Configured as `vm` deployment:
- Build: `npm run build`
- Run: `PORT=5000 NODE_ENV=production npm start`
