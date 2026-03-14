/**
 * AutoGPT Integration Module
 * Integrates AutoGPT autonomous agent capabilities with the AI Browser Agent
 * Enables autonomous task planning and execution
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class AutoGPTIntegration {
  constructor(config = {}) {
    this.autogptPath = config.autogptPath || path.join(__dirname, '../integrations/autogpt');
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.maxIterations = config.maxIterations || 10;
    this.memory = new Map();
    this.taskHistory = [];
    this.initialized = false;
  }

  /**
   * Initialize AutoGPT integration
   */
  async initialize() {
    try {
      console.log('[AutoGPTIntegration] Initializing AutoGPT integration...');
      
      if (!this.apiKey) {
        console.warn('[AutoGPTIntegration] OpenAI API key not configured.');
      }

      this.initialized = true;
      console.log('[AutoGPTIntegration] AutoGPT integration initialized successfully.');
      return true;
    } catch (error) {
      console.error('[AutoGPTIntegration] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Execute autonomous task
   */
  async executeAutonomousTask(goal, constraints = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for autonomous task execution');
    }

    const taskId = `task_${Date.now()}`;
    const execution = {
      taskId,
      goal,
      startTime: new Date(),
      iterations: [],
      status: 'running',
      result: null,
      error: null
    };

    try {
      console.log(`[AutoGPTIntegration] Starting autonomous task: ${goal}`);
      
      let currentState = {
        goal,
        completedSteps: [],
        currentObjective: goal,
        context: constraints.context || {}
      };

      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        console.log(`[AutoGPTIntegration] Iteration ${iteration + 1}/${this.maxIterations}`);

        try {
          // Think about next action
          const thought = await this.think(currentState);
          
          // Plan action
          const action = await this.plan(thought, currentState);
          
          // Execute action
          const actionResult = await this.executeAction(action, currentState);
          
          // Observe results
          const observation = await this.observe(actionResult, currentState);
          
          // Store iteration
          execution.iterations.push({
            iteration: iteration + 1,
            thought,
            action,
            result: actionResult,
            observation
          });

          // Update state
          currentState = {
            ...currentState,
            completedSteps: [...currentState.completedSteps, action],
            lastObservation: observation,
            context: { ...currentState.context, ...observation.context }
          };

          // Check if task is complete
          if (observation.taskComplete) {
            execution.status = 'completed';
            execution.result = observation.result;
            break;
          }

          // Check for errors that should stop execution
          if (observation.error && observation.critical) {
            throw new Error(observation.error);
          }
        } catch (iterationError) {
          console.error(`[AutoGPTIntegration] Iteration ${iteration + 1} failed:`, iterationError.message);
          execution.iterations.push({
            iteration: iteration + 1,
            error: iterationError.message
          });
          
          if (iteration === this.maxIterations - 1) {
            throw iterationError;
          }
        }
      }

      if (execution.status === 'running') {
        execution.status = 'max_iterations_reached';
      }
    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      console.error('[AutoGPTIntegration] Task execution failed:', error.message);
    }

    execution.endTime = new Date();
    execution.duration = execution.endTime - execution.startTime;
    
    this.taskHistory.push(execution);
    return execution;
  }

  /**
   * Think about the current state and generate thoughts
   */
  async think(state) {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an autonomous AI agent. Analyze the current state and generate thoughts about what to do next.
Current Goal: ${state.goal}
Completed Steps: ${state.completedSteps.join(', ') || 'None'}
Current Objective: ${state.currentObjective}

Respond with a JSON object:
{
  "analysis": "your analysis of the current situation",
  "nextObjective": "the next objective to work towards",
  "reasoning": "your reasoning for this objective"
}`
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Failed to parse thought response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('[AutoGPTIntegration] Think failed:', error.message);
      throw error;
    }
  }

  /**
   * Plan the next action based on thoughts
   */
  async plan(thought, state) {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an autonomous AI agent. Based on the analysis, plan the next action.
Goal: ${state.goal}
Analysis: ${thought.analysis}
Next Objective: ${thought.nextObjective}

Respond with a JSON object:
{
  "action": "the action to take (e.g., 'search', 'analyze', 'create', 'execute')",
  "parameters": { "key": "value" },
  "expectedOutcome": "what we expect to happen",
  "fallback": "what to do if this action fails"
}`
          }
        ],
        temperature: 0.5,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Failed to parse plan response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('[AutoGPTIntegration] Plan failed:', error.message);
      throw error;
    }
  }

  /**
   * Execute the planned action
   */
  async executeAction(action, state) {
    try {
      console.log(`[AutoGPTIntegration] Executing action: ${action.action}`);
      
      // This would be connected to actual tool execution
      // For now, return a simulated result
      return {
        action: action.action,
        status: 'executed',
        result: `Executed action: ${action.action}`,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[AutoGPTIntegration] Action execution failed:', error.message);
      return {
        action: action.action,
        status: 'failed',
        error: error.message
      };
    }
  }

  /**
   * Observe the results of the action
   */
  async observe(actionResult, state) {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an autonomous AI agent. Analyze the action result and determine what to do next.
Original Goal: ${state.goal}
Action Result: ${JSON.stringify(actionResult)}

Respond with a JSON object:
{
  "observation": "what you observed from the action result",
  "taskComplete": false,
  "progress": "percentage of task completion (0-100)",
  "nextStep": "what should be done next",
  "context": { "key": "value" },
  "error": null,
  "critical": false
}`
          }
        ],
        temperature: 0.5,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Failed to parse observation response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('[AutoGPTIntegration] Observe failed:', error.message);
      return {
        observation: 'Failed to observe',
        taskComplete: false,
        progress: 0,
        error: error.message,
        critical: true
      };
    }
  }

  /**
   * Get task history
   */
  getTaskHistory(limit = 10) {
    return this.taskHistory.slice(-limit);
  }

  /**
   * Clear task history
   */
  clearTaskHistory() {
    this.taskHistory = [];
  }

  /**
   * Get memory
   */
  getMemory(key) {
    return this.memory.get(key);
  }

  /**
   * Store in memory
   */
  storeMemory(key, value) {
    this.memory.set(key, value);
  }

  /**
   * Clear memory
   */
  clearMemory() {
    this.memory.clear();
  }
}

module.exports = AutoGPTIntegration;
