/**
 * Integrations Manager (Local-Only Mode)
 * Unified manager for all AI model integrations
 * This version is strictly local and does not require external API keys.
 */

const LlamaIntegration = require('./llamaIntegration');
const MistralIntegration = require('./mistralIntegration');
const QwenIntegration = require('./qwenIntegration');
const OpenInterpreterIntegration = require('./openInterpreterIntegration');
const AutoGPTIntegration = require('./autogptIntegration');
const LangGraphIntegration = require('./langgraphIntegration');

class IntegrationsManager {
  constructor(config = {}) {
    this.config = config;
    this.integrations = new Map();
    this.activeProvider = config.activeProvider || 'llama';
    this.initialized = false;
  }

  /**
   * Initialize all integrations locally
   */
  async initialize() {
    try {
      console.log('[IntegrationsManager] Initializing all integrations locally...');
      
      // Initialize Llama
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
      console.log('[IntegrationsManager] All local integrations initialized successfully.');
      return true;
    } catch (error) {
      console.error('[IntegrationsManager] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Get integration by name
   */
  getIntegration(name) {
    return this.integrations.get(name);
  }

  /**
   * Get active provider
   */
  getActiveProvider() {
    return this.integrations.get(this.activeProvider);
  }

  /**
   * Generate text using active local provider
   */
  async generateText(prompt, options = {}) {
    const provider = this.getActiveProvider();
    if (!provider || !provider.generateText) {
      throw new Error(`Active provider ${this.activeProvider} not available for text generation`);
    }

    console.log(`[IntegrationsManager] Generating text with local ${this.activeProvider}...`);
    return await provider.generateText(prompt, options);
  }

  /**
   * Chat using active local provider
   */
  async chat(messages, options = {}) {
    const provider = this.getActiveProvider();
    if (!provider || !provider.chat) {
      throw new Error(`Active provider ${this.activeProvider} not available for chat`);
    }

    console.log(`[IntegrationsManager] Chatting with local ${this.activeProvider}...`);
    return await provider.chat(messages, options);
  }

  /**
   * Interpret instruction using Open Interpreter and local LLM
   */
  async interpretInstruction(instruction, context = {}) {
    const interpreter = this.integrations.get('open-interpreter');
    const localLLM = this.getActiveProvider();
    
    if (!interpreter) throw new Error('Open Interpreter not available');
    if (!localLLM) throw new Error('Local LLM not available for interpretation');

    return await interpreter.interpretInstruction(instruction, context, localLLM);
  }

  /**
   * Execute autonomous task using AutoGPT and local LLM
   */
  async executeAutonomousTask(goal, constraints = {}) {
    const autogpt = this.integrations.get('autogpt');
    const localLLM = this.getActiveProvider();
    
    if (!autogpt) throw new Error('AutoGPT not available');
    if (!localLLM) throw new Error('Local LLM not available for autonomous task');

    return await autogpt.executeAutonomousTask(goal, constraints, localLLM);
  }

  /**
   * Health check all local integrations
   */
  async healthCheck() {
    const health = {
      timestamp: new Date(),
      mode: 'local_only',
      integrations: {}
    };

    for (const [name, integration] of this.integrations) {
      health.integrations[name] = {
        status: integration.initialized ? 'healthy' : 'waiting_for_weights',
        initialized: integration.initialized
      };
    }

    return health;
  }
}

module.exports = IntegrationsManager;
