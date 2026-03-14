/**
 * Tool Manager
 * Manages dynamic tool registration, discovery, and execution
 * Inspired by OpenManus tool management system
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class ToolManager extends EventEmitter {
  constructor() {
    super();
    this.tools = new Map();
    this.toolCategories = new Map();
    this.executionHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Automatically load tools from plugins directory
   */
  async loadPlugins(pluginsDir = path.join(__dirname, 'plugins')) {
    console.log(`[ToolManager] Loading plugins from: ${pluginsDir}`);
    
    if (!fs.existsSync(pluginsDir)) {
      console.warn(`[ToolManager] Plugins directory not found: ${pluginsDir}`);
      return;
    }

    try {
      const files = fs.readdirSync(pluginsDir);
      for (const file of files) {
        if (file.endsWith('.js')) {
          const pluginPath = path.join(pluginsDir, file);
          try {
            const plugin = require(pluginPath);
            if (plugin.tools && Array.isArray(plugin.tools)) {
              for (const toolDef of plugin.tools) {
                this.registerTool(toolDef.name, toolDef);
              }
            } else if (plugin.name && plugin.execute) {
              this.registerTool(plugin.name, plugin);
            }
            console.log(`[ToolManager] Loaded plugin: ${file}`);
          } catch (err) {
            console.error(`[ToolManager] Failed to load plugin ${file}:`, err.message);
          }
        }
      }
    } catch (err) {
      console.error(`[ToolManager] Error reading plugins directory:`, err.message);
    }
  }

  /**
   * Register a new tool
   */
  registerTool(toolName, toolDefinition) {
    if (!toolName || !toolDefinition) {
      throw new Error('Tool name and definition are required');
    }

    if (!toolDefinition.execute || typeof toolDefinition.execute !== 'function') {
      throw new Error('Tool must have an execute function');
    }

    const tool = {
      name: toolName,
      description: toolDefinition.description || '',
      category: toolDefinition.category || 'general',
      parameters: toolDefinition.parameters || {},
      execute: toolDefinition.execute,
      metadata: toolDefinition.metadata || {}
    };

    this.tools.set(toolName, tool);

    // Register in category index
    if (!this.toolCategories.has(tool.category)) {
      this.toolCategories.set(tool.category, []);
    }
    this.toolCategories.get(tool.category).push(toolName);

    console.log(`[ToolManager] Registered tool: ${toolName} (${tool.category})`);
    this.emit('tool:registered', { toolName, tool });

    return tool;
  }

  /**
   * Get a tool by name
   */
  getTool(toolName) {
    return this.tools.get(toolName);
  }

  /**
   * Get all tools
   */
  getAllTools() {
    return Array.from(this.tools.values());
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category) {
    const toolNames = this.toolCategories.get(category) || [];
    return toolNames.map(name => this.tools.get(name)).filter(Boolean);
  }

  /**
   * Get available categories
   */
  getCategories() {
    return Array.from(this.toolCategories.keys());
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName, params = {}) {
    const tool = this.getTool(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    console.log(`[ToolManager] Executing tool: ${toolName}`);
    console.log(`[ToolManager] Parameters:`, params);

    try {
      const startTime = Date.now();
      const result = await tool.execute(params);
      const duration = Date.now() - startTime;

      const execution = {
        toolName,
        params,
        result,
        status: 'success',
        duration,
        timestamp: new Date()
      };

      this.recordExecution(execution);
      this.emit('tool:executed', execution);

      console.log(`[ToolManager] Tool executed successfully in ${duration}ms`);
      return result;
    } catch (error) {
      const execution = {
        toolName,
        params,
        error: error.message,
        status: 'failed',
        timestamp: new Date()
      };

      this.recordExecution(execution);
      this.emit('tool:failed', execution);

      console.error(`[ToolManager] Tool execution failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Find tools matching a description
   */
  findToolsByDescription(description) {
    const keywords = description.toLowerCase().split(' ');
    const matches = [];

    for (const tool of this.tools.values()) {
      const toolText = `${tool.name} ${tool.description}`.toLowerCase();
      const matchCount = keywords.filter(kw => toolText.includes(kw)).length;

      if (matchCount > 0) {
        matches.push({
          tool,
          relevance: matchCount / keywords.length
        });
      }
    }

    return matches.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Get tool schema for LLM understanding
   */
  getToolSchema(toolName) {
    const tool = this.getTool(toolName);
    if (!tool) {
      return null;
    }

    return {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      parameters: tool.parameters,
      metadata: tool.metadata
    };
  }

  /**
   * Get all tool schemas
   */
  getAllToolSchemas() {
    return Array.from(this.tools.values()).map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      parameters: tool.parameters
    }));
  }

  /**
   * Record tool execution in history
   */
  recordExecution(execution) {
    this.executionHistory.push(execution);

    // Keep history size manageable
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory.shift();
    }
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 100) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Get execution statistics
   */
  getExecutionStats() {
    const stats = {
      totalExecutions: this.executionHistory.length,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageDuration: 0,
      toolStats: {}
    };

    let totalDuration = 0;

    for (const execution of this.executionHistory) {
      if (execution.status === 'success') {
        stats.successfulExecutions++;
        totalDuration += execution.duration || 0;
      } else {
        stats.failedExecutions++;
      }

      if (!stats.toolStats[execution.toolName]) {
        stats.toolStats[execution.toolName] = {
          executions: 0,
          successes: 0,
          failures: 0
        };
      }

      stats.toolStats[execution.toolName].executions++;
      if (execution.status === 'success') {
        stats.toolStats[execution.toolName].successes++;
      } else {
        stats.toolStats[execution.toolName].failures++;
      }
    }

    if (stats.successfulExecutions > 0) {
      stats.averageDuration = totalDuration / stats.successfulExecutions;
    }

    return stats;
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory() {
    this.executionHistory = [];
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName) {
    const tool = this.getTool(toolName);
    if (!tool) {
      return false;
    }

    this.tools.delete(toolName);

    // Remove from category index
    const category = tool.category;
    if (this.toolCategories.has(category)) {
      const tools = this.toolCategories.get(category);
      const index = tools.indexOf(toolName);
      if (index > -1) {
        tools.splice(index, 1);
      }

      // Remove category if empty
      if (tools.length === 0) {
        this.toolCategories.delete(category);
      }
    }

    console.log(`[ToolManager] Unregistered tool: ${toolName}`);
    this.emit('tool:unregistered', { toolName });

    return true;
  }

  /**
   * Validate tool parameters
   */
  validateToolParameters(toolName, params) {
    const tool = this.getTool(toolName);
    if (!tool) {
      return { valid: false, error: `Tool not found: ${toolName}` };
    }

    const errors = [];

    // Check required parameters
    for (const [paramName, paramDef] of Object.entries(tool.parameters)) {
      if (paramDef.required && !(paramName in params)) {
        errors.push(`Missing required parameter: ${paramName}`);
      }

      // Type checking
      if (paramName in params && paramDef.type) {
        const actualType = typeof params[paramName];
        if (actualType !== paramDef.type) {
          errors.push(`Parameter ${paramName} has wrong type: expected ${paramDef.type}, got ${actualType}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = ToolManager;
