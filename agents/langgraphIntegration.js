/**
 * LangGraph Integration Module
 * Based on patterns from https://github.com/langchain-ai/langgraph
 * Implements: StateGraph, Channels, Checkpointing, Streaming, RetryPolicy, Send/Command
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ─────────────────────────────────────────────
// Constants (mirrors langgraph/constants.py)
// ─────────────────────────────────────────────
const START = '__start__';
const END = '__end__';
const INTERRUPT = '__interrupt__';
const TAG_HIDDEN = 'langsmith:hidden';

// ─────────────────────────────────────────────
// Stream Modes (mirrors langgraph/types.py)
// ─────────────────────────────────────────────
const StreamMode = {
  VALUES: 'values',
  UPDATES: 'updates',
  MESSAGES: 'messages',
  CHECKPOINTS: 'checkpoints',
  TASKS: 'tasks',
  DEBUG: 'debug',
  CUSTOM: 'custom'
};

// ─────────────────────────────────────────────
// Retry Policy (mirrors langgraph/_internal/_retry.py)
// ─────────────────────────────────────────────
class RetryPolicy {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.initialInterval = options.initialInterval || 500;
    this.backoffFactor = options.backoffFactor || 2;
    this.maxInterval = options.maxInterval || 10000;
    this.jitter = options.jitter !== false;
    this.retryOn = options.retryOn || this._defaultRetryOn.bind(this);
  }

  _defaultRetryOn(error) {
    const nonRetryable = [
      'TypeError', 'SyntaxError', 'ReferenceError',
      'RangeError', 'URIError', 'EvalError'
    ];
    if (nonRetryable.includes(error.constructor.name)) return false;
    if (error.status && error.status >= 400 && error.status < 500) return false;
    return true;
  }

  async execute(fn) {
    let lastError;
    let interval = this.initialInterval;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (!this.retryOn(error) || attempt === this.maxAttempts) throw error;

        const jitter = this.jitter ? Math.random() * interval * 0.1 : 0;
        await new Promise(r => setTimeout(r, interval + jitter));
        interval = Math.min(interval * this.backoffFactor, this.maxInterval);
      }
    }
    throw lastError;
  }
}

// ─────────────────────────────────────────────
// Channels (mirrors langgraph/channels/)
// ─────────────────────────────────────────────
class LastValueChannel {
  constructor(name) {
    this.name = name;
    this.value = undefined;
  }
  update(value) { this.value = value; }
  get() { return this.value; }
  checkpoint() { return this.value; }
  restore(value) { this.value = value; }
}

class BinaryOperatorChannel {
  constructor(name, reducer) {
    this.name = name;
    this.reducer = reducer;
    this.value = undefined;
  }
  update(value) {
    this.value = this.value === undefined ? value : this.reducer(this.value, value);
  }
  get() { return this.value; }
  checkpoint() { return this.value; }
  restore(value) { this.value = value; }
}

class TopicChannel {
  constructor(name) {
    this.name = name;
    this.values = [];
  }
  update(value) {
    if (Array.isArray(value)) this.values.push(...value);
    else this.values.push(value);
  }
  get() { return [...this.values]; }
  checkpoint() { return [...this.values]; }
  restore(values) { this.values = [...(values || [])]; }
  clear() { this.values = []; }
}

// ─────────────────────────────────────────────
// Checkpoint / Memory Saver
// ─────────────────────────────────────────────
class InMemoryCheckpointer {
  constructor() {
    this.checkpoints = new Map();
  }

  async save(threadId, checkpoint) {
    const key = threadId;
    if (!this.checkpoints.has(key)) this.checkpoints.set(key, []);
    this.checkpoints.get(key).push({
      ...checkpoint,
      ts: new Date().toISOString(),
      id: `ckpt_${Date.now()}`
    });
    return checkpoint;
  }

  async load(threadId) {
    const history = this.checkpoints.get(threadId) || [];
    return history[history.length - 1] || null;
  }

  async list(threadId) {
    return this.checkpoints.get(threadId) || [];
  }

  async delete(threadId) {
    this.checkpoints.delete(threadId);
  }
}

class FileCheckpointer {
  constructor(filePath) {
    this.filePath = filePath || path.join(__dirname, '../.cache/checkpoints.json');
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  _load() {
    if (!fs.existsSync(this.filePath)) return {};
    try { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')); }
    catch { return {}; }
  }

  _save(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  async save(threadId, checkpoint) {
    const data = this._load();
    if (!data[threadId]) data[threadId] = [];
    data[threadId].push({ ...checkpoint, ts: new Date().toISOString(), id: `ckpt_${Date.now()}` });
    this._save(data);
    return checkpoint;
  }

  async load(threadId) {
    const data = this._load();
    const history = data[threadId] || [];
    return history[history.length - 1] || null;
  }

  async list(threadId) {
    const data = this._load();
    return data[threadId] || [];
  }

  async delete(threadId) {
    const data = this._load();
    delete data[threadId];
    this._save(data);
  }
}

// ─────────────────────────────────────────────
// Send / Command (mirrors langgraph/types.py)
// ─────────────────────────────────────────────
class Send {
  constructor(node, args) {
    this.node = node;
    this.args = args;
  }
}

class Command {
  constructor(options = {}) {
    this.goto = options.goto;
    this.update = options.update || {};
    this.resume = options.resume;
    this.graph = options.graph;
  }
}

class Interrupt {
  constructor(value) {
    this.value = value;
  }
}

// ─────────────────────────────────────────────
// StateGraph (mirrors langgraph/graph/state.py)
// ─────────────────────────────────────────────
class StateGraph {
  constructor(stateSchema = {}) {
    this.stateSchema = stateSchema;
    this.nodes = new Map();
    this.edges = [];
    this.conditionalEdges = new Map();
    this.entryPoint = null;
    this.compiled = false;
  }

  addNode(name, fn, options = {}) {
    if (this.compiled) throw new Error('Cannot modify compiled graph');
    this.nodes.set(name, {
      name,
      fn,
      retryPolicy: options.retryPolicy || null,
      metadata: options.metadata || {}
    });
    return this;
  }

  addEdge(from, to) {
    if (this.compiled) throw new Error('Cannot modify compiled graph');
    this.edges.push({ from, to, type: 'direct' });
    return this;
  }

  addConditionalEdges(from, condition, pathMap = null) {
    if (this.compiled) throw new Error('Cannot modify compiled graph');
    this.conditionalEdges.set(from, { condition, pathMap });
    return this;
  }

  setEntryPoint(node) {
    this.entryPoint = node;
    this.edges.push({ from: START, to: node, type: 'direct' });
    return this;
  }

  setFinishPoint(node) {
    this.edges.push({ from: node, to: END, type: 'direct' });
    return this;
  }

  compile(options = {}) {
    if (!this.entryPoint && !this.edges.find(e => e.from === START)) {
      throw new Error('Graph has no entry point. Call setEntryPoint() or add edge from START.');
    }
    this.compiled = true;
    return new CompiledStateGraph(this, options);
  }
}

// ─────────────────────────────────────────────
// CompiledStateGraph (mirrors langgraph/pregel)
// ─────────────────────────────────────────────
class CompiledStateGraph extends EventEmitter {
  constructor(graph, options = {}) {
    super();
    this.graph = graph;
    this.checkpointer = options.checkpointer || null;
    this.interruptBefore = options.interruptBefore || [];
    this.interruptAfter = options.interruptAfter || [];
    this.maxConcurrency = options.maxConcurrency || 1;
    this.retryPolicy = options.retryPolicy || null;
  }

  _initState(overrides = {}) {
    const state = {};
    for (const [key, schema] of Object.entries(this.graph.stateSchema)) {
      state[key] = schema.default !== undefined ? schema.default : null;
    }
    return { ...state, ...overrides };
  }

  _applyUpdate(state, update) {
    const newState = { ...state };
    for (const [key, value] of Object.entries(update)) {
      const schema = this.graph.stateSchema[key];
      if (schema && schema.reducer) {
        newState[key] = schema.reducer(newState[key], value);
      } else {
        newState[key] = value;
      }
    }
    return newState;
  }

  _getNextNodes(currentNode, state) {
    const nextNodes = [];

    const directEdges = this.graph.edges.filter(e => e.from === currentNode);
    for (const edge of directEdges) {
      if (edge.to !== END) nextNodes.push(edge.to);
    }

    const conditional = this.graph.conditionalEdges.get(currentNode);
    if (conditional) {
      const result = conditional.condition(state);
      if (result === END) return [];
      if (result instanceof Send) return [result];
      if (Array.isArray(result)) return result;
      if (conditional.pathMap) {
        const resolved = conditional.pathMap[result];
        if (resolved && resolved !== END) nextNodes.push(resolved);
      } else if (result && result !== END) {
        nextNodes.push(result);
      }
    }

    return nextNodes;
  }

  async invoke(input, config = {}) {
    const threadId = config.threadId || `thread_${Date.now()}`;
    let state = this._initState(input);

    if (this.checkpointer) {
      const saved = await this.checkpointer.load(threadId);
      if (saved) state = this._applyUpdate(this._initState(), saved.state || {});
    }

    const steps = [];
    let queue = [this.graph.entryPoint || this._findStartNode()];
    const visited = new Set();

    while (queue.length > 0) {
      const nodeName = queue.shift();
      if (!nodeName || nodeName === END) break;
      if (visited.has(nodeName) && !this.graph.nodes.get(nodeName)?.allowCycle) continue;
      visited.add(nodeName);

      const nodeSpec = this.graph.nodes.get(nodeName);
      if (!nodeSpec) throw new Error(`Node "${nodeName}" not found in graph`);

      if (this.interruptBefore.includes(nodeName)) {
        this.emit('interrupt', { node: nodeName, state, type: 'before' });
      }

      let update;
      try {
        const execFn = async () => nodeSpec.fn(state, config);
        if (nodeSpec.retryPolicy) {
          update = await nodeSpec.retryPolicy.execute(execFn);
        } else if (this.retryPolicy) {
          update = await this.retryPolicy.execute(execFn);
        } else {
          update = await execFn();
        }
      } catch (error) {
        const step = { node: nodeName, error: error.message, state: { ...state } };
        steps.push(step);
        this.emit('error', step);
        throw error;
      }

      if (update instanceof Command) {
        if (update.update) state = this._applyUpdate(state, update.update);
        if (update.goto) {
          const targets = Array.isArray(update.goto) ? update.goto : [update.goto];
          queue = [...targets.filter(t => t !== END), ...queue];
        }
      } else if (update && typeof update === 'object') {
        state = this._applyUpdate(state, update);
      }

      const step = { node: nodeName, output: update, state: { ...state }, timestamp: new Date().toISOString() };
      steps.push(step);
      this.emit('step', step);

      if (this.interruptAfter.includes(nodeName)) {
        this.emit('interrupt', { node: nodeName, state, type: 'after' });
      }

      const nextNodes = this._getNextNodes(nodeName, state);
      for (const next of nextNodes) {
        if (next instanceof Send) {
          const target = this.graph.nodes.get(next.node);
          if (target) queue.push(next.node);
        } else {
          queue.push(next);
        }
      }
    }

    if (this.checkpointer) {
      await this.checkpointer.save(threadId, { state, steps, threadId });
    }

    return { state, steps, threadId };
  }

  async *stream(input, config = {}) {
    const streamMode = config.streamMode || StreamMode.VALUES;
    const threadId = config.threadId || `thread_${Date.now()}`;
    let state = this._initState(input);

    if (this.checkpointer) {
      const saved = await this.checkpointer.load(threadId);
      if (saved) state = this._applyUpdate(this._initState(), saved.state || {});
    }

    let queue = [this.graph.entryPoint || this._findStartNode()];
    const visited = new Set();

    while (queue.length > 0) {
      const nodeName = queue.shift();
      if (!nodeName || nodeName === END) break;
      if (visited.has(nodeName)) continue;
      visited.add(nodeName);

      const nodeSpec = this.graph.nodes.get(nodeName);
      if (!nodeSpec) throw new Error(`Node "${nodeName}" not found in graph`);

      if (streamMode === StreamMode.TASKS || streamMode === StreamMode.DEBUG) {
        yield { type: 'task_start', node: nodeName, state: { ...state } };
      }

      let update;
      try {
        update = await nodeSpec.fn(state, config);
      } catch (error) {
        yield { type: 'error', node: nodeName, error: error.message };
        throw error;
      }

      if (update instanceof Command) {
        if (update.update) state = this._applyUpdate(state, update.update);
        if (update.goto) {
          const targets = Array.isArray(update.goto) ? update.goto : [update.goto];
          queue = [...targets.filter(t => t !== END), ...queue];
        }
      } else if (update && typeof update === 'object') {
        state = this._applyUpdate(state, update);
      }

      if (streamMode === StreamMode.UPDATES) {
        yield { type: 'update', node: nodeName, update };
      } else if (streamMode === StreamMode.VALUES) {
        yield { type: 'values', node: nodeName, state: { ...state } };
      } else if (streamMode === StreamMode.MESSAGES) {
        if (update && update.messages) {
          for (const msg of (Array.isArray(update.messages) ? update.messages : [update.messages])) {
            yield { type: 'message', node: nodeName, message: msg };
          }
        }
      } else if (streamMode === StreamMode.CHECKPOINTS && this.checkpointer) {
        const ckpt = await this.checkpointer.save(threadId, { state, node: nodeName });
        yield { type: 'checkpoint', node: nodeName, checkpoint: ckpt };
      }

      if (streamMode === StreamMode.TASKS || streamMode === StreamMode.DEBUG) {
        yield { type: 'task_end', node: nodeName, output: update, state: { ...state } };
      }

      const nextNodes = this._getNextNodes(nodeName, state);
      for (const next of nextNodes) {
        if (next instanceof Send) queue.push(next.node);
        else queue.push(next);
      }
    }

    if (this.checkpointer) {
      await this.checkpointer.save(threadId, { state, threadId, complete: true });
    }

    yield { type: 'final', state: { ...state }, threadId };
  }

  _findStartNode() {
    const startEdge = this.graph.edges.find(e => e.from === START);
    if (startEdge) return startEdge.to;
    return this.graph.nodes.keys().next().value;
  }

  async getState(threadId) {
    if (!this.checkpointer) return null;
    return await this.checkpointer.load(threadId);
  }

  async getStateHistory(threadId) {
    if (!this.checkpointer) return [];
    return await this.checkpointer.list(threadId);
  }

  drawMermaid() {
    const lines = ['graph TD'];
    for (const edge of this.graph.edges) {
      const from = edge.from === START ? 'START' : edge.from;
      const to = edge.to === END ? 'END' : edge.to;
      lines.push(`  ${from} --> ${to}`);
    }
    for (const [from, cond] of this.graph.conditionalEdges.entries()) {
      if (cond.pathMap) {
        for (const [label, to] of Object.entries(cond.pathMap)) {
          const toNode = to === END ? 'END' : to;
          lines.push(`  ${from} -->|${label}| ${toNode}`);
        }
      } else {
        lines.push(`  ${from} -->|condition| ...`);
      }
    }
    return lines.join('\n');
  }
}

// ─────────────────────────────────────────────
// Prebuilt: ReAct Agent (mirrors langgraph prebuilt)
// ─────────────────────────────────────────────
function createReactAgent(llm, tools = [], options = {}) {
  const toolMap = {};
  for (const tool of tools) {
    toolMap[tool.name] = tool;
  }

  const stateSchema = {
    messages: { default: [], reducer: (a, b) => [...(a || []), ...(Array.isArray(b) ? b : [b])] },
    iterations: { default: 0 },
    lastToolResult: { default: null }
  };

  const graph = new StateGraph(stateSchema);

  graph.addNode('agent', async (state) => {
    const response = await llm.call(state.messages, {
      tools: tools.map(t => ({ name: t.name, description: t.description, schema: t.schema }))
    });
    return {
      messages: [{ role: 'assistant', content: response.content, tool_calls: response.tool_calls }],
      iterations: (state.iterations || 0) + 1
    };
  });

  graph.addNode('tools', async (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    if (!lastMsg || !lastMsg.tool_calls) return {};

    const results = [];
    for (const toolCall of lastMsg.tool_calls) {
      const tool = toolMap[toolCall.name];
      if (!tool) {
        results.push({ role: 'tool', name: toolCall.name, content: `Tool "${toolCall.name}" not found`, tool_call_id: toolCall.id });
        continue;
      }
      try {
        const result = await tool.fn(toolCall.args);
        results.push({ role: 'tool', name: toolCall.name, content: String(result), tool_call_id: toolCall.id });
      } catch (err) {
        results.push({ role: 'tool', name: toolCall.name, content: `Error: ${err.message}`, tool_call_id: toolCall.id });
      }
    }
    return { messages: results, lastToolResult: results };
  });

  graph.setEntryPoint('agent');

  graph.addConditionalEdges('agent', (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    const maxIterations = options.maxIterations || 10;
    if ((state.iterations || 0) >= maxIterations) return END;
    if (lastMsg && lastMsg.tool_calls && lastMsg.tool_calls.length > 0) return 'tools';
    return END;
  });

  graph.addEdge('tools', 'agent');

  return graph.compile({ checkpointer: options.checkpointer, retryPolicy: options.retryPolicy });
}

// ─────────────────────────────────────────────
// Main Integration Class
// ─────────────────────────────────────────────
class LangGraphIntegration {
  constructor(config = {}) {
    this.langgraphPath = config.langgraphPath || path.join(__dirname, '../integrations/langgraph');
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.graphs = new Map();
    this.states = new Map();
    this.initialized = false;
    this.defaultCheckpointer = config.checkpointer || new InMemoryCheckpointer();
    this.defaultRetryPolicy = config.retryPolicy || new RetryPolicy();
  }

  async initialize() {
    try {
      console.log('[LangGraphIntegration] Initializing...');
      this.initialized = true;
      console.log('[LangGraphIntegration] Ready.');
      return true;
    } catch (error) {
      console.error('[LangGraphIntegration] Init failed:', error.message);
      return false;
    }
  }

  createStateGraph(name, stateSchema = {}) {
    const graph = new StateGraph(stateSchema);
    this.graphs.set(name, graph);
    return graph;
  }

  compileGraph(name, options = {}) {
    const graph = this.graphs.get(name);
    if (!graph) throw new Error(`Graph "${name}" not found`);
    const compiled = graph.compile({
      checkpointer: options.checkpointer || this.defaultCheckpointer,
      retryPolicy: options.retryPolicy || this.defaultRetryPolicy,
      ...options
    });
    this.graphs.set(`${name}:compiled`, compiled);
    return compiled;
  }

  async runGraph(name, input, config = {}) {
    if (!this.initialized) await this.initialize();
    const compiled = this.graphs.get(`${name}:compiled`);
    if (!compiled) throw new Error(`Compiled graph "${name}" not found. Call compileGraph() first.`);
    return await compiled.invoke(input, config);
  }

  async *streamGraph(name, input, config = {}) {
    if (!this.initialized) await this.initialize();
    const compiled = this.graphs.get(`${name}:compiled`);
    if (!compiled) throw new Error(`Compiled graph "${name}" not found.`);
    yield* compiled.stream(input, config);
  }

  createReactAgent(llm, tools, options = {}) {
    return createReactAgent(llm, tools, {
      checkpointer: options.checkpointer || this.defaultCheckpointer,
      retryPolicy: options.retryPolicy || this.defaultRetryPolicy,
      ...options
    });
  }

  createCheckpointer(type = 'memory', options = {}) {
    if (type === 'file') return new FileCheckpointer(options.filePath);
    return new InMemoryCheckpointer();
  }

  createRetryPolicy(options = {}) {
    return new RetryPolicy(options);
  }

  getGraph(name) { return this.graphs.get(name); }
  listGraphs() { return Array.from(this.graphs.keys()); }
  deleteGraph(name) { return this.graphs.delete(name); }
  getState(key) { return this.states.get(key); }
  updateState(key, value) { this.states.set(key, value); }
  clearState(key) { this.states.delete(key); }

  visualizeGraph(name) {
    const compiled = this.graphs.get(`${name}:compiled`);
    const graph = compiled ? compiled.graph : this.graphs.get(name);
    if (!graph) throw new Error(`Graph "${name}" not found`);
    const g = compiled ? compiled.graph : graph;
    return {
      name,
      nodes: Array.from(g.nodes.values()).map(n => ({ id: n.name, type: 'action' })),
      edges: g.edges.map(e => ({ from: e.from, to: e.to })),
      conditionalEdges: Array.from(g.conditionalEdges.keys()),
      mermaid: compiled ? compiled.drawMermaid() : null
    };
  }
}

module.exports = LangGraphIntegration;
module.exports.StateGraph = StateGraph;
module.exports.CompiledStateGraph = CompiledStateGraph;
module.exports.RetryPolicy = RetryPolicy;
module.exports.InMemoryCheckpointer = InMemoryCheckpointer;
module.exports.FileCheckpointer = FileCheckpointer;
module.exports.Send = Send;
module.exports.Command = Command;
module.exports.Interrupt = Interrupt;
module.exports.StreamMode = StreamMode;
module.exports.createReactAgent = createReactAgent;
module.exports.START = START;
module.exports.END = END;
