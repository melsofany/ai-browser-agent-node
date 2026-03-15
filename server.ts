import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import initializeRoutes from './api/routes';
import TaskController from './controllers/taskController';
import config from './config/config';
import { database } from './database/db';
const IntegrationsManager = require('./agents/integrationsManager');

async function startServer() {
  // Initialize Integrations Manager
  // Priority: DeepSeek (cloud) → Ollama (local) → fallback
  const integrationsManager = new IntegrationsManager({
    activeProvider: process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'ollama',
    fallbackProviders: ['ollama', 'mistral', 'qwen'],
    llama: { modelName: process.env.OLLAMA_MODEL || 'llama2' },
    mistral: { apiKey: process.env.MISTRAL_API_KEY },
    qwen: { apiKey: process.env.QWEN_API_KEY },
    openInterpreter: { apiKey: process.env.OPENAI_API_KEY },
    autogpt: { apiKey: process.env.OPENAI_API_KEY },
    langgraph: { apiKey: process.env.OPENAI_API_KEY }
  });

  try {
    await integrationsManager.initialize();
    console.log(`[Server] Integrations Manager initialized (active: ${integrationsManager.activeProvider})`);
  } catch (error) {
    console.warn('[Server] Integrations Manager init warning:', error.message);
    // Continue even if integrations fail - app should work with graceful degradation
  }

  const app = express();
  const server = http.createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const taskController = new TaskController();

  // Setup task events for WebSocket
  taskController.on('taskUpdate', (update) => {
    io.emit('taskUpdate', update);
  });

  taskController.on('taskStart', (data) => {
    io.emit('taskStart', data);
  });

  taskController.on('taskSuccess', (data) => {
    io.emit('taskSuccess', data);
  });

  taskController.on('taskFail', (data) => {
    io.emit('taskFail', data);
  });

  taskController.on('log', (log) => {
    io.emit('log', log);
  });

  taskController.on('thinking', (content) => {
    io.emit('thinking', {
      timestamp: new Date(),
      content
    });
  });

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  const routes = initializeRoutes(taskController, io);
  app.use('/api', routes);

  // Health check
  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/', (req, res) => res.json({ message: 'AI Agent Platform running' }));

  // Integrations Health Check Route
  app.get('/api/integrations/health', async (req, res) => {
    try {
      const health = await integrationsManager.healthCheck();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Integrations Capabilities Route
  app.get('/api/integrations/capabilities', (req, res) => {
    try {
      const capabilities = integrationsManager.getAllCapabilities();
      res.json(capabilities);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // WebSocket connections
  io.on('connection', (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    socket.on('browserEvent', async (event) => {
      await taskController.handleBrowserEvent(event);
    });

    socket.emit('connected', {
      message: 'Connected to AI Agent Platform',
      timestamp: new Date(),
    });

    socket.on('submitTask', async (taskData) => {
      try {
        const result = await taskController.submitTask(taskData);
        socket.emit('taskSubmitted', result);
        io.emit('taskUpdate', { type: 'submitted', ...result });
      } catch (error: any) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('executeTask', async (taskId) => {
      try {
        const result = await taskController.executeTask(taskId);
        socket.emit('taskExecuted', { taskId, ...result });
        io.emit('taskUpdate', { type: 'executed', taskId, ...result });
      } catch (error: any) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('resumeTask', async (taskId) => {
      try {
        const result = await taskController.resumeTask(taskId);
        socket.emit('taskResumed', { taskId, ...result });
        io.emit('taskUpdate', { type: 'resumed', taskId, ...result });
      } catch (error: any) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('triggerSelfImprovement', async () => {
      try {
        const result = await taskController.triggerSelfImprovement();
        socket.emit('selfImprovementTriggered', result);
      } catch (error: any) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('getStatus', () => {
      const tasks = taskController.getAllTasks();
      const logs = taskController.getLogs(10);
      socket.emit('status', { tasks, logs, timestamp: new Date() });
    });

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = parseInt(process.env.PORT || '5000', 10);
  
  const listenWithRetry = (port: number, maxRetries: number = 3) => {
    return new Promise<void>((resolve, reject) => {
      server.listen(port, '0.0.0.0', () => {
        console.log(`\n========================================`);
        console.log(`AI Agent Platform Started`);
        console.log(`========================================`);
        console.log(`Server running on http://0.0.0.0:${port}`);
        console.log(`========================================\n`);
        resolve();
      }).on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && maxRetries > 0) {
          console.warn(`[Server] Port ${port} in use, trying ${port + 1}...`);
          server.close();
          listenWithRetry(port + 1, maxRetries - 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  };

  try {
    await listenWithRetry(PORT);
  } catch (err) {
    console.error('[Server] Failed to bind port:', err);
    process.exit(1);
  }

  // Initialize browser in background with timeout to avoid blocking startup
  const browserInitTimeout = setTimeout(() => {
    console.warn('[Server] Browser init timeout - continuing without browser');
  }, 30000);

  taskController.initializeBrowser(io).catch(error => {
    console.warn('[Server] Browser init skipped:', error.message);
  }).finally(() => {
    clearTimeout(browserInitTimeout);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down gracefully...');
    server.close(() => {
      console.log('[Server] Server closed');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[Server] Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer().catch(err => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
