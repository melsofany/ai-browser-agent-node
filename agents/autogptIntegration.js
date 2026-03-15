/**
 * AutoGPT Integration Module
 * Based on patterns from https://github.com/Significant-Gravitas/AutoGPT
 * Implements: BlockType/Category, BlockSchema, Plugin system, Think-Plan-Act-Observe loop,
 * Memory management, Self-improvement, Parallel execution, Graph-based agent workflows
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ─────────────────────────────────────────────
// BlockType (mirrors autogpt_platform/backend/blocks/_base.py)
// ─────────────────────────────────────────────
const BlockType = {
  STANDARD: 'Standard',
  INPUT: 'Input',
  OUTPUT: 'Output',
  NOTE: 'Note',
  WEBHOOK: 'Webhook',
  AGENT: 'Agent',
  AI: 'AI',
  HUMAN_IN_THE_LOOP: 'Human In The Loop',
  CONDITIONAL: 'Conditional',
  LOOP: 'Loop'
};

// ─────────────────────────────────────────────
// BlockCategory (mirrors autogpt_platform/backend/blocks/_base.py)
// ─────────────────────────────────────────────
const BlockCategory = {
  AI: { name: 'AI', description: 'Block that leverages AI to perform a task.' },
  SEARCH: { name: 'SEARCH', description: 'Block that searches or extracts information from the internet.' },
  TEXT: { name: 'TEXT', description: 'Block that processes text data.' },
  CODE: { name: 'CODE', description: 'Block that writes or executes code.' },
  BASIC: { name: 'BASIC', description: 'Block that performs basic operations.' },
  INPUT: { name: 'INPUT', description: 'Block that interacts with input of the graph.' },
  OUTPUT: { name: 'OUTPUT', description: 'Block that interacts with output of the graph.' },
  LOGIC: { name: 'LOGIC', description: 'Programming logic to control the flow of your agent.' },
  DATA: { name: 'DATA', description: 'Block that interacts with structured data.' },
  AGENT: { name: 'AGENT', description: 'Block that interacts with other agents.' },
  BROWSER: { name: 'BROWSER', description: 'Block that controls web browser.' },
  FILE: { name: 'FILE', description: 'Block that interacts with the filesystem.' },
  PLANNING: { name: 'PLANNING', description: 'Block that plans tasks and strategies.' },
  MEMORY: { name: 'MEMORY', description: 'Block that manages memory and context.' }
};

// ─────────────────────────────────────────────
// Block Schema Validator
// ─────────────────────────────────────────────
class BlockSchema {
  constructor(schema = {}) {
    this.schema = schema;
    this.required = schema.required || [];
  }

  validate(data) {
    const errors = [];
    for (const field of this.required) {
      if (data[field] === undefined || data[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    if (this.schema.properties) {
      for (const [key, def] of Object.entries(this.schema.properties)) {
        if (data[key] !== undefined) {
          const actualType = Array.isArray(data[key]) ? 'array' : typeof data[key];
          if (def.type && def.type !== actualType) {
            errors.push(`Field "${key}" expected ${def.type}, got ${actualType}`);
          }
          if (def.enum && !def.enum.includes(data[key])) {
            errors.push(`Field "${key}" must be one of: ${def.enum.join(', ')}`);
          }
        }
      }
    }
    return errors;
  }

  toJSON() {
    return this.schema;
  }
}

// ─────────────────────────────────────────────
// Base Block (mirrors autogpt_platform/backend/blocks/_base.py)
// ─────────────────────────────────────────────
class Block {
  constructor(options = {}) {
    this.id = options.id || `block_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.name = options.name || this.constructor.name;
    this.description = options.description || '';
    this.blockType = options.blockType || BlockType.STANDARD;
    this.categories = options.categories || [BlockCategory.BASIC];
    this.inputSchema = new BlockSchema(options.inputSchema || {});
    this.outputSchema = new BlockSchema(options.outputSchema || {});
    this.disabled = options.disabled || false;
    this.staticOutput = options.staticOutput || false;
    this.costs = options.costs || [];
    this._execCount = 0;
    this._errorCount = 0;
  }

  async run(input) {
    const errors = this.inputSchema.validate(input);
    if (errors.length > 0) throw new Error(`Input validation failed: ${errors.join('; ')}`);

    this._execCount++;
    try {
      const output = await this.execute(input);
      return output;
    } catch (error) {
      this._errorCount++;
      throw error;
    }
  }

  async execute(input) {
    throw new Error(`Block "${this.name}" execute() not implemented`);
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      blockType: this.blockType,
      categories: this.categories.map(c => c.name || c),
      inputSchema: this.inputSchema.toJSON(),
      outputSchema: this.outputSchema.toJSON(),
      execCount: this._execCount,
      errorCount: this._errorCount
    };
  }

  *outputs(key, value) {
    yield { key, value };
  }
}

// ─────────────────────────────────────────────
// Built-in Blocks (mirrors autogpt blocks/)
// ─────────────────────────────────────────────
class TextProcessBlock extends Block {
  constructor() {
    super({
      name: 'TextProcessBlock',
      description: 'Processes and transforms text data',
      blockType: BlockType.STANDARD,
      categories: [BlockCategory.TEXT],
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          operation: { type: 'string', enum: ['uppercase', 'lowercase', 'trim', 'reverse', 'count_words', 'summarize'] }
        },
        required: ['text', 'operation']
      },
      outputSchema: {
        type: 'object',
        properties: { result: { type: 'string' }, metadata: { type: 'object' } }
      }
    });
  }

  async execute({ text, operation }) {
    switch (operation) {
      case 'uppercase': return { result: text.toUpperCase(), metadata: { length: text.length } };
      case 'lowercase': return { result: text.toLowerCase(), metadata: { length: text.length } };
      case 'trim': return { result: text.trim(), metadata: { length: text.trim().length } };
      case 'reverse': return { result: text.split('').reverse().join(''), metadata: { length: text.length } };
      case 'count_words': {
        const words = text.trim().split(/\s+/).filter(Boolean);
        return { result: String(words.length), metadata: { words, chars: text.length } };
      }
      default: return { result: text, metadata: {} };
    }
  }
}

class AIConditionBlock extends Block {
  constructor() {
    super({
      name: 'AIConditionBlock',
      description: 'Evaluates a condition and routes to different branches',
      blockType: BlockType.CONDITIONAL,
      categories: [BlockCategory.LOGIC, BlockCategory.AI],
      inputSchema: {
        type: 'object',
        properties: {
          condition: { type: 'string' },
          value: {},
          threshold: { type: 'number' }
        },
        required: ['condition']
      }
    });
  }

  async execute({ condition, value, threshold = 0.5 }) {
    const condLower = String(condition).toLowerCase();
    let result = false;

    if (condLower.includes('true') || condLower === 'yes') result = true;
    else if (condLower.includes('false') || condLower === 'no') result = false;
    else if (value !== undefined && threshold !== undefined) result = Number(value) >= threshold;
    else result = !!value;

    return { result, branch: result ? 'true_branch' : 'false_branch', condition };
  }
}

class AgentInputBlock extends Block {
  constructor() {
    super({
      name: 'AgentInputBlock',
      description: 'Provides input to the agent graph',
      blockType: BlockType.INPUT,
      categories: [BlockCategory.INPUT]
    });
  }

  async execute(input) {
    return { ...input, _timestamp: new Date().toISOString() };
  }
}

class AgentOutputBlock extends Block {
  constructor() {
    super({
      name: 'AgentOutputBlock',
      description: 'Collects output from the agent graph',
      blockType: BlockType.OUTPUT,
      categories: [BlockCategory.OUTPUT]
    });
  }

  async execute(input) {
    return { output: input, recorded: true, timestamp: new Date().toISOString() };
  }
}

// ─────────────────────────────────────────────
// Memory System (mirrors AutoGPT memory/vector/)
// ─────────────────────────────────────────────
class AgentMemory {
  constructor(options = {}) {
    this.shortTerm = new Map();
    this.longTerm = [];
    this.workingMemory = {};
    this.maxShortTerm = options.maxShortTerm || 100;
    this.maxLongTerm = options.maxLongTerm || 1000;
    this.embeddingFn = options.embeddingFn || null;
  }

  remember(key, value, type = 'short') {
    const entry = { key, value, type, timestamp: Date.now(), accessed: 0 };

    if (type === 'short') {
      if (this.shortTerm.size >= this.maxShortTerm) {
        const oldest = [...this.shortTerm.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
        if (oldest) this.shortTerm.delete(oldest[0]);
      }
      this.shortTerm.set(key, entry);
    } else {
      if (this.longTerm.length >= this.maxLongTerm) this.longTerm.shift();
      this.longTerm.push(entry);
    }

    this.workingMemory[key] = value;
    return entry;
  }

  recall(key) {
    if (this.shortTerm.has(key)) {
      const entry = this.shortTerm.get(key);
      entry.accessed++;
      return entry.value;
    }
    const longEntry = this.longTerm.find(e => e.key === key);
    if (longEntry) {
      longEntry.accessed++;
      return longEntry.value;
    }
    return null;
  }

  search(query) {
    const results = [];
    const q = query.toLowerCase();
    for (const [key, entry] of this.shortTerm.entries()) {
      if (key.toLowerCase().includes(q) || String(entry.value).toLowerCase().includes(q)) {
        results.push(entry);
      }
    }
    for (const entry of this.longTerm) {
      if (String(entry.key).toLowerCase().includes(q) || String(entry.value).toLowerCase().includes(q)) {
        results.push(entry);
      }
    }
    return results.sort((a, b) => b.accessed - a.accessed).slice(0, 10);
  }

  forget(key) {
    this.shortTerm.delete(key);
    const idx = this.longTerm.findIndex(e => e.key === key);
    if (idx !== -1) this.longTerm.splice(idx, 1);
    delete this.workingMemory[key];
  }

  consolidate() {
    for (const [key, entry] of this.shortTerm.entries()) {
      if (entry.accessed >= 3) {
        this.longTerm.push({ ...entry, type: 'long' });
        this.shortTerm.delete(key);
      }
    }
  }

  snapshot() {
    return {
      shortTerm: Object.fromEntries(this.shortTerm),
      longTermCount: this.longTerm.length,
      workingMemory: { ...this.workingMemory }
    };
  }
}

// ─────────────────────────────────────────────
// Task / Goal Manager (mirrors AutoGPT planning)
// ─────────────────────────────────────────────
class TaskManager {
  constructor() {
    this.tasks = [];
    this.completedTasks = [];
    this.currentTask = null;
  }

  addTask(task, priority = 0) {
    const entry = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      description: typeof task === 'string' ? task : task.description,
      goal: task.goal || task.description || task,
      priority,
      status: 'pending',
      created: Date.now(),
      subtasks: task.subtasks || [],
      dependencies: task.dependencies || [],
      result: null,
      attempts: 0
    };
    this.tasks.push(entry);
    this.tasks.sort((a, b) => b.priority - a.priority);
    return entry;
  }

  getNext() {
    const ready = this.tasks.filter(t =>
      t.status === 'pending' &&
      t.dependencies.every(dep => this.completedTasks.find(c => c.id === dep || c.description === dep))
    );
    return ready[0] || null;
  }

  start(taskId) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) { task.status = 'running'; this.currentTask = task; }
    return task;
  }

  complete(taskId, result) {
    const idx = this.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) {
      const task = this.tasks[idx];
      task.status = 'completed';
      task.result = result;
      task.completedAt = Date.now();
      this.completedTasks.push(task);
      this.tasks.splice(idx, 1);
      if (this.currentTask?.id === taskId) this.currentTask = null;
      return task;
    }
    return null;
  }

  fail(taskId, error, retry = false) {
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.attempts++;
      if (retry && task.attempts < 3) {
        task.status = 'pending';
        task.lastError = error;
      } else {
        task.status = 'failed';
        task.error = error;
        const idx = this.tasks.indexOf(task);
        if (idx !== -1) this.tasks.splice(idx, 1);
        this.completedTasks.push(task);
      }
    }
    return task;
  }

  getAll() {
    return { pending: this.tasks, completed: this.completedTasks, current: this.currentTask };
  }
}

// ─────────────────────────────────────────────
// Agent Graph (mirrors AutoGPT platform graph)
// ─────────────────────────────────────────────
class AgentGraph {
  constructor(name, options = {}) {
    this.name = name;
    this.id = options.id || `graph_${Date.now()}`;
    this.blocks = new Map();
    this.links = [];
    this.inputs = {};
    this.outputs = {};
    this.metadata = options.metadata || {};
  }

  addBlock(block, position = { x: 0, y: 0 }) {
    this.blocks.set(block.id, { block, position });
    return this;
  }

  link(fromBlockId, fromOutput, toBlockId, toInput) {
    this.links.push({ fromBlockId, fromOutput, toBlockId, toInput });
    return this;
  }

  async execute(input, options = {}) {
    const results = new Map();
    const executed = new Set();
    const blockOutputs = new Map();

    blockOutputs.set('__input__', input);

    const getBlockInputs = (blockId) => {
      const blockLinks = this.links.filter(l => l.toBlockId === blockId);
      const inputs = {};
      for (const link of blockLinks) {
        const sourceOutputs = blockOutputs.get(link.fromBlockId);
        if (sourceOutputs && sourceOutputs[link.fromOutput] !== undefined) {
          inputs[link.toInput] = sourceOutputs[link.fromOutput];
        }
      }
      return inputs;
    };

    const canExecute = (blockId) => {
      const deps = this.links.filter(l => l.toBlockId === blockId).map(l => l.fromBlockId);
      return deps.every(dep => executed.has(dep) || dep === '__input__');
    };

    let maxIterations = this.blocks.size * 2;
    let iteration = 0;

    while (executed.size < this.blocks.size && iteration < maxIterations) {
      iteration++;
      let progress = false;

      for (const [blockId, { block }] of this.blocks.entries()) {
        if (executed.has(blockId)) continue;
        if (!canExecute(blockId)) continue;

        const blockInputs = getBlockInputs(blockId);
        try {
          const output = await block.run({ ...input, ...blockInputs });
          blockOutputs.set(blockId, output);
          results.set(blockId, { success: true, output });
          executed.add(blockId);
          progress = true;
        } catch (error) {
          results.set(blockId, { success: false, error: error.message });
          executed.add(blockId);
          progress = true;
        }
      }

      if (!progress) break;
    }

    const finalOutputs = {};
    for (const link of this.links.filter(l => !this.blocks.has(l.toBlockId))) {
      const src = blockOutputs.get(link.fromBlockId);
      if (src) finalOutputs[link.toInput] = src[link.fromOutput];
    }

    const lastBlock = [...this.blocks.values()].pop();
    const lastOutput = lastBlock ? blockOutputs.get(lastBlock.block.id) : null;

    return {
      graphId: this.id,
      name: this.name,
      results: Object.fromEntries(results),
      finalOutput: lastOutput || finalOutputs,
      executedBlocks: executed.size,
      totalBlocks: this.blocks.size
    };
  }
}

// ─────────────────────────────────────────────
// Self-Improvement System (mirrors AutoGPT self-critique)
// ─────────────────────────────────────────────
class SelfImprovementEngine {
  constructor() {
    this.feedbackHistory = [];
    this.improvements = [];
    this.metrics = { successRate: 0, avgIterations: 0, totalRuns: 0 };
  }

  recordOutcome(taskId, success, iterations, feedback = '') {
    const record = { taskId, success, iterations, feedback, timestamp: Date.now() };
    this.feedbackHistory.push(record);
    this.metrics.totalRuns++;
    this.metrics.successRate = this.feedbackHistory.filter(r => r.success).length / this.feedbackHistory.length;
    this.metrics.avgIterations = this.feedbackHistory.reduce((s, r) => s + r.iterations, 0) / this.feedbackHistory.length;
    return record;
  }

  analyze() {
    if (this.feedbackHistory.length < 3) return null;

    const recentFails = this.feedbackHistory.slice(-10).filter(r => !r.success);
    const insights = [];

    if (recentFails.length > 5) {
      insights.push({ type: 'high_failure_rate', suggestion: 'Reduce complexity of tasks or improve planning' });
    }

    const highIterations = this.feedbackHistory.filter(r => r.iterations > 8);
    if (highIterations.length > this.feedbackHistory.length * 0.3) {
      insights.push({ type: 'slow_convergence', suggestion: 'Break tasks into smaller subtasks' });
    }

    return { insights, metrics: { ...this.metrics }, timestamp: Date.now() };
  }

  async generateCritique(thought, action, result, llmClient = null) {
    if (!llmClient) {
      return {
        critique: 'LLM not available for critique',
        improved_thought: thought,
        confidence: 0.5
      };
    }

    const prompt = `Critique this AI agent's reasoning and suggest improvements:

Thought: ${JSON.stringify(thought)}
Action: ${JSON.stringify(action)}  
Result: ${JSON.stringify(result)}

Provide a JSON response:
{
  "critique": "what went wrong or could be improved",
  "improved_thought": "better reasoning approach",
  "confidence": 0.0-1.0
}`;

    try {
      const response = await llmClient.call([{ role: 'user', content: prompt }]);
      const text = response.content || response.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {}

    return { critique: 'Unable to generate critique', improved_thought: thought, confidence: 0.5 };
  }
}

// ─────────────────────────────────────────────
// Main AutoGPT Integration (Think-Plan-Act-Observe loop)
// ─────────────────────────────────────────────
class AutoGPTIntegration extends EventEmitter {
  constructor(config = {}) {
    super();
    this.autogptPath = config.autogptPath || path.join(__dirname, '../integrations/autogpt');
    this.maxIterations = config.maxIterations || 10;
    this.memory = new AgentMemory(config.memory || {});
    this.taskManager = new TaskManager();
    this.selfImprovement = new SelfImprovementEngine();
    this.blocks = new Map();
    this.graphs = new Map();
    this.taskHistory = [];
    this.initialized = false;
    this.tools = config.tools || {};

    this._registerBuiltinBlocks();
  }

  _registerBuiltinBlocks() {
    const builtins = [
      new TextProcessBlock(),
      new AIConditionBlock(),
      new AgentInputBlock(),
      new AgentOutputBlock()
    ];
    for (const block of builtins) {
      this.blocks.set(block.name, block);
    }
  }

  async initialize() {
    try {
      console.log('[AutoGPT] Initializing...');
      this.initialized = true;
      console.log(`[AutoGPT] Ready. Blocks: ${[...this.blocks.keys()].join(', ')}`);
      return true;
    } catch (error) {
      console.error('[AutoGPT] Init failed:', error.message);
      return false;
    }
  }

  registerBlock(block) {
    if (!(block instanceof Block)) throw new Error('Must be a Block instance');
    this.blocks.set(block.name, block);
    return this;
  }

  createGraph(name, options = {}) {
    const graph = new AgentGraph(name, options);
    this.graphs.set(name, graph);
    return graph;
  }

  async executeAutonomousTask(goal, constraints = {}, llmClient = null) {
    if (!this.initialized) await this.initialize();

    const taskId = `task_${Date.now()}`;
    const execution = {
      taskId,
      goal,
      startTime: new Date(),
      iterations: [],
      status: 'running',
      result: null,
      error: null,
      memorySnapshot: null
    };

    this.memory.remember('current_goal', goal, 'short');
    this.memory.remember('constraints', constraints, 'short');

    this.emit('task_start', { taskId, goal });

    try {
      console.log(`[AutoGPT] Starting autonomous task: ${goal}`);

      let state = {
        goal,
        completedSteps: [],
        currentObjective: goal,
        context: constraints.context || {},
        failedAttempts: [],
        taskId
      };

      for (let iteration = 0; iteration < this.maxIterations; iteration++) {
        console.log(`[AutoGPT] Iteration ${iteration + 1}/${this.maxIterations}`);
        this.emit('iteration_start', { taskId, iteration: iteration + 1, state });

        try {
          const thought = await this.think(state, llmClient);
          this.emit('thought', { taskId, thought });

          const critique = await this.selfImprovement.generateCritique(thought, null, null, llmClient);
          if (critique.confidence > 0.7) {
            state.refinedThought = critique.improved_thought;
          }

          const action = await this.plan(thought, state, llmClient);
          this.emit('plan', { taskId, action });

          const actionResult = await this.executeAction(action, state);
          this.emit('action_result', { taskId, action, result: actionResult });

          this.memory.remember(`step_${iteration}`, { thought, action, result: actionResult }, 'short');

          const observation = await this.observe(actionResult, state, llmClient);
          this.emit('observation', { taskId, observation });

          this.selfImprovement.recordOutcome(taskId, !observation.error, iteration + 1, observation.observation);

          execution.iterations.push({
            iteration: iteration + 1,
            thought,
            action,
            result: actionResult,
            observation,
            timestamp: new Date().toISOString()
          });

          state = {
            ...state,
            completedSteps: [...state.completedSteps, { action, result: actionResult }],
            lastObservation: observation,
            lastThought: thought,
            context: { ...state.context, ...(observation.context || {}) }
          };

          if (observation.taskComplete) {
            execution.status = 'completed';
            execution.result = observation.result || state;
            this.emit('task_complete', { taskId, result: execution.result });
            break;
          }

          if (observation.error && observation.critical) {
            throw new Error(observation.error);
          }

        } catch (iterError) {
          console.error(`[AutoGPT] Iteration ${iteration + 1} failed:`, iterError.message);
          state.failedAttempts.push({ iteration: iteration + 1, error: iterError.message });
          execution.iterations.push({ iteration: iteration + 1, error: iterError.message, timestamp: new Date().toISOString() });
          this.emit('iteration_error', { taskId, iteration: iteration + 1, error: iterError.message });

          if (iteration === this.maxIterations - 1) throw iterError;
        }
      }

      if (execution.status === 'running') {
        execution.status = 'max_iterations_reached';
        execution.result = state;
      }

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;
      this.emit('task_failed', { taskId, error: error.message });
      console.error('[AutoGPT] Task failed:', error.message);
    }

    execution.endTime = new Date();
    execution.duration = execution.endTime - execution.startTime;
    execution.memorySnapshot = this.memory.snapshot();

    this.taskHistory.push(execution);
    this.memory.consolidate();

    return execution;
  }

  async think(state, llmClient) {
    if (!llmClient) {
      return {
        analysis: `Working towards: ${state.goal}`,
        nextObjective: state.completedSteps.length === 0 ? 'Start the task' : 'Continue progress',
        reasoning: 'Proceeding systematically',
        confidence: 0.7
      };
    }

    const memoryContext = this.memory.search(state.goal).slice(0, 3).map(m => `${m.key}: ${JSON.stringify(m.value)}`).join('\n');

    const prompt = `You are an autonomous AI agent with the following capabilities and constraints.

Current Goal: ${state.goal}
Completed Steps: ${JSON.stringify(state.completedSteps.slice(-3))}
Current Objective: ${state.currentObjective}
Memory Context: ${memoryContext || 'None'}
Failed Attempts: ${state.failedAttempts?.length || 0}

Think carefully about the next step. Respond with JSON only:
{
  "analysis": "your analysis of the current situation",
  "nextObjective": "specific next objective",
  "reasoning": "why this objective",
  "confidence": 0.0-1.0,
  "considerations": ["list", "of", "considerations"]
}`;

    try {
      const response = await llmClient.call([{ role: 'user', content: prompt }], { temperature: 0.7 });
      const text = response.content || response.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {}

    return {
      analysis: `Analyzing goal: ${state.goal}`,
      nextObjective: 'Proceed with task',
      reasoning: 'Default reasoning',
      confidence: 0.5
    };
  }

  async plan(thought, state, llmClient) {
    const availableTools = Object.keys(this.tools);
    const availableBlocks = [...this.blocks.keys()];

    if (!llmClient) {
      return {
        action: 'analyze',
        parameters: { objective: thought.nextObjective },
        tool: availableTools[0] || 'default',
        expectedOutcome: `Complete: ${thought.nextObjective}`,
        fallback: 'retry'
      };
    }

    const prompt = `You are an autonomous AI agent planner.

Goal: ${state.goal}
Current Objective: ${thought.nextObjective}
Analysis: ${thought.analysis}
Available Tools: ${availableTools.join(', ') || 'none'}
Available Blocks: ${availableBlocks.join(', ')}
Completed Steps: ${state.completedSteps.length}

Plan the next action. Respond with JSON only:
{
  "action": "specific action name",
  "parameters": { "key": "value" },
  "tool": "tool name if needed",
  "expectedOutcome": "what we expect",
  "fallback": "fallback if fails",
  "priority": 1-10
}`;

    try {
      const response = await llmClient.call([{ role: 'user', content: prompt }], { temperature: 0.5 });
      const text = response.content || response.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {}

    return {
      action: 'analyze',
      parameters: { objective: thought.nextObjective },
      expectedOutcome: 'Progress towards goal',
      fallback: 'retry',
      priority: 5
    };
  }

  async executeAction(action, state) {
    try {
      console.log(`[AutoGPT] Executing: ${action.action}`);
      this.emit('executing', { action: action.action, parameters: action.parameters });

      if (action.tool && this.tools[action.tool]) {
        const toolFn = this.tools[action.tool];
        const result = await toolFn(action.parameters, state);
        return { action: action.action, tool: action.tool, status: 'executed', result, timestamp: new Date() };
      }

      if (action.action === 'run_block' && action.parameters?.blockName) {
        const block = this.blocks.get(action.parameters.blockName);
        if (block) {
          const result = await block.run(action.parameters.input || {});
          return { action: action.action, status: 'executed', result, timestamp: new Date() };
        }
      }

      return {
        action: action.action,
        status: 'executed',
        result: `Completed: ${action.action}`,
        parameters: action.parameters,
        timestamp: new Date()
      };
    } catch (error) {
      return { action: action.action, status: 'failed', error: error.message, timestamp: new Date() };
    }
  }

  async observe(actionResult, state, llmClient) {
    if (!llmClient) {
      const isComplete = state.completedSteps.length >= 3;
      return {
        observation: `Action ${actionResult.status}: ${actionResult.action}`,
        taskComplete: isComplete,
        progress: Math.min(100, (state.completedSteps.length / 5) * 100),
        nextStep: isComplete ? 'Task done' : 'Continue',
        context: {},
        error: actionResult.error || null,
        critical: false,
        result: isComplete ? state : null
      };
    }

    const prompt = `You are an autonomous AI agent observer.

Original Goal: ${state.goal}
Action Taken: ${JSON.stringify(actionResult)}
Completed Steps: ${state.completedSteps.length}
Last Observation: ${JSON.stringify(state.lastObservation?.observation || 'None')}

Analyze the result and determine next steps. Respond with JSON only:
{
  "observation": "what you observed",
  "taskComplete": false,
  "progress": 0-100,
  "nextStep": "what to do next",
  "context": {},
  "error": null,
  "critical": false,
  "result": null
}`;

    try {
      const response = await llmClient.call([{ role: 'user', content: prompt }], { temperature: 0.5 });
      const text = response.content || response.text || '';
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
    } catch (e) {}

    return {
      observation: 'Action completed',
      taskComplete: false,
      progress: (state.completedSteps.length / this.maxIterations) * 100,
      nextStep: 'Continue',
      context: {},
      error: null,
      critical: false
    };
  }

  async runGraph(graphName, input) {
    const graph = this.graphs.get(graphName);
    if (!graph) throw new Error(`Graph "${graphName}" not found`);
    return await graph.execute(input);
  }

  registerTool(name, fn) {
    this.tools[name] = fn;
    return this;
  }

  getTaskHistory() {
    return this.taskHistory;
  }

  getMemorySnapshot() {
    return this.memory.snapshot();
  }

  getImprovementInsights() {
    return this.selfImprovement.analyze();
  }

  listBlocks() {
    return [...this.blocks.values()].map(b => b.getInfo());
  }

  listGraphs() {
    return [...this.graphs.keys()];
  }
}

module.exports = AutoGPTIntegration;
module.exports.Block = Block;
module.exports.BlockType = BlockType;
module.exports.BlockCategory = BlockCategory;
module.exports.BlockSchema = BlockSchema;
module.exports.AgentMemory = AgentMemory;
module.exports.AgentGraph = AgentGraph;
module.exports.TaskManager = TaskManager;
module.exports.SelfImprovementEngine = SelfImprovementEngine;
module.exports.TextProcessBlock = TextProcessBlock;
module.exports.AIConditionBlock = AIConditionBlock;
module.exports.AgentInputBlock = AgentInputBlock;
module.exports.AgentOutputBlock = AgentOutputBlock;
