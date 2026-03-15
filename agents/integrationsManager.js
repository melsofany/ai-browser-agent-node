/**
 * Integrations Manager
 * Manages all AI model integrations: cloud (DeepSeek) + local (Ollama/Llama/Mistral/Qwen)
 * Enhanced with LangGraph, Open Interpreter, and AutoGPT patterns.
 * Falls back to local models when cloud API is unavailable.
 */

const LlamaIntegration = require('./llamaIntegration');
const MistralIntegration = require('./mistralIntegration');
const QwenIntegration = require('./qwenIntegration');
const OllamaIntegration = require('./ollamaIntegration');
const OpenInterpreterIntegration = require('./openInterpreterIntegration');
const AutoGPTIntegration = require('./autogptIntegration');
const LangGraphIntegration = require('./langgraphIntegration');
const { StateGraph, RetryPolicy, InMemoryCheckpointer, FileCheckpointer, StreamMode, Command, Send, END, START } = require('./langgraphIntegration');
const { ToolCollection, BashTool, EditTool, JavaScriptTool, PythonTool, samplingLoop } = require('./openInterpreterIntegration');
const { Block, BlockType, BlockCategory, AgentGraph, AgentMemory, TaskManager } = require('./autogptIntegration');
const config = require('../config/config');

class IntegrationsManager {
  constructor(cfg = {}) {
    this.config = cfg;
    this.integrations = new Map();
    this.activeProvider = cfg.activeProvider || 'ollama';
    this.initialized = false;
    this.ollama = null;
  }

  /**
   * Initialize all integrations
   */
  async initialize() {
    try {
      console.log('[IntegrationsManager] Initializing integrations...');

      // Primary local provider: Ollama
      this.ollama = new OllamaIntegration({
        baseUrl: config.ollamaUrl,
        model: config.ollamaModel
      });
      await this.ollama.initialize();
      this.integrations.set('ollama', this.ollama);

      // Initialize Llama (file-based weights)
      const llama = new LlamaIntegration(this.config.llama || {});
      await llama.initialize();
      this.integrations.set('llama', llama);

      // Initialize Mistral
      const mistral = new MistralIntegration(this.config.mistral || {});
      await mistral.initialize();
      this.integrations.set('mistral', mistral);

      // Initialize Qwen
      const qwen = new QwenIntegration(this.config.qwen || {});
      await qwen.initialize();
      this.integrations.set('qwen', qwen);

      // Initialize Open Interpreter
      const openInterpreter = new OpenInterpreterIntegration(this.config.openInterpreter || {});
      await openInterpreter.initialize();
      this.integrations.set('open-interpreter', openInterpreter);

      // Initialize AutoGPT
      const autogpt = new AutoGPTIntegration(this.config.autogpt || {});
      await autogpt.initialize();
      this.integrations.set('autogpt', autogpt);

      // Initialize LangGraph
      const langgraph = new LangGraphIntegration(this.config.langgraph || {});
      await langgraph.initialize();
      this.integrations.set('langgraph', langgraph);

      this.initialized = true;
      console.log('[IntegrationsManager] All integrations initialized.');
      return true;
    } catch (error) {
      console.error('[IntegrationsManager] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Get a specific integration by name
   */
  getIntegration(name) {
    return this.integrations.get(name);
  }

  /**
   * Check if Ollama is available
   */
  isOllamaAvailable() {
    return this.ollama?.isAvailable() || false;
  }

  /**
   * Chat using the best available local model (Ollama first)
   */
  async chat(messages, options = {}) {
    if (this.ollama?.isAvailable()) {
      console.log('[IntegrationsManager] Using Ollama for chat...');
      return await this.ollama.chat(messages, options);
    }

    throw new Error('No local AI model available. Please install Ollama (https://ollama.ai) or provide a DEEPSEEK_API_KEY.');
  }

  /**
   * Generate text using best available local model
   */
  async generateText(prompt, options = {}) {
    if (this.ollama?.isAvailable()) {
      console.log('[IntegrationsManager] Using Ollama for text generation...');
      return await this.ollama.generateText(prompt, options);
    }

    throw new Error('No local AI model available.');
  }

  /**
   * Interpret instruction using Open Interpreter + local LLM
   */
  async interpretInstruction(instruction, context = {}) {
    const interpreter = this.integrations.get('open-interpreter');
    if (!interpreter) throw new Error('Open Interpreter not available');
    return await interpreter.interpretInstruction(instruction, context, this.ollama);
  }

  /**
   * Execute code directly via Open Interpreter tool system
   */
  async executeCode(code, language = 'javascript') {
    const interpreter = this.integrations.get('open-interpreter');
    if (!interpreter) throw new Error('Open Interpreter not available');
    return await interpreter.executeCode(code, language);
  }

  /**
   * Run a bash command using the Open Interpreter BashTool
   */
  async runBash(command) {
    const interpreter = this.integrations.get('open-interpreter');
    if (!interpreter) throw new Error('Open Interpreter not available');
    return await interpreter.runBash(command);
  }

  /**
   * Execute autonomous task using AutoGPT + local LLM
   */
  async executeAutonomousTask(goal, constraints = {}) {
    const autogpt = this.integrations.get('autogpt');
    if (!autogpt) throw new Error('AutoGPT not available');
    return await autogpt.executeAutonomousTask(goal, constraints, this.ollama);
  }

  /**
   * Register a custom tool in AutoGPT integration
   */
  registerAgentTool(name, fn) {
    const autogpt = this.integrations.get('autogpt');
    if (autogpt) autogpt.registerTool(name, fn);
    return this;
  }

  /**
   * Build and run a LangGraph StateGraph workflow
   */
  async runLangGraphWorkflow(name, nodes = [], input = {}, options = {}) {
    const lg = this.integrations.get('langgraph');
    if (!lg) throw new Error('LangGraph not available');

    if (!lg.graphs.has(name)) {
      const schema = options.stateSchema || {};
      const graph = lg.createStateGraph(name, schema);
      for (const node of nodes) {
        graph.addNode(node.name, node.fn, node.options || {});
      }
      if (nodes.length > 0) {
        graph.setEntryPoint(nodes[0].name);
        for (let i = 0; i < nodes.length - 1; i++) {
          graph.addEdge(nodes[i].name, nodes[i + 1].name);
        }
      }
      lg.compileGraph(name, { checkpointer: options.checkpointer });
    }

    return await lg.runGraph(name, input, options);
  }

  /**
   * Stream a LangGraph workflow
   */
  async *streamLangGraphWorkflow(name, input = {}, options = {}) {
    const lg = this.integrations.get('langgraph');
    if (!lg) throw new Error('LangGraph not available');
    yield* lg.streamGraph(name, input, { streamMode: options.streamMode || StreamMode.UPDATES, ...options });
  }

  /**
   * Create a LangGraph ReAct agent
   */
  createReactAgent(tools = [], options = {}) {
    const lg = this.integrations.get('langgraph');
    if (!lg) throw new Error('LangGraph not available');
    const llmClient = this.ollama;
    return lg.createReactAgent(llmClient, tools, options);
  }

  /**
   * Build an AutoGPT block graph and run it
   */
  async runBlockGraph(graphName, blocks = [], links = [], input = {}) {
    const autogpt = this.integrations.get('autogpt');
    if (!autogpt) throw new Error('AutoGPT not available');

    let graph = autogpt.graphs.get(graphName);
    if (!graph) {
      graph = autogpt.createGraph(graphName);
      for (const blockConfig of blocks) {
        const block = autogpt.blocks.get(blockConfig.name) || blockConfig.instance;
        if (block) graph.addBlock(block, blockConfig.position);
      }
      for (const link of links) {
        graph.link(link.from, link.fromOutput, link.to, link.toInput);
      }
    }
    return await autogpt.runGraph(graphName, input);
  }

  /**
   * Health check all integrations
   */
  async healthCheck() {
    return {
      timestamp: new Date(),
      ollama: {
        available: this.isOllamaAvailable(),
        model: this.ollama?.model || 'none',
        url: config.ollamaUrl
      },
      deepseek: {
        available: !!config.deepseekApiKey
      },
      integrations: Object.fromEntries(
        Array.from(this.integrations.entries()).map(([name, integration]) => [
          name,
          { status: integration.initialized ? 'ready' : 'not_ready' }
        ])
      )
    };
  }
}

module.exports = IntegrationsManager;
