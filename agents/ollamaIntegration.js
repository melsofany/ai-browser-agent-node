/**
 * Ollama Integration
 * Connects to a local Ollama server to run open-source models:
 * llama3, mistral, qwen2, deepseek-r1, etc.
 * Ollama must be running at OLLAMA_URL (default: http://localhost:11434)
 */

const axios = require('axios');

class OllamaIntegration {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = config.model || process.env.OLLAMA_MODEL || 'llama3';
    this.initialized = false;
    this.available = false;
  }

  async initialize() {
    try {
      const res = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 3000 });
      const models = res.data?.models || [];
      this.available = true;
      this.initialized = true;
      console.log(`[OllamaIntegration] Connected. Available models: ${models.map(m => m.name).join(', ') || 'none'}`);

      // Auto-select best available model
      const preferred = ['deepseek-r1', 'llama3', 'llama2', 'mistral', 'qwen2', 'qwen'];
      for (const name of preferred) {
        const found = models.find(m => m.name.startsWith(name));
        if (found) {
          this.model = found.name;
          console.log(`[OllamaIntegration] Selected model: ${this.model}`);
          break;
        }
      }
      return true;
    } catch (err) {
      this.available = false;
      this.initialized = true;
      console.warn(`[OllamaIntegration] Ollama not reachable at ${this.baseUrl}. Local model fallback disabled.`);
      return false;
    }
  }

  /**
   * Chat completion via Ollama (OpenAI-compatible endpoint)
   */
  async chat(messages, options = {}) {
    if (!this.available) {
      throw new Error('Ollama not available');
    }

    try {
      const response = await axios.post(`${this.baseUrl}/api/chat`, {
        model: options.model || this.model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.4,
          num_predict: options.max_tokens ?? 800,
        }
      }, { timeout: options.timeout || 60000 });

      return response.data?.message?.content || '';
    } catch (err) {
      console.error('[OllamaIntegration] Chat error:', err.message);
      throw err;
    }
  }

  /**
   * Generate text (simple prompt)
   */
  async generateText(prompt, options = {}) {
    if (!this.available) {
      throw new Error('Ollama not available');
    }

    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: options.model || this.model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.4,
          num_predict: options.max_tokens ?? 800,
        }
      }, { timeout: options.timeout || 60000 });

      return {
        success: true,
        text: response.data?.response || '',
        model: this.model,
        mode: 'local_ollama'
      };
    } catch (err) {
      console.error('[OllamaIntegration] Generate error:', err.message);
      throw err;
    }
  }

  /**
   * List available models
   */
  async listModels() {
    try {
      const res = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      return res.data?.models || [];
    } catch (err) {
      return [];
    }
  }

  isAvailable() {
    return this.available;
  }
}

module.exports = OllamaIntegration;
