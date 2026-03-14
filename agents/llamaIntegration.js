/**
 * Llama Integration Module
 * Integrates Meta-Llama models with the AI Browser Agent
 * Supports local model inference without external API calls
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class LlamaIntegration {
  constructor(config = {}) {
    this.modelPath = config.modelPath || path.join(__dirname, '../integrations/llama');
    this.modelName = config.modelName || 'llama-2-7b'; // Default model
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 2048;
    this.localMode = config.localMode !== false; // Enable local mode by default
    this.apiEndpoint = config.apiEndpoint || 'http://localhost:8000'; // For local inference server
    this.remoteApiKey = config.remoteApiKey || process.env.LLAMA_API_KEY;
    this.initialized = false;
  }

  /**
   * Initialize Llama integration
   */
  async initialize() {
    try {
      console.log('[LlamaIntegration] Initializing Llama integration...');
      
      // Check if local model files exist
      const modelExists = fs.existsSync(this.modelPath);
      if (!modelExists) {
        console.warn('[LlamaIntegration] Local model path not found. Using remote API fallback.');
        this.localMode = false;
      }

      this.initialized = true;
      console.log('[LlamaIntegration] Llama integration initialized successfully.');
      return true;
    } catch (error) {
      console.error('[LlamaIntegration] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Generate text using Llama model
   */
  async generateText(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    const mergedOptions = {
      temperature: options.temperature || this.temperature,
      maxTokens: options.maxTokens || this.maxTokens,
      topP: options.topP || 0.9,
      topK: options.topK || 50,
      ...options
    };

    try {
      if (this.localMode) {
        return await this.generateLocal(prompt, mergedOptions);
      } else {
        return await this.generateRemote(prompt, mergedOptions);
      }
    } catch (error) {
      console.error('[LlamaIntegration] Text generation failed:', error.message);
      // Fallback to remote if local fails
      if (this.localMode) {
        console.log('[LlamaIntegration] Falling back to remote API...');
        return await this.generateRemote(prompt, mergedOptions);
      }
      throw error;
    }
  }

  /**
   * Generate text using local Llama model
   */
  async generateLocal(prompt, options) {
    try {
      console.log('[LlamaIntegration] Generating text using local model...');
      
      // Attempt to connect to local inference server
      const response = await axios.post(`${this.apiEndpoint}/v1/completions`, {
        model: this.modelName,
        prompt: prompt,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        top_k: options.topK,
        stop: options.stop || ['\\n\\n']
      }, {
        timeout: 60000
      });

      return {
        success: true,
        text: response.data.choices[0].text,
        model: this.modelName,
        mode: 'local',
        usage: response.data.usage
      };
    } catch (error) {
      console.error('[LlamaIntegration] Local generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate text using remote Llama API
   */
  async generateRemote(prompt, options) {
    try {
      console.log('[LlamaIntegration] Generating text using remote API...');
      
      if (!this.remoteApiKey) {
        throw new Error('Remote API key not configured');
      }

      const response = await axios.post('https://api.llama.ai/v1/completions', {
        model: this.modelName,
        prompt: prompt,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        top_p: options.topP,
        top_k: options.topK
      }, {
        headers: {
          'Authorization': `Bearer ${this.remoteApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return {
        success: true,
        text: response.data.choices[0].text,
        model: this.modelName,
        mode: 'remote',
        usage: response.data.usage
      };
    } catch (error) {
      console.error('[LlamaIntegration] Remote generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Chat completion using Llama
   */
  async chat(messages, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      console.log('[LlamaIntegration] Processing chat request...');
      
      // Format messages for Llama
      const formattedPrompt = this.formatMessagesForLlama(messages);
      
      const result = await this.generateText(formattedPrompt, options);
      
      return {
        success: true,
        response: result.text,
        model: this.modelName,
        mode: result.mode
      };
    } catch (error) {
      console.error('[LlamaIntegration] Chat failed:', error.message);
      throw error;
    }
  }

  /**
   * Format messages for Llama chat format
   */
  formatMessagesForLlama(messages) {
    return messages.map(msg => {
      if (msg.role === 'system') {
        return `System: ${msg.content}`;
      } else if (msg.role === 'user') {
        return `User: ${msg.content}`;
      } else if (msg.role === 'assistant') {
        return `Assistant: ${msg.content}`;
      }
      return msg.content;
    }).join('\n');
  }

  /**
   * Analyze task and generate execution plan
   */
  async analyzeTask(taskDescription) {
    try {
      const prompt = `Analyze the following task and provide a structured execution plan in JSON format:
      
Task: ${taskDescription}

Provide response in this JSON format:
{
  "taskType": "string",
  "complexity": "simple|medium|complex",
  "steps": [
    {
      "order": number,
      "action": "string",
      "description": "string",
      "estimatedTime": "string"
    }
  ],
  "risks": ["string"],
  "recommendations": ["string"]
}`;

      const result = await this.generateText(prompt, {
        maxTokens: 1024,
        temperature: 0.3
      });

      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.warn('[LlamaIntegration] Failed to parse JSON response:', parseError.message);
      }

      return {
        taskType: 'unknown',
        complexity: 'medium',
        steps: [],
        risks: [],
        recommendations: []
      };
    } catch (error) {
      console.error('[LlamaIntegration] Task analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Code generation using Llama
   */
  async generateCode(description, language = 'javascript') {
    try {
      const prompt = `Generate ${language} code based on the following description:

Description: ${description}

Provide only the code without explanations.`;

      const result = await this.generateText(prompt, {
        maxTokens: 2048,
        temperature: 0.5
      });

      return {
        success: true,
        code: result.text,
        language: language
      };
    } catch (error) {
      console.error('[LlamaIntegration] Code generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return [
      'llama-2-7b',
      'llama-2-13b',
      'llama-2-70b',
      'llama-3-8b',
      'llama-3-70b'
    ];
  }

  /**
   * Set model
   */
  setModel(modelName) {
    if (this.getAvailableModels().includes(modelName)) {
      this.modelName = modelName;
      console.log(`[LlamaIntegration] Model changed to: ${modelName}`);
      return true;
    }
    console.warn(`[LlamaIntegration] Model ${modelName} not available`);
    return false;
  }
}

module.exports = LlamaIntegration;
