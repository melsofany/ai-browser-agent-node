/**
 * Task Controller
 * Manages task lifecycle and coordinates between agents
 */

const { v4: uuidv4 } = require('uuid');
const PlannerAgent = require('../agents/plannerAgent');
const ExecutionAgent = require('../agents/executionAgent');
const BrowserAgent = require('../agents/browserAgent');
const ThinkingAgent = require('../agents/thinkingAgent');
const ReActLoop = require('../agents/reactLoop');
const SelfImprovementAgent = require('../agents/selfImprovementAgent');
const EventEmitter = require('events');

class TaskController extends EventEmitter {
  constructor() {
    super();
    this.planner = new PlannerAgent();
    this.executor = new ExecutionAgent();
    this.browser = new BrowserAgent();
    this.thinking = new ThinkingAgent();
    this.selfImprovement = new SelfImprovementAgent(this.planner.memory);
    this.tasks = new Map();
    this.logs = [];

    // Forward thinking logs
    this.thinking.on('thinking', (log) => {
      this.emit('thinking', log.content);
    });
  }

  /**
   * Initialize browser
   */
  async initializeBrowser(io = null) {
    const result = await this.browser.initialize(io);
    if (result.success) {
      // Open a default page so the user can see something immediately
      await this.browser.openPage('default');
      await this.browser.navigate('https://www.google.com', 'default');
    }
    return result;
  }

  /**
   * Handle remote browser events
   */
  async handleBrowserEvent(event) {
    const { type, pageId = 'default', params } = event;
    
    // Safety check for browser initialization
    if (!this.browser.browser) {
      this.log('Browser not initialized, cannot handle event', 'error');
      return;
    }

    const pageData = this.browser.pages.get(pageId);
    if (!pageData || !pageData.page) {
      this.log(`Page ${pageId} not found, cannot handle event`, 'error');
      return;
    }

    const { page } = pageData;
    try {
      switch (type) {
        case 'click':
          await page.mouse.click(params.x, params.y);
          break;
        case 'dblclick':
          await page.mouse.dblclick(params.x, params.y);
          break;
        case 'move':
          await page.mouse.move(params.x, params.y);
          break;
        case 'keydown':
          await page.keyboard.down(params.key);
          break;
        case 'keyup':
          await page.keyboard.up(params.key);
          break;
        case 'type':
          await page.keyboard.type(params.text);
          break;
        case 'wheel':
          await page.mouse.wheel(params.deltaX, params.deltaY);
          break;
        case 'reload':
          await page.reload({ waitUntil: 'networkidle' });
          break;
        case 'navigate':
          await page.goto(params.url, { waitUntil: 'networkidle' });
          break;
      }
    } catch (err) {
      console.error(`[TaskController] Failed to handle browser event ${type}:`, err);
    }
  }

  /**
   * Trigger a self-improvement audit
   */
  async triggerSelfImprovement() {
    this.log('Starting self-improvement audit...', 'info');
    const proposal = await this.selfImprovement.proposeSelfDevelopment();
    
    if (proposal && proposal.title) {
      this.log(`Self-improvement proposal: ${proposal.title}`, 'info');
      
      // Create a task for this proposal
      const task = await this.submitTask({
        description: `Self-Development: ${proposal.title} - ${proposal.description}`,
        type: 'self-improvement',
        priority: proposal.priority || 'normal'
      });
      
      return { success: true, task, proposal };
    }
    
    return { success: false, message: 'No improvement opportunities identified.' };
  }

  /**
   * Submit a new task
   */
  async submitTask(taskData) {
    const taskId = uuidv4();
    const task = {
      id: taskId,
      ...taskData,
      status: 'submitted',
      createdAt: new Date(),
    };

    this.tasks.set(taskId, task);
    this.log(`Task submitted: ${taskId} - ${taskData.description}`);

    // Generate thinking logs
    try {
      this.log(`Analyzing task: ${taskData.description}`, 'debug');
      await this.thinking.generateThinking(taskData.description, taskData.type);
    } catch (error) {
      this.log(`Thinking generation failed: ${error.message}`, 'warning');
    }

    // Plan the task (now async)
    try {
      const plan = await this.planner.planTask(task);
      task.plan = plan;
      task.status = 'planned';
      
      // Auto-execute the task after planning
      this.executeTask(taskId).catch(err => {
        this.log(`Auto-execution failed for task ${taskId}: ${err.message}`, 'error');
      });
      
      return { taskId, plan };
    } catch (error) {
      this.log(`Planning failed: ${error.message}`, 'error');
      task.status = 'failed';
      task.error = error.message;
      throw error;
    }
  }

  /**
   * Resume a task from waiting state
   */
  async resumeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'awaiting_user') {
      return { success: false, error: 'Task not in waiting state' };
    }

    this.log(`Resuming task: ${taskId}`);
    task.status = 'executing';
    task.currentStepIndex++; // Move to the next step after waiting
    return this.executeTask(taskId);
  }

  /**
   * Execute a task (runs in background)
   */
  async executeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status === 'executing') {
      return { success: true, taskId, message: 'Task already executing' };
    }

    task.status = 'executing';
    this.log(`Executing task: ${taskId}`);
    this.emit('taskStart', { taskId, description: task.description });

    // Run execution in background without awaiting the whole process
    this._runTaskExecution(taskId).catch(err => {
      this.log(`Background execution error for task ${taskId}: ${err.message}`, 'error');
    });

    return { success: true, taskId, status: 'executing' };
  }

  /**
   * Internal method to run task execution loop
   * @private
   */
  async _runTaskExecution(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Use ReActLoop for autonomous browser tasks
    if (task.type === 'browser' && task.autonomous !== false) {
      this.log(`Starting autonomous execution for task: ${taskId}`);
      const taskLoop = new ReActLoop();
      try {
        // Forward progress events to UI
        taskLoop.on('progress', (data) => {
          this.emit('thinking', `[${data.step}] ${data.message}`);
        });
        
        taskLoop.on('iteration', (data) => {
          const isArabic = /[\u0600-\u06FF]/.test(task.description);
          const message = isArabic 
            ? `--- التكرار ${data.iteration}/${data.maxIterations} ---`
            : `--- Iteration ${data.iteration}/${data.maxIterations} ---`;
          this.emit('thinking', message);
        });

        const report = await taskLoop.executeTask(task, this.browser, this.executor);
        task.results = report.results;
        task.status = report.success ? 'completed' : 'failed';
        task.error = report.errors.join(', ');
        
        if (report.success) {
          this.emit('taskSuccess', { taskId });
        } else {
          this.emit('taskFail', { taskId, error: task.error });
        }
        this.emit('taskUpdate', { type: 'status_change', taskId, status: task.status });
        return;
      } catch (error) {
        this.log(`Autonomous execution failed: ${error.message}`, 'error');
        // Fallback to standard execution if autonomous fails
      }
    }

    // Generate initial execution thinking
    try {
      if (task.plan && task.plan.steps && task.plan.steps.length > 0 && (!task.currentStepIndex || task.currentStepIndex === 0)) {
        const firstStep = task.plan.steps[0];
        await this.thinking.generateExecutionThinking(firstStep, []);
      }
    } catch (error) {
      this.log(`Execution thinking failed: ${error.message}`, 'warning');
    }

    try {
      const startIndex = task.currentStepIndex || 0;
      task.results = task.results || [];

      if (!task.plan || !task.plan.steps || task.plan.steps.length === 0) {
        throw new Error('Task plan has no steps');
      }

      for (let i = startIndex; i < task.plan.steps.length; i++) {
        // Check if task was canceled
        if (task.status === 'canceled') {
          this.log(`Task ${taskId} execution stopped because it was canceled`);
          return;
        }

        const step = task.plan.steps[i];
        task.currentStepIndex = i;
        
        // Emit update for UI
        this.emit('taskUpdate', {
          type: 'step_start',
          taskId,
          stepIndex: i,
          stepDescription: step.description
        });

        this.log(`Executing step ${step.order}/${task.plan.steps.length}: ${step.description}`);

        // Generate thinking for this step
        try {
          await this.thinking.generateExecutionThinking(step, task.results || []);
        } catch (error) {
          // Non-critical
        }

        let result;

        if (step.action === 'browser:waitForUser') {
          this.log(`Task ${taskId} is waiting for user interaction`, 'warning');
          task.status = 'awaiting_user';
          this.emit('taskUpdate', { type: 'status_change', taskId, status: 'awaiting_user' });
          return;
        }

        try {
          if (step.action.startsWith('browser:')) {
            result = await this.executeBrowserStep(step);
          } else if (step.action.startsWith('system:')) {
            result = await this.executeSystemStep(step);
          } else if (step.action.startsWith('dev:')) {
            result = await this.executeDevelopmentStep(step);
          } else if (step.action.startsWith('error:')) {
            result = { success: false, error: step.description };
          } else {
            result = { success: false, error: `Unknown action: ${step.action}` };
          }
        } catch (stepError) {
          const errorMsg = stepError.message || stepError.toString();
          result = { success: false, error: errorMsg };
          this.log(`Step error details: ${errorMsg}`, 'error');
        }

        task.results.push(result);

        if (!result.success) {
          this.log(`Step failed: ${step.description} - ${result.error}`, 'error');
          task.status = 'failed';
          task.error = result.error;
          this.emit('taskUpdate', { type: 'status_change', taskId, status: 'failed', error: result.error });
          this.emit('taskFail', { taskId, error: result.error, stepIndex: i });
          return;
        }

        this.log(`Step completed: ${step.description}`);
        this.emit('taskUpdate', {
          type: 'step_complete',
          taskId,
          stepIndex: i,
          result
        });
      }

      task.status = 'completed';
      this.log(`Task completed successfully: ${taskId}`);
      this.emit('taskUpdate', { type: 'status_change', taskId, status: 'completed' });
      this.emit('taskSuccess', { taskId });
    } catch (error) {
      task.status = 'error';
      task.error = error.message;
      this.log(`Task error: ${error.message}`, 'error');
      this.emit('taskUpdate', { type: 'status_change', taskId, status: 'error', error: error.message });
      this.emit('taskFail', { taskId, error: error.message });
    }
  }

  /**
   * Execute browser step
   */
  async executeBrowserStep(step) {
    const { action, params } = step;
    const actionType = action.split(':')[1];

    switch (actionType) {
      case 'navigate':
        return this.browser.navigate(params.url);
      case 'click':
        return this.browser.click(params.selector);
      case 'type':
        return this.browser.type(params.selector, params.text);
      case 'submit':
        return this.browser.submitForm(params.selector);
      case 'extract':
        return this.browser.extractContent();
      case 'screenshot':
        return this.browser.screenshot(params.filePath);
      case 'download':
        return this.browser.downloadFile(params.downloadPath);
      default:
        return { success: false, error: `Unknown browser action: ${actionType}` };
    }
  }

  /**
   * Execute system step
   */
  async executeSystemStep(step) {
    const { action, params } = step;
    const actionType = action.split(':')[1];

    switch (actionType) {
      case 'execute':
        return this.executor.executeCommand(params.command);
      case 'createFile':
        return this.executor.createOrEditFile(params.filePath, params.content);
      case 'readFile':
        return this.executor.readFile(params.filePath);
      case 'installDependency':
        return this.executor.installDependency(params.packageName, params.options);
      case 'selfImprovement':
        return { success: true, message: 'Self-improvement analysis triggered' };
      default:
        return { success: false, error: `Unknown system action: ${actionType}` };
    }
  }

  /**
   * Execute development step
   */
  async executeDevelopmentStep(step) {
    const { action, params } = step;
    const actionType = action.split(':')[1];

    switch (actionType) {
      case 'clone':
        return this.executor.cloneRepository(params.repoUrl, params.targetDir);
      case 'git':
        return this.executor.gitOperation(params.operation, params);
      default:
        return { success: false, error: `Unknown development action: ${actionType}` };
    }
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { error: 'Task not found' };
    }

    return {
      taskId,
      status: task.status,
      description: task.description,
      createdAt: task.createdAt,
      results: task.results,
      error: task.error,
    };
  }

  /**
   * Get all tasks
   */
  getAllTasks() {
    const tasks = [];
    for (const [taskId, task] of this.tasks) {
      tasks.push({
        taskId,
        status: task.status,
        description: task.description,
        createdAt: task.createdAt,
      });
    }
    return tasks;
  }

  /**
   * Log a message
   */
  log(message, level = 'info') {
    const logEntry = {
      timestamp: new Date(),
      level,
      message,
    };
    this.logs.push(logEntry);
    console.log(`[${level.toUpperCase()}] ${message}`);
    
    // Emit log event for real-time updates
    this.emit('log', logEntry);
  }

  /**
   * Get logs
   */
  getLogs(limit = 100) {
    return this.logs.slice(-limit);
  }

  /**
   * Clear logs
   */
  clearLogs() {
    this.logs = [];
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    if (task.status === 'executing') {
      task.status = 'canceled';
      this.log(`Task canceled: ${taskId}`);
      return { success: true, taskId };
    } else if (task.status === 'planned' || task.status === 'submitted') {
      task.status = 'canceled';
      this.log(`Task canceled: ${taskId}`);
      return { success: true, taskId };
    } else {
      return { success: false, error: `Cannot cancel task in ${task.status} status` };
    }
  }

  /**
   * Get thinking logs
   */
  getThinkingLogs(limit = 50) {
    return this.thinking.getThinkingLogs(limit);
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    await this.browser.close();
  }
}

module.exports = TaskController;
