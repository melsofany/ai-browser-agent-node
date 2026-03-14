/**
 * Tool Router
 * Routes tasks to appropriate tools based on requirements
 * Manages browser, terminal, filesystem, search, and code execution tools
 */

const ToolManager = require('../tools/toolManager');

class ToolRouter {
  constructor(agents = {}) {
    this.toolManager = new ToolManager();
    this.agents = agents; // { browser, executor, etc. }
    this.routingRules = new Map();
    this.executionLog = [];
    this.setupDefaultTools();
    this.toolManager.loadPlugins(); // Load dynamic plugins
  }

  /**
   * Setup default tools
   */
  setupDefaultTools() {
    console.log('[ToolRouter] Setting up default tools');

    // Browser tools
    this.registerBrowserTools();
    
    // Terminal/System tools
    this.registerSystemTools();
    
    // Filesystem tools
    this.registerFilesystemTools();
    
    // Search tools
    this.registerSearchTools();
    
    // Code execution tools
    this.registerCodeExecutionTools();
  }

  /**
   * Register browser tools
   */
  registerBrowserTools() {
    const browserAgent = this.agents.browser;
    if (!browserAgent) return;

    this.toolManager.registerTool('browser:navigate', {
      description: 'Navigate to a URL in the browser',
      category: 'browser',
      parameters: {
        url: { type: 'string', required: true, description: 'URL to navigate to' },
        pageId: { type: 'string', required: false, description: 'Page ID' }
      },
      execute: async (params) => {
        return await browserAgent.navigate(params.url, params.pageId || 'default');
      }
    });

    this.toolManager.registerTool('browser:click', {
      description: 'Click an element on the page',
      category: 'browser',
      parameters: {
        selector: { type: 'string', required: true, description: 'CSS selector' },
        pageId: { type: 'string', required: false }
      },
      execute: async (params) => {
        return await browserAgent.click(params.selector, params.pageId || 'default');
      }
    });

    this.toolManager.registerTool('browser:type', {
      description: 'Type text into an element',
      category: 'browser',
      parameters: {
        selector: { type: 'string', required: true },
        text: { type: 'string', required: true },
        pageId: { type: 'string', required: false }
      },
      execute: async (params) => {
        return await browserAgent.type(params.selector, params.text, params.pageId || 'default');
      }
    });

    this.toolManager.registerTool('browser:extract', {
      description: 'Extract page content',
      category: 'browser',
      parameters: {
        pageId: { type: 'string', required: false }
      },
      execute: async (params) => {
        return await browserAgent.extractContent(params.pageId || 'default');
      }
    });

    this.toolManager.registerTool('browser:screenshot', {
      description: 'Take a screenshot',
      category: 'browser',
      parameters: {
        filePath: { type: 'string', required: true },
        pageId: { type: 'string', required: false }
      },
      execute: async (params) => {
        return await browserAgent.screenshot(params.filePath, params.pageId || 'default');
      }
    });

    this.toolManager.registerTool('browser:submit', {
      description: 'Submit a form',
      category: 'browser',
      parameters: {
        selector: { type: 'string', required: true },
        pageId: { type: 'string', required: false }
      },
      execute: async (params) => {
        return await browserAgent.submitForm(params.selector, params.pageId || 'default');
      }
    });

    this.toolManager.registerTool('browser:waitForSelector', {
      description: 'Wait for a selector to appear in the DOM',
      category: 'browser',
      parameters: {
        selector: { type: 'string', required: true, description: 'CSS selector' },
        timeout: { type: 'number', required: false, description: 'Timeout in milliseconds' },
        pageId: { type: 'string', required: false }
      },
      execute: async (params) => {
        return await browserAgent.waitForSelector(params.selector, params.timeout, params.pageId || 'default');
      }
    });

    this.toolManager.registerTool('browser:evaluate', {
      description: 'Execute JavaScript in the browser context',
      category: 'browser',
      parameters: {
        script: { type: 'string', required: true, description: 'JavaScript code to execute' },
        pageId: { type: 'string', required: false }
      },
      execute: async (params) => {
        return await browserAgent.evaluate(params.script, params.pageId || 'default');
      }
    });
  }

  /**
   * Register system/terminal tools
   */
  registerSystemTools() {
    const executor = this.agents.executor;
    if (!executor) return;

    this.toolManager.registerTool('system:execute', {
      description: 'Execute a system command',
      category: 'system',
      parameters: {
        command: { type: 'string', required: true, description: 'Command to execute' },
        cwd: { type: 'string', required: false, description: 'Working directory' }
      },
      execute: async (params) => {
        return await executor.executeCommand(params.command, { cwd: params.cwd });
      }
    });

    this.toolManager.registerTool('system:install', {
      description: 'Install a package',
      category: 'system',
      parameters: {
        packageName: { type: 'string', required: true },
        global: { type: 'boolean', required: false }
      },
      execute: async (params) => {
        return await executor.installDependency(params.packageName, { global: params.global });
      }
    });
  }

  /**
   * Register filesystem tools
   */
  registerFilesystemTools() {
    const executor = this.agents.executor;
    if (!executor) return;

    this.toolManager.registerTool('fs:create', {
      description: 'Create or edit a file',
      category: 'filesystem',
      parameters: {
        filePath: { type: 'string', required: true },
        content: { type: 'string', required: true }
      },
      execute: async (params) => {
        return await executor.createOrEditFile(params.filePath, params.content);
      }
    });

    this.toolManager.registerTool('fs:read', {
      description: 'Read a file',
      category: 'filesystem',
      parameters: {
        filePath: { type: 'string', required: true }
      },
      execute: async (params) => {
        return await executor.readFile(params.filePath);
      }
    });

    this.toolManager.registerTool('fs:writeFile', {
      description: 'Write content to a file',
      category: 'filesystem',
      parameters: {
        filePath: { type: 'string', required: true },
        content: { type: 'string', required: true }
      },
      execute: async (params) => {
        return await executor.writeFile(params.filePath, params.content);
      }
    });
  }

  /**
   * Register search tools
   */
  registerSearchTools() {
    this.toolManager.registerTool('search:web', {
      description: 'Search the web',
      category: 'search',
      parameters: {
        query: { type: 'string', required: true },
        limit: { type: 'number', required: false }
      },
      execute: async (params) => {
        // Placeholder for web search
        return {
          success: true,
          query: params.query,
          results: []
        };
      }
    });
  }

  /**
   * Register code execution tools
   */
  registerCodeExecutionTools() {
    const executor = this.agents.executor;
    if (!executor) return;

    this.toolManager.registerTool('code:execute', {
      description: 'Execute code',
      category: 'code',
      parameters: {
        code: { type: 'string', required: true },
        language: { type: 'string', required: true }
      },
      execute: async (params) => {
        // Execute based on language
        if (params.language === 'shell' || params.language === 'bash') {
          return await executor.executeCommand(params.code);
        }
        return { success: false, error: 'Unsupported language' };
      }
    });
  }

  /**
   * Route task to appropriate tool
   */
  async routeTask(task) {
    console.log('[ToolRouter] Routing task:', task.description);

    try {
      // Analyze task to determine required tools
      const requiredTools = this.analyzeTaskRequirements(task);
      console.log('[ToolRouter] Required tools:', requiredTools);

      // Execute tools in sequence
      const results = [];
      for (const toolName of requiredTools) {
        const tool = this.toolManager.getTool(toolName);
        if (!tool) {
          console.warn('[ToolRouter] Tool not found:', toolName);
          continue;
        }

        try {
          const result = await this.toolManager.executeTool(toolName, task.params || {});
          results.push({
            tool: toolName,
            success: true,
            result
          });
        } catch (error) {
          results.push({
            tool: toolName,
            success: false,
            error: error.message
          });
        }
      }

      this.executionLog.push({
        task: task.description,
        tools: requiredTools,
        results,
        timestamp: new Date()
      });

      return {
        success: results.every(r => r.success),
        results,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Analyze task to determine required tools
   */
  analyzeTaskRequirements(task) {
    const tools = [];
    const desc = task.description.toLowerCase();

    // Browser tools
    if (desc.includes('navigate') || desc.includes('visit') || desc.includes('open')) {
      tools.push('browser:navigate');
    }
    if (desc.includes('click') || desc.includes('press')) {
      tools.push('browser:click');
    }
    if (desc.includes('type') || desc.includes('enter') || desc.includes('write')) {
      tools.push('browser:type');
    }
    if (desc.includes('submit') || desc.includes('send')) {
      tools.push('browser:submit');
    }
    if (desc.includes('extract') || desc.includes('read') || desc.includes('get')) {
      tools.push('browser:extract');
    }
    if (desc.includes('screenshot') || desc.includes('capture')) {
      tools.push('browser:screenshot');
    }
    if (desc.includes('wait for selector') || desc.includes('element appears')) {
      tools.push('browser:waitForSelector');
    }
    if (desc.includes('execute script') || desc.includes('run javascript')) {
      tools.push('browser:evaluate');
    }

    // System tools
    if (desc.includes('command') || desc.includes('execute') || desc.includes('run')) {
      tools.push('system:execute');
    }
    if (desc.includes('install') || desc.includes('package')) {
      tools.push('system:install');
    }

    // Filesystem tools
    if (desc.includes('create') || desc.includes('write') || desc.includes('file')) {
      tools.push('fs:create');
    }
    if (desc.includes('read') || desc.includes('open file')) {
      tools.push('fs:read');
    }
    if (desc.includes('write file') || desc.includes('save content')) {
      tools.push('fs:writeFile');
    }

    // Search tools
    if (desc.includes('search') || desc.includes('find')) {
      tools.push('search:web');
    }

    // Code execution
    if (desc.includes('code') || desc.includes('script')) {
      tools.push('code:execute');
    }

    return tools.length > 0 ? tools : ['browser:extract']; // Default to extract
  }

  /**
   * Get available tools
   */
  getAvailableTools() {
    return this.toolManager.getAllTools();
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category) {
    return this.toolManager.getToolsByCategory(category);
  }

  /**
   * Get tool schema
   */
  getToolSchema(toolName) {
    return this.toolManager.getToolSchema(toolName);
  }

  /**
   * Get all tool schemas
   */
  getAllToolSchemas() {
    return this.toolManager.getAllToolSchemas();
  }

  /**
   * Get execution statistics
   */
  getExecutionStats() {
    return this.toolManager.getExecutionStats();
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 50) {
    return this.executionLog.slice(-limit);
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory() {
    this.executionLog = [];
  }

  /**
   * Register custom tool
   */
  registerCustomTool(toolName, toolDefinition) {
    return this.toolManager.registerTool(toolName, toolDefinition);
  }

  /**
   * Unregister tool
   */
  unregisterTool(toolName) {
    return this.toolManager.unregisterTool(toolName);
  }

  /**
   * Get tool manager
   */
  getToolManager() {
    return this.toolManager;
  }
}

module.exports = ToolRouter;
