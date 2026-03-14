/**
 * Multi-Agent Coordinator
 * Coordinates multiple specialized agents to solve complex tasks
 * Inspired by OpenManus coordinator pattern
 */

const EventEmitter = require('events');
const axios = require('axios');
const config = require('../config/config');
const skillManager = require('./skillManager');

class MultiAgentCoordinator extends EventEmitter {
  constructor(toolManager) {
    super();
    this.agents = new Map();
    this.toolManager = toolManager;
    this.skillManager = skillManager;
    this.taskQueue = [];
    this.activeTask = null;
    this.agentResponses = new Map();
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
          console.error('[MultiAgentCoordinator] Failed to parse JSON from markdown block:', e2.message);
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
          console.error('[MultiAgentCoordinator] Failed to parse JSON between delimiters:', e3.message);
        }
      }
      
      throw e; // Re-throw original error if all attempts fail
    }
  }

  /**
   * Register a specialized agent
   */
  registerAgent(agentName, agentInstance) {
    if (!agentName || !agentInstance) {
      throw new Error('Agent name and instance are required');
    }

    this.agents.set(agentName, {
      name: agentName,
      instance: agentInstance,
      status: 'idle',
      lastExecution: null
    });

    console.log(`[MultiAgentCoordinator] Registered agent: ${agentName}`);
    this.emit('agent:registered', { agentName });

    return true;
  }

  /**
   * Get an agent by name
   */
  getAgent(agentName) {
    const agent = this.agents.get(agentName);
    return agent ? agent.instance : null;
  }

  /**
   * Get all registered agents
   */
  getAllAgents() {
    return Array.from(this.agents.keys());
  }

  /**
   * Determine which agents are needed for a task
   */
  async determineRequiredAgents(taskDescription) {
    console.log('[MultiAgentCoordinator] Determining required agents...');

    if (!config.deepseekApiKey) {
      return this.getDefaultAgentSelection();
    }

    const systemPrompt = `You are an agent selector. Given a task description, determine which specialized agents should be involved.
Available agents: ${Array.from(this.agents.keys()).join(', ')}

For each agent, provide:
1. Agent name
2. Reasoning (why this agent is needed)
3. Priority (1-10, where 10 is most critical)

Return as JSON array.`;

    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Task: ${taskDescription}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const selection = this.safeJsonParse(response.data.choices[0].message.content);
      return Array.isArray(selection) ? selection : selection.agents || [];
    } catch (error) {
      console.error('[MultiAgentCoordinator] Agent selection failed:', error.message);
      return this.getDefaultAgentSelection();
    }
  }

  /**
   * Get default agent selection
   */
  getDefaultAgentSelection() {
    return Array.from(this.agents.keys()).map((name, index) => ({
      agent: name,
      reasoning: 'Default selection',
      priority: 5
    }));
  }

  /**
   * Coordinate agents to solve a task
   */
  async coordinateTask(taskDescription, taskType = 'general') {
    console.log('[MultiAgentCoordinator] Coordinating task...');

    this.activeTask = {
      description: taskDescription,
      type: taskType,
      startTime: Date.now(),
      status: 'coordinating',
      agentResults: {},
      subtasks: []
    };

    try {
      // Step 1: Multi-stage planning if planner is available
      const planner = this.getAgent('planner');
      if (planner && typeof planner.planMultiStageTask === 'function') {
        console.log('[MultiAgentCoordinator] Using planner for multi-stage planning');
        this.activeTask.subtasks = await planner.planMultiStageTask(taskDescription);
        console.log(`[MultiAgentCoordinator] Generated ${this.activeTask.subtasks.length} subtasks`);
      }

      // Step 2: Determine required agents
      const requiredAgents = await this.determineRequiredAgents(taskDescription);
      console.log('[MultiAgentCoordinator] Required agents:', requiredAgents.map(a => a.agent));

      // Step 3: Execute agents in priority order
      const sortedAgents = requiredAgents.sort((a, b) => (b.priority || 5) - (a.priority || 5));

      for (const agentSelection of sortedAgents) {
        const agentName = agentSelection.agent;
        const agent = this.getAgent(agentName);

        if (!agent) {
          console.warn(`[MultiAgentCoordinator] Agent not found: ${agentName}`);
          continue;
        }

        try {
          console.log(`[MultiAgentCoordinator] Executing agent: ${agentName}`);
          const agentResult = await this.executeAgent(agentName, agent, taskDescription);
          this.activeTask.agentResults[agentName] = agentResult;

          // If agent provides a complete solution, we can stop
          if (agentResult.complete) {
            console.log(`[MultiAgentCoordinator] Agent ${agentName} provided complete solution`);
            break;
          }
        } catch (error) {
          console.error(`[MultiAgentCoordinator] Agent execution failed: ${agentName}`, error.message);
          this.activeTask.agentResults[agentName] = {
            success: false,
            error: error.message
          };
        }
      }

      // Step 3: Synthesize results
      const finalResult = await this.synthesizeResults(this.activeTask.agentResults);
      this.activeTask.status = 'completed';
      this.activeTask.finalResult = finalResult;

      this.emit('task:completed', this.activeTask);
      return finalResult;
    } catch (error) {
      this.activeTask.status = 'failed';
      this.activeTask.error = error.message;
      this.emit('task:failed', this.activeTask);
      throw error;
    }
  }

  /**
   * Execute a single agent
   */
  async executeAgent(agentName, agent, taskDescription) {
    const agentRecord = this.agents.get(agentName);
    if (!agentRecord) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    agentRecord.status = 'executing';

    try {
      let result;

      // Check if agent has execute method
      if (typeof agent.execute === 'function') {
        result = await agent.execute(taskDescription);
      } else if (typeof agent.process === 'function') {
        result = await agent.process(taskDescription);
      } else if (typeof agent.run === 'function') {
        result = await agent.run(taskDescription);
      } else {
        throw new Error(`Agent ${agentName} has no executable method`);
      }

      agentRecord.status = 'idle';
      agentRecord.lastExecution = Date.now();

      return {
        success: true,
        agentName,
        result,
        timestamp: new Date()
      };
    } catch (error) {
      agentRecord.status = 'idle';
      throw error;
    }
  }

  /**
   * Synthesize results from multiple agents
   */
  async synthesizeResults(agentResults) {
    console.log('[MultiAgentCoordinator] Synthesizing results from agents...');

    const successfulResults = Object.entries(agentResults)
      .filter(([_, result]) => result.success)
      .map(([agent, result]) => ({ agent, ...result }));

    if (successfulResults.length === 0) {
      throw new Error('No agents produced successful results');
    }

    // If only one agent succeeded, return its result
    if (successfulResults.length === 1) {
      return {
        success: true,
        synthesized: false,
        primaryAgent: successfulResults[0].agent,
        result: successfulResults[0].result
      };
    }

    // If multiple agents succeeded, synthesize their results
    if (!config.deepseekApiKey) {
      return this.synthesizeResultsDefault(successfulResults);
    }

    const systemPrompt = `You are a result synthesizer. Given results from multiple agents, synthesize them into a coherent final result.
Preserve all important information and resolve any conflicts by prioritizing accuracy and completeness.
Return as JSON.`;

    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Agent results:\n${JSON.stringify(successfulResults, null, 2)}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1000
      }, {
        headers: {
          'Authorization': `Bearer ${config.deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const synthesized = this.safeJsonParse(response.data.choices[0].message.content);
      return {
        success: true,
        synthesized: true,
        result: synthesized
      };
    } catch (error) {
      console.error('[MultiAgentCoordinator] Synthesis failed:', error.message);
      return this.synthesizeResultsDefault(successfulResults);
    }
  }

  /**
   * Default result synthesis
   */
  synthesizeResultsDefault(successfulResults) {
    return {
      success: true,
      synthesized: true,
      result: {
        agentContributions: successfulResults.map(r => ({
          agent: r.agent,
          result: r.result
        })),
        note: 'Results from multiple agents combined'
      }
    };
  }

  /**
   * Get coordinator status
   */
  getStatus() {
    return {
      registeredAgents: Array.from(this.agents.keys()),
      agentStatuses: Object.fromEntries(
        Array.from(this.agents.entries()).map(([name, agent]) => [
          name,
          {
            status: agent.status,
            lastExecution: agent.lastExecution
          }
        ])
      ),
      activeTask: this.activeTask ? {
        description: this.activeTask.description,
        status: this.activeTask.status,
        startTime: this.activeTask.startTime
      } : null
    };
  }

  /**
   * Get agent statistics
   */
  getAgentStats() {
    const stats = {};

    for (const [agentName, agentRecord] of this.agents.entries()) {
      stats[agentName] = {
        status: agentRecord.status,
        lastExecution: agentRecord.lastExecution
      };
    }

    return stats;
  }
}

module.exports = MultiAgentCoordinator;
