/**
 * Enhanced Agent
 * Provides advanced capabilities for complex tasks
 * Includes multi-step reasoning, error recovery, and adaptive execution
 */

const axios = require('axios');
const config = require('../config/config');

class EnhancedAgent {
  constructor() {
    this.executionHistory = [];
    this.errorPatterns = new Map();
    this.successPatterns = new Map();
  }

  /**
   * Safely parse JSON from a string, handling markdown blocks and common errors
   */
  safeJsonParse(text) {
    if (!text) return null;
    
    try {
      // Try direct parse first
      return JSON.parse(text);
    } catch (e) {
      // Try to extract JSON from markdown blocks
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (e2) {
          console.error('[EnhancedAgent] Failed to parse JSON from markdown block:', e2.message);
        }
      }
      
      // Try to find the first '{' and last '}' or '[' and last ']'
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      
      let start = -1;
      let end = -1;
      
      if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        end = lastBrace;
      } else if (firstBracket !== -1) {
        start = firstBracket;
        end = lastBracket;
      }
      
      if (start !== -1 && end !== -1 && end > start) {
        const potentialJson = text.substring(start, end + 1);
        try {
          return JSON.parse(potentialJson);
        } catch (e3) {
          console.error('[EnhancedAgent] Failed to parse JSON between delimiters:', e3.message);
        }
      }
      
      throw e; // Re-throw original error if all attempts fail
    }
  }

  /**
   * Execute complex task with adaptive strategy
   */
  async executeComplexTask(task, planner, executor, browser) {
    console.log('[EnhancedAgent] Executing complex task with adaptive strategy...');
    
    const strategy = await this.determineStrategy(task);
    console.log(`[EnhancedAgent] Strategy: ${strategy.approach}`);

    const results = {
      strategy,
      steps: [],
      adaptations: [],
      errors: [],
      success: false
    };

    try {
      for (let attempt = 1; attempt <= strategy.maxRetries; attempt++) {
        console.log(`[EnhancedAgent] Attempt ${attempt}/${strategy.maxRetries}`);
        
        try {
          const stepResults = await this.executeWithAdaptation(
            task,
            planner,
            executor,
            browser,
            strategy,
            attempt
          );
          
          results.steps.push(...stepResults);
          
          if (stepResults.every(r => r.success)) {
            results.success = true;
            break;
          }
        } catch (error) {
          results.errors.push({
            attempt,
            error: error.message,
            timestamp: new Date()
          });

          // Adapt strategy based on error
          const adaptation = await this.adaptStrategy(strategy, error, attempt);
          results.adaptations.push(adaptation);
          
          if (attempt < strategy.maxRetries) {
            console.log(`[EnhancedAgent] Adapting strategy and retrying...`);
            await this.delay(strategy.retryDelay);
          }
        }
      }
    } catch (error) {
      results.error = error.message;
    }

    return results;
  }

  /**
   * Determine execution strategy based on task complexity
   */
  async determineStrategy(task) {
    console.log('[EnhancedAgent] Determining execution strategy...');
    
    if (!config.deepseekApiKey) {
      return this.getDefaultStrategy();
    }

    const systemPrompt = `You are a task strategy planner. Analyze the task and determine:
1. Approach: 'sequential' for step-by-step, 'parallel' for concurrent, 'adaptive' for dynamic
2. Complexity: 'simple', 'medium', or 'complex'
3. Risk level: 'low', 'medium', or 'high'
4. Max retries: number (1-5)
5. Timeout per step: milliseconds (5000-60000)
6. Special handling: any special considerations

Return as JSON.`;

    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Task: ${task.description}\nType: ${task.type}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const strategy = this.safeJsonParse(response.data.choices[0].message.content);
      return {
        approach: strategy.approach || 'sequential',
        complexity: strategy.complexity || 'medium',
        riskLevel: strategy.risk_level || 'medium',
        maxRetries: strategy.max_retries || 3,
        stepTimeout: strategy.timeout_per_step || 30000,
        retryDelay: 2000,
        specialHandling: strategy.special_handling || null
      };
    } catch (error) {
      console.error('[EnhancedAgent] Strategy determination failed:', error.message);
      return this.getDefaultStrategy();
    }
  }

  /**
   * Get default strategy
   */
  getDefaultStrategy() {
    return {
      approach: 'sequential',
      complexity: 'medium',
      riskLevel: 'medium',
      maxRetries: 3,
      stepTimeout: 30000,
      retryDelay: 2000,
      specialHandling: null
    };
  }

  /**
   * Execute with adaptive error handling
   */
  async executeWithAdaptation(task, planner, executor, browser, strategy, attempt) {
    const results = [];
    
    if (!task.plan || !task.plan.steps) {
      throw new Error('Task has no execution plan');
    }

    for (const step of task.plan.steps) {
      try {
        const result = await this.executeStepWithTimeout(
          step,
          executor,
          browser,
          strategy.stepTimeout
        );

        results.push({
          step: step.order,
          action: step.action,
          success: result.success,
          result: result
        });

        if (!result.success) {
          throw new Error(`Step ${step.order} failed: ${result.error}`);
        }
      } catch (error) {
        results.push({
          step: step.order,
          action: step.action,
          success: false,
          error: error.message
        });
        throw error;
      }
    }

    return results;
  }

  /**
   * Execute step with timeout
   */
  async executeStepWithTimeout(step, executor, browser, timeout) {
    return Promise.race([
      this.executeStep(step, executor, browser),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Step timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * Execute a single step
   */
  async executeStep(step, executor, browser) {
    const { action, params } = step;

    try {
      if (action.startsWith('browser:')) {
        return await this.executeBrowserStep(action, params, browser);
      } else if (action.startsWith('system:')) {
        return await this.executeSystemStep(action, params, executor);
      } else if (action.startsWith('dev:')) {
        return await this.executeDevelopmentStep(action, params, executor);
      } else {
        return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute browser step
   */
  async executeBrowserStep(action, params, browser) {
    const actionType = action.split(':')[1];
    
    switch (actionType) {
      case 'navigate':
        return await browser.navigate(params.url);
      case 'click':
        return await browser.click(params.selector);
      case 'type':
        return await browser.type(params.selector, params.text);
      case 'submit':
        return await browser.submitForm(params.selector);
      case 'extract':
        return await browser.extractContent();
      case 'waitForElement':
        return await browser.waitForElement(params.selector, params.timeout || 10000);
      case 'screenshot':
        return await browser.screenshot(params.filePath);
      default:
        return { success: false, error: `Unknown browser action: ${actionType}` };
    }
  }

  /**
   * Execute system step
   */
  async executeSystemStep(action, params, executor) {
    const actionType = action.split(':')[1];
    
    switch (actionType) {
      case 'execute':
        return await executor.executeCommand(params.command);
      case 'createFile':
        return await executor.createOrEditFile(params.filePath, params.content);
      case 'readFile':
        return await executor.readFile(params.filePath);
      default:
        return { success: false, error: `Unknown system action: ${actionType}` };
    }
  }

  /**
   * Execute development step
   */
  async executeDevelopmentStep(action, params, executor) {
    const actionType = action.split(':')[1];
    
    switch (actionType) {
      case 'clone':
        return await executor.cloneRepository(params.repoUrl, params.targetDir);
      case 'git':
        return await executor.gitOperation(params.operation, params);
      default:
        return { success: false, error: `Unknown development action: ${actionType}` };
    }
  }

  /**
   * Adapt strategy based on errors
   */
  async adaptStrategy(currentStrategy, error, attempt) {
    console.log('[EnhancedAgent] Adapting strategy based on error...');
    
    const adaptation = {
      attempt,
      originalStrategy: { ...currentStrategy },
      adaptedStrategy: { ...currentStrategy },
      reason: error.message
    };

    // Increase timeout if timeout error
    if (error.message.includes('timeout')) {
      adaptation.adaptedStrategy.stepTimeout = Math.min(
        currentStrategy.stepTimeout * 1.5,
        60000
      );
      console.log(`[EnhancedAgent] Increased timeout to ${adaptation.adaptedStrategy.stepTimeout}ms`);
    }

    // Increase retry delay if network error
    if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
      adaptation.adaptedStrategy.retryDelay = currentStrategy.retryDelay * 2;
      console.log(`[EnhancedAgent] Increased retry delay to ${adaptation.adaptedStrategy.retryDelay}ms`);
    }

    // Store error pattern
    const errorKey = error.message.substring(0, 50);
    this.errorPatterns.set(errorKey, (this.errorPatterns.get(errorKey) || 0) + 1);

    return adaptation;
  }

  /**
   * Record successful execution pattern
   */
  recordSuccess(taskType, strategy) {
    const key = `${taskType}:${strategy.approach}`;
    this.successPatterns.set(key, (this.successPatterns.get(key) || 0) + 1);
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 100) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory() {
    this.executionHistory = [];
  }

  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Analyze patterns and provide recommendations
   */
  analyzePatterns() {
    return {
      commonErrors: Array.from(this.errorPatterns.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      successfulStrategies: Array.from(this.successPatterns.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
    };
  }
}

module.exports = EnhancedAgent;
