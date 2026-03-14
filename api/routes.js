/**
 * API Routes
 * Defines all API endpoints for the agent platform
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with task controller
 */
function initializeRoutes(taskController, io) {
  /**
   * POST /api/task
   * Submit a new task
   */
  router.post('/task', async (req, res) => {
    try {
      const { description, type, url, actions, commands, operations, priority } = req.body;

      if (!description || !type) {
        return res.status(400).json({
          error: 'Missing required fields: description, type',
        });
      }

      const result = await taskController.submitTask({
        description,
        type,
        url,
        actions,
        commands,
        operations,
        priority,
      });

      // Emit task submitted event to all connected clients
      io.emit('taskSubmitted', result);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/task/:taskId/execute
   * Execute a submitted task
   */
  router.post('/task/:taskId/execute', async (req, res) => {
    try {
      const { taskId } = req.params;
      const result = await taskController.executeTask(taskId);

      // Emit task execution event
      io.emit('taskExecuted', { taskId, ...result });

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/task/:taskId/status
   * Get task status
   */
  router.get('/task/:taskId/status', (req, res) => {
    try {
      const { taskId } = req.params;
      const status = taskController.getTaskStatus(taskId);

      if (status.error) {
        return res.status(404).json(status);
      }

      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/tasks
   * Get all tasks
   */
  router.get('/tasks', (req, res) => {
    try {
      const tasks = taskController.getAllTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/logs
   * Get system logs
   */
  router.get('/logs', (req, res) => {
    try {
      const { limit = 100 } = req.query;
      const logs = taskController.getLogs(parseInt(limit));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/status
   * Get system status
   */
  router.get('/status', (req, res) => {
    try {
      const tasks = taskController.getAllTasks();
      const logs = taskController.getLogs(10);

      res.json({
        status: 'running',
        timestamp: new Date(),
        tasks: {
          total: tasks.length,
          byStatus: tasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
            return acc;
          }, {}),
        },
        recentLogs: logs,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/browser/navigate
   * Navigate to a URL
   */
  router.post('/browser/navigate', async (req, res) => {
    try {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({ error: 'Missing required field: url' });
      }

      const result = await taskController.browser.navigate(url);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/browser/click
   * Click an element
   */
  router.post('/browser/click', async (req, res) => {
    try {
      const { selector } = req.body;

      if (!selector) {
        return res.status(400).json({ error: 'Missing required field: selector' });
      }

      const result = await taskController.browser.click(selector);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/browser/type
   * Type text into an element
   */
  router.post('/browser/type', async (req, res) => {
    try {
      const { selector, text } = req.body;

      if (!selector || !text) {
        return res.status(400).json({
          error: 'Missing required fields: selector, text',
        });
      }

      const result = await taskController.browser.type(selector, text);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/browser/extract
   * Extract page content
   */
  router.get('/browser/extract', async (req, res) => {
    try {
      const result = await taskController.browser.extractContent();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/browser/screenshot
   * Take a screenshot
   */
  router.post('/browser/screenshot', async (req, res) => {
    try {
      const { filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: 'Missing required field: filePath' });
      }

      const result = await taskController.browser.screenshot(filePath);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/push
   * Push changes to GitHub
   */
  router.post('/push', async (req, res) => {
    try {
      const { execSync } = require('child_process');
      console.log('Starting GitHub push via API...');
      const output = execSync('npx tsx push_to_github.ts').toString();
      res.json({ success: true, output });
    } catch (error) {
      console.error('Push failed:', error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message,
        output: error.stdout ? error.stdout.toString() : '',
        stderr: error.stderr ? error.stderr.toString() : ''
      });
    }
  });

  return router;
}

module.exports = initializeRoutes;
