/**
 * Groq AI Integration
 * Free API with the fastest LLM inference
 * Models: mixtral-8x7b, llama2-70b, gemma-7b
 */

const axios = require('axios');

class GroqIntegration {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    this.models = {
      'mixtral-8x7b-32768': 'Mixtral 8x7B (Fast)',
      'llama2-70b-4096': 'Llama 2 70B',
      'gemma-7b-it': 'Gemma 7B'
    };
    this.defaultModel = 'mixtral-8x7b-32768';
  }

  async initialize() {
    try {
      const response = await this.client.get('/models');
      console.log('[GroqIntegration] Connected. Available models:', Object.keys(this.models).join(', '));
      return true;
    } catch (error) {
      console.warn('[GroqIntegration] Init warning:', error.message);
      return false;
    }
  }

  async generateText(prompt, options = {}) {
    try {
      const model = options.model || this.defaultModel;
      const maxTokens = options.maxTokens || 1000;
      const temperature = options.temperature || 0.7;

      const response = await this.client.post('/chat/completions', {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
        top_p: options.topP || 1,
        stream: false
      });

      return {
        text: response.data.choices[0].message.content,
        model,
        tokens: response.data.usage.total_tokens,
        stopReason: response.data.choices[0].finish_reason
      };
    } catch (error) {
      throw new Error(`[GroqIntegration] Text generation failed: ${error.message}`);
    }
  }

  async streamText(prompt, onChunk, options = {}) {
    try {
      const model = options.model || this.defaultModel;
      const maxTokens = options.maxTokens || 2000;

      const response = await axios.post(`${this.baseUrl}/chat/completions`, {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: options.temperature || 0.7,
        stream: true
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      });

      return new Promise((resolve, reject) => {
        let fullText = '';
        response.data.on('data', chunk => {
          const lines = chunk.toString().split('\n');
          lines.forEach(line => {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const content = data.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullText += content;
                  onChunk(content);
                }
              } catch (e) {
                // Skip non-JSON lines
              }
            }
          });
        });

        response.data.on('end', () => resolve(fullText));
        response.data.on('error', reject);
      });
    } catch (error) {
      throw new Error(`[GroqIntegration] Stream failed: ${error.message}`);
    }
  }

  getCapabilities() {
    return {
      name: 'Groq',
      models: this.models,
      features: ['chat', 'streaming', 'fast-inference'],
      maxTokens: 32768,
      freeUsage: true
    };
  }
}

module.exports = GroqIntegration;
