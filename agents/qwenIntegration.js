/**
 * Qwen Integration Module
 * Integrates Alibaba Qwen models with the AI Browser Agent
 * Supports both local and remote inference
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class QwenIntegration {
  constructor(config = {}) {
    this.modelPath = config.modelPath || path.join(__dirname, '../integrations/qwen');
    this.modelName = config.modelName || 'qwen-7b'; // Default model
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 2048;
    this.apiKey = config.apiKey || process.env.QWEN_API_KEY;
    this.apiEndpoint = config.apiEndpoint || 'https://dashscope.aliyuncs.com/api/v1';
    this.initialized = false;
  }

  /**
   * Initialize Qwen integration
   */
  async initialize() {
    try {
      console.log('[QwenIntegration] Initializing Qwen integration...');
      
      // Verify API key is available
      if (!this.apiKey) {
        console.warn('[QwenIntegration] Qwen API key not configured.');
      }

      this.initialized = true;
      console.log('[QwenIntegration] Qwen integration initialized successfully.');
      return true;
    } catch (error) {
      console.error('[QwenIntegration] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Generate text using Qwen model
   */
  async generateText(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.apiKey) {
      throw new Error('Qwen API key is required for text generation');
    }

    const mergedOptions = {
      temperature: options.temperature || this.temperature,
      maxTokens: options.maxTokens || this.maxTokens,
      topP: options.topP || 0.9,
      topK: options.topK || 0,
      ...options
    };

    try {
      console.log('[QwenIntegration] Generating text using Qwen...');
      
      const response = await axios.post(`${this.apiEndpoint}/services/aigc/text-generation/generation`, {
        model: this.modelName,
        input: {
          prompt: prompt
        },
        parameters: {
          temperature: mergedOptions.temperature,
          max_tokens: mergedOptions.maxTokens,
          top_p: mergedOptions.topP,
          top_k: mergedOptions.topK
        }
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return {
        success: true,
        text: response.data.output.text,
        model: this.modelName,
        usage: response.data.usage
      };
    } catch (error) {
      console.error('[QwenIntegration] Text generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Chat completion using Qwen
   */
  async chat(messages, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.apiKey) {
      throw new Error('Qwen API key is required for chat');
    }

    try {
      console.log('[QwenIntegration] Processing chat request...');
      
      const response = await axios.post(`${this.apiEndpoint}/services/aigc/text-generation/generation`, {
        model: this.modelName,
        input: {
          messages: messages
        },
        parameters: {
          temperature: options.temperature || this.temperature,
          max_tokens: options.maxTokens || this.maxTokens,
          top_p: options.topP || 0.9
        }
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return {
        success: true,
        response: response.data.output.text,
        model: this.modelName,
        usage: response.data.usage
      };
    } catch (error) {
      console.error('[QwenIntegration] Chat failed:', error.message);
      throw error;
    }
  }

  /**
   * Analyze task and generate execution plan
   */
  async analyzeTask(taskDescription) {
    try {
      const messages = [
        {
          role: 'system',
          content: 'You are a task analysis expert. Analyze tasks and provide structured execution plans in JSON format.'
        },
        {
          role: 'user',
          content: `Analyze the following task and provide a structured execution plan:

Task: ${taskDescription}

Provide response in JSON format with fields: taskType, complexity, steps (array with order, action, description, estimatedTime), risks, recommendations`
        }
      ];

      const result = await this.chat(messages, {
        maxTokens: 1024,
        temperature: 0.3
      });

      try {
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.warn('[QwenIntegration] Failed to parse JSON response:', parseError.message);
      }

      return {
        taskType: 'unknown',
        complexity: 'medium',
        steps: [],
        risks: [],
        recommendations: []
      };
    } catch (error) {
      console.error('[QwenIntegration] Task analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Code generation using Qwen
   */
  async generateCode(description, language = 'javascript') {
    try {
      const messages = [
        {
          role: 'system',
          content: `You are an expert ${language} developer. Generate clean, well-documented code.`
        },
        {
          role: 'user',
          content: `Generate ${language} code based on the following description:

Description: ${description}

Provide only the code without explanations.`
        }
      ];

      const result = await this.chat(messages, {
        maxTokens: 2048,
        temperature: 0.5
      });

      return {
        success: true,
        code: result.response,
        language: language
      };
    } catch (error) {
      console.error('[QwenIntegration] Code generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return [
      'qwen-7b',
      'qwen-14b',
      'qwen-72b',
      'qwen-turbo',
      'qwen-plus',
      'qwen-max'
    ];
  }

  /**
   * Set model
   */
  setModel(modelName) {
    if (this.getAvailableModels().includes(modelName)) {
      this.modelName = modelName;
      console.log(`[QwenIntegration] Model changed to: ${modelName}`);
      return true;
    }
    console.warn(`[QwenIntegration] Model ${modelName} not available`);
    return false;
  }

  /**
   * Embedding generation using Qwen
   */
  async generateEmbedding(text) {
    if (!this.apiKey) {
      throw new Error('Qwen API key is required for embeddings');
    }

    try {
      const response = await axios.post(`${this.apiEndpoint}/services/embeddings/text-embedding/text-embedding`, {
        input: {
          texts: [text]
        },
        model: 'text-embedding-v1'
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return {
        success: true,
        embedding: response.data.output.embeddings[0].embedding,
        model: 'text-embedding-v1'
      };
    } catch (error) {
      console.error('[QwenIntegration] Embedding generation failed:', error.message);
      throw error;
    }
  }
}

module.exports = QwenIntegration;
