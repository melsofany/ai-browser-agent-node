/**
 * Express Server
 * Main API server with Socket.io for real-time communication
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const initializeRoutes = require('./routes');
const TaskController = require('../controllers/taskController');
const config = require('../config/config');

class Server {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });
    this.taskController = new TaskController();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupTaskEvents();
  }

  /**
   * Setup event listeners for task updates
   */
  setupTaskEvents() {
    // Broadcast task updates to all clients
    this.taskController.on('taskUpdate', (update) => {
      this.io.emit('taskUpdate', update);
    });

    // Broadcast logs to all clients
    this.taskController.on('log', (log) => {
      this.io.emit('log', log);
    });

    // Broadcast thinking logs to all clients
    this.taskController.on('thinking', (content) => {
      this.io.emit('thinking', {
        timestamp: new Date(),
        content
      });
    });
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static(path.join(__dirname, '../ui')));

    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    // Request logging middleware
    this.app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    const routes = initializeRoutes(this.taskController, this.io);
    this.app.use('/api', routes);

    // Serve dashboard
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../ui/index.html'));
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date() });
    });
  }

  /**
   * Setup WebSocket connections
   */
  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      // Handle remote browser events
      socket.on('browserEvent', async (event) => {
        await this.taskController.handleBrowserEvent(event);
      });

      // Send initial status
      socket.emit('connected', {
        message: 'Connected to CortexFlow AI Agent',
        timestamp: new Date(),
      });

      // Handle task submission via WebSocket
      socket.on('submitTask', async (taskData) => {
        try {
          const result = await this.taskController.submitTask(taskData);
          socket.emit('taskSubmitted', result);
          this.io.emit('taskUpdate', {
            type: 'submitted',
            ...result,
          });
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle task execution via WebSocket
      socket.on('executeTask', async (taskId) => {
        try {
          const result = await this.taskController.executeTask(taskId);
          socket.emit('taskExecuted', { taskId, ...result });
          this.io.emit('taskUpdate', {
            type: 'executed',
            taskId,
            ...result,
          });
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle task resume via WebSocket
      socket.on('resumeTask', async (taskId) => {
        try {
          const result = await this.taskController.resumeTask(taskId);
          socket.emit('taskResumed', { taskId, ...result });
          this.io.emit('taskUpdate', {
            type: 'resumed',
            taskId,
            ...result,
          });
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle get status request
      socket.on('getStatus', () => {
        const tasks = this.taskController.getAllTasks();
        const logs = this.taskController.getLogs(10);
        socket.emit('status', {
          tasks,
          logs,
          timestamp: new Date(),
        });
      });

      // Handle cancel task request
      socket.on('cancelTask', async (taskId) => {
        try {
          const result = await this.taskController.cancelTask(taskId);
          socket.emit('taskCanceled', { taskId, ...result });
          this.io.emit('taskUpdate', {
            type: 'canceled',
            taskId,
            ...result,
          });
        } catch (error) {
          socket.emit('error', { message: error.message });
        }
      });

      // Handle get logs request
      socket.on('getLogs', (limit = 100) => {
        const logs = this.taskController.getLogs(limit);
        socket.emit('logs', logs);
      });

      // Send initial logs
      const logs = this.taskController.getLogs(50);
      socket.emit('logs', logs);

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Start the server
   */
  async start() {
    try {
      // Initialize browser
      await this.taskController.initializeBrowser(this.io);

      // Start listening
      this.server.listen(config.port, () => {
        console.log(`\n========================================`);
        console.log(`CortexFlow AI Agent Started`);
        console.log(`========================================`);
        console.log(`Server running on port ${config.port}`);
        console.log(`Environment: ${config.nodeEnv}`);
        console.log(`Dashboard: http://localhost:${config.port}`);
        console.log(`API: http://localhost:${config.port}/api`);
        console.log(`========================================\n`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Stop the server
   */
  async stop() {
    console.log('Stopping server...');
    await this.taskController.cleanup();
    this.server.close();
  }

  /**
   * Get the Express app
   */
  getApp() {
    return this.app;
  }

  /**
   * Get the Socket.io instance
   */
  getIO() {
    return this.io;
  }
}

module.exports = Server;
