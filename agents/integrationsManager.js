/**
 * Integrations Manager
 * Unified manager for all AI model integrations
 * Provides a single interface to interact with multiple AI providers
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
    this.fallbackProviders = config.fallbackProviders || ['mistral', 'qwen'];
    this.initialized = false;
  }

  /**
   * Initialize all integrations
   */
  async initialize() {
    try {
      console.log('[IntegrationsManager] Initializing all integrations...');
      
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
      console.log('[IntegrationsManager] All integrations initialized successfully.');
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
   * Set active provider
   */
  setActiveProvider(name) {
    if (this.integrations.has(name)) {
      this.activeProvider = name;
      console.log(`[IntegrationsManager] Active provider changed to: ${name}`);
      return true;
    }
    console.warn(`[IntegrationsManager] Provider ${name} not found`);
    return false;
  }

  /**
   * Generate text using active provider with fallback
   */
  async generateText(prompt, options = {}) {
    const providers = [this.activeProvider, ...this.fallbackProviders];

    for (const providerName of providers) {
      try {
        const provider = this.integrations.get(providerName);
        if (!provider || !provider.generateText) {
          continue;
        }

        console.log(`[IntegrationsManager] Attempting text generation with ${providerName}...`);
        const result = await provider.generateText(prompt, options);
        result.provider = providerName;
        return result;
      } catch (error) {
        console.warn(`[IntegrationsManager] ${providerName} failed: ${error.message}`);
        continue;
      }
    }

    throw new Error('All providers failed for text generation');
  }

  /**
   * Chat using active provider with fallback
   */
  async chat(messages, options = {}) {
    const providers = [this.activeProvider, ...this.fallbackProviders];

    for (const providerName of providers) {
      try {
        const provider = this.integrations.get(providerName);
        if (!provider || !provider.chat) {
          continue;
        }

        console.log(`[IntegrationsManager] Attempting chat with ${providerName}...`);
        const result = await provider.chat(messages, options);
        result.provider = providerName;
        return result;
      } catch (error) {
        console.warn(`[IntegrationsManager] ${providerName} failed: ${error.message}`);
        continue;
      }
    }

    throw new Error('All providers failed for chat');
  }

  /**
   * Analyze task using active provider
   */
  async analyzeTask(taskDescription) {
    const provider = this.getActiveProvider();
    if (!provider || !provider.analyzeTask) {
      throw new Error(`Active provider ${this.activeProvider} does not support task analysis`);
    }

    return await provider.analyzeTask(taskDescription);
  }

  /**
   * Generate code using active provider
   */
  async generateCode(description, language = 'javascript') {
    const provider = this.getActiveProvider();
    if (!provider || !provider.generateCode) {
      throw new Error(`Active provider ${this.activeProvider} does not support code generation`);
    }

    return await provider.generateCode(description, language);
  }

  /**
   * Execute code using Open Interpreter
   */
  async executeCode(code, language = 'javascript', context = {}) {
    const interpreter = this.integrations.get('open-interpreter');
    if (!interpreter) {
      throw new Error('Open Interpreter not available');
    }

    return await interpreter.executeCode(code, language, context);
  }

  /**
   * Interpret instruction using Open Interpreter
   */
  async interpretInstruction(instruction, context = {}) {
    const interpreter = this.integrations.get('open-interpreter');
    if (!interpreter) {
      throw new Error('Open Interpreter not available');
    }

    return await interpreter.interpretInstruction(instruction, context);
  }

  /**
   * Execute autonomous task using AutoGPT
   */
  async executeAutonomousTask(goal, constraints = {}) {
    const autogpt = this.integrations.get('autogpt');
    if (!autogpt) {
      throw new Error('AutoGPT not available');
    }

    return await autogpt.executeAutonomousTask(goal, constraints);
  }

  /**
   * Create and execute workflow using LangGraph
   */
  async createAndExecuteWorkflow(name, nodes, edges, initialState = {}) {
    const langgraph = this.integrations.get('langgraph');
    if (!langgraph) {
      throw new Error('LangGraph not available');
    }

    const graph = langgraph.createGraph(name, nodes, edges);
    return await langgraph.executeGraph(name, initialState);
  }

  /**
   * Get all available providers
   */
  getAvailableProviders() {
    return Array.from(this.integrations.keys());
  }

  /**
   * Get provider capabilities
   */
  getProviderCapabilities(providerName) {
    const provider = this.integrations.get(providerName);
    if (!provider) {
      return null;
    }

    const capabilities = {
      name: providerName,
      methods: []
    };

    // Check available methods
    if (provider.generateText) capabilities.methods.push('generateText');
    if (provider.chat) capabilities.methods.push('chat');
    if (provider.analyzeTask) capabilities.methods.push('analyzeTask');
    if (provider.generateCode) capabilities.methods.push('generateCode');
    if (provider.executeCode) capabilities.methods.push('executeCode');
    if (provider.interpretInstruction) capabilities.methods.push('interpretInstruction');
    if (provider.executeAutonomousTask) capabilities.methods.push('executeAutonomousTask');
    if (provider.createGraph) capabilities.methods.push('createGraph');

    return capabilities;
  }

  /**
   * Get all capabilities
   */
  getAllCapabilities() {
    const capabilities = {};
    for (const providerName of this.getAvailableProviders()) {
      capabilities[providerName] = this.getProviderCapabilities(providerName);
    }
    return capabilities;
  }

  /**
   * Health check all integrations
   */
  async healthCheck() {
    const health = {
      timestamp: new Date(),
      integrations: {}
    };

    for (const [name, integration] of this.integrations) {
      try {
        const initialized = integration.initialized !== false;
        health.integrations[name] = {
          status: initialized ? 'healthy' : 'not_initialized',
          initialized
        };
      } catch (error) {
        health.integrations[name] = {
          status: 'error',
          error: error.message
        };
      }
    }

    return health;
  }

  /**
   * Shutdown all integrations
   */
  async shutdown() {
    console.log('[IntegrationsManager] Shutting down all integrations...');
    this.integrations.clear();
    this.initialized = false;
  }
}

module.exports = IntegrationsManager;
