/**
 * Mistral Integration Module
 * Integrates Mistral AI models with the AI Browser Agent
 * Supports both local and remote inference
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

class MistralIntegration {
  constructor(config = {}) {
    this.modelPath = config.modelPath || path.join(__dirname, '../integrations/mistral');
    this.modelName = config.modelName || 'mistral-7b'; // Default model
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 2048;
    this.apiKey = config.apiKey || process.env.MISTRAL_API_KEY;
    this.apiEndpoint = config.apiEndpoint || 'https://api.mistral.ai/v1';
    this.initialized = false;
  }

  /**
   * Initialize Mistral integration
   */
  async initialize() {
    try {
      console.log('[MistralIntegration] Initializing Mistral integration...');
      
      // Verify API key is available
      if (!this.apiKey) {
        console.warn('[MistralIntegration] Mistral API key not configured.');
      }

      this.initialized = true;
      console.log('[MistralIntegration] Mistral integration initialized successfully.');
      return true;
    } catch (error) {
      console.error('[MistralIntegration] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Generate text using Mistral model
   */
  async generateText(prompt, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.apiKey) {
      throw new Error('Mistral API key is required for text generation');
    }

    const mergedOptions = {
      temperature: options.temperature || this.temperature,
      maxTokens: options.maxTokens || this.maxTokens,
      topP: options.topP || 1.0,
      ...options
    };

    try {
      console.log('[MistralIntegration] Generating text using Mistral...');
      
      const response = await axios.post(`${this.apiEndpoint}/chat/completions`, {
        model: this.modelName,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: mergedOptions.temperature,
        max_tokens: mergedOptions.maxTokens,
        top_p: mergedOptions.topP
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return {
        success: true,
        text: response.data.choices[0].message.content,
        model: this.modelName,
        usage: response.data.usage
      };
    } catch (error) {
      console.error('[MistralIntegration] Text generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Chat completion using Mistral
   */
  async chat(messages, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.apiKey) {
      throw new Error('Mistral API key is required for chat');
    }

    try {
      console.log('[MistralIntegration] Processing chat request...');
      
      const response = await axios.post(`${this.apiEndpoint}/chat/completions`, {
        model: this.modelName,
        messages: messages,
        temperature: options.temperature || this.temperature,
        max_tokens: options.maxTokens || this.maxTokens,
        top_p: options.topP || 1.0
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return {
        success: true,
        response: response.data.choices[0].message.content,
        model: this.modelName,
        usage: response.data.usage
      };
    } catch (error) {
      console.error('[MistralIntegration] Chat failed:', error.message);
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
        console.warn('[MistralIntegration] Failed to parse JSON response:', parseError.message);
      }

      return {
        taskType: 'unknown',
        complexity: 'medium',
        steps: [],
        risks: [],
        recommendations: []
      };
    } catch (error) {
      console.error('[MistralIntegration] Task analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Code generation using Mistral
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
      console.error('[MistralIntegration] Code generation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return [
      'mistral-7b',
      'mistral-8x7b',
      'mistral-large',
      'mistral-medium',
      'mistral-small'
    ];
  }

  /**
   * Set model
   */
  setModel(modelName) {
    if (this.getAvailableModels().includes(modelName)) {
      this.modelName = modelName;
      console.log(`[MistralIntegration] Model changed to: ${modelName}`);
      return true;
    }
    console.warn(`[MistralIntegration] Model ${modelName} not available`);
    return false;
  }

  /**
   * Embedding generation using Mistral
   */
  async generateEmbedding(text) {
    if (!this.apiKey) {
      throw new Error('Mistral API key is required for embeddings');
    }

    try {
      const response = await axios.post(`${this.apiEndpoint}/embeddings`, {
        model: 'mistral-embed',
        input: text
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      return {
        success: true,
        embedding: response.data.data[0].embedding,
        model: 'mistral-embed'
      };
    } catch (error) {
      console.error('[MistralIntegration] Embedding generation failed:', error.message);
      throw error;
    }
  }
}

module.exports = MistralIntegration;
