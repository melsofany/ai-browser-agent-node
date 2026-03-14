/**
 * Thinking Agent
 * Handles AI thinking logs and complex task reasoning
 * Similar to Manus thinking display
 */

const axios = require('axios');
const config = require('../config/config');

class ThinkingAgent {
  constructor() {
    this.thinkingLogs = [];
    this.currentTaskId = null;
    this.listeners = [];
    
    // Initialize DeepSeek
    this.deepseekApiKey = config.deepseekApiKey;
  }

  /**
   * Safely parse JSON from a string, handling markdown blocks and common errors
   */
  safeJsonParse(text) {
    if (!text) return null;
    
    // Clean the text first
    let cleanedText = text.trim();
    
    // Remove markdown code blocks if present
    const jsonBlockMatch = cleanedText.match(/```json\s*([\s\S]*?)\s*```/) || cleanedText.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      cleanedText = jsonBlockMatch[1].trim();
    }

    try {
      return JSON.parse(cleanedText);
    } catch (e) {
      console.warn('[ThinkingAgent] Direct JSON parse failed, attempting recovery...', e.message);
      
      // Attempt to fix common JSON issues (like unterminated strings from truncation)
      try {
        let fixedText = cleanedText;
        
        // If it looks like it's truncated (ends with a partial string or property)
        if (e.message.includes('Unterminated string') || e.message.includes('Unexpected end of JSON input')) {
          // Try to close open quotes
          const quoteCount = (fixedText.match(/"/g) || []).length;
          if (quoteCount % 2 !== 0) {
            fixedText += '"';
          }
          
          // Try to close open braces/brackets
          const openBraces = (fixedText.match(/\{/g) || []).length;
          const closeBraces = (fixedText.match(/\}/g) || []).length;
          for (let i = 0; i < openBraces - closeBraces; i++) {
            fixedText += '}';
          }
          
          const openBrackets = (fixedText.match(/\[/g) || []).length;
          const closeBrackets = (fixedText.match(/\]/g) || []).length;
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            fixedText += ']';
          }
          
          try {
            return JSON.parse(fixedText);
          } catch (e2) {
            // If still failing, try more aggressive extraction
          }
        }

        // Try to find the first '{' and last '}' or '[' and last ']'
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        const firstBracket = cleanedText.indexOf('[');
        const lastBracket = cleanedText.lastIndexOf(']');
        
        let start = -1;
        let end = -1;
        
        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
          start = firstBrace;
          end = lastBrace;
        } else if (firstBracket !== -1) {
          start = firstBracket;
          end = lastBracket;
        }
        
        if (start !== -1 && end !== -1 && end > start) {
          const potentialJson = cleanedText.substring(start, end + 1);
          try {
            return JSON.parse(potentialJson);
          } catch (e3) {
            // Last resort: try to fix the potentialJson too
            let fixedPotential = potentialJson;
            const qCount = (fixedPotential.match(/"/g) || []).length;
            if (qCount % 2 !== 0) fixedPotential += '"';
            
            const oB = (fixedPotential.match(/\{/g) || []).length;
            const cB = (fixedPotential.match(/\}/g) || []).length;
            for (let i = 0; i < oB - cB; i++) fixedPotential += '}';
            
            try {
              return JSON.parse(fixedPotential);
            } catch (e4) {
              console.error('[ThinkingAgent] All JSON recovery attempts failed');
            }
          }
        }
      } catch (recoveryErr) {
        console.error('[ThinkingAgent] JSON recovery logic failed:', recoveryErr.message);
      }
      
      throw e; // Re-throw original error if all attempts fail
    }
  }

  /**
   * Generate thinking logs for a task
   */
  async generateThinking(taskDescription, taskType) {
    console.log('[ThinkingAgent] Generating thinking logs...');
    
    if (!this.deepseekApiKey) {
      console.warn('[ThinkingAgent] No AI API keys configured');
      return [];
    }

    const systemPrompt = `You are an AI thinking agent. Analyze the user's task and provide a VERY CONCISE thinking process.
Provide your reasoning in 1-2 short sentences maximum. Focus ONLY on the immediate action.
Do NOT be verbose. Save tokens.`;

    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Task: ${taskDescription}\nType: ${taskType}` }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${this.deepseekApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      const thinkingContent = response.data.choices[0].message.content;
      
      // Split thinking into logical chunks
      const chunks = this.splitThinking(thinkingContent);
      
      chunks.forEach(chunk => {
        this.addThinkingLog(chunk);
      });

      return chunks;
    } catch (error) {
      if (error.message.includes('API key not valid')) {
        console.error('[ThinkingAgent] CRITICAL ERROR: The Gemini API Key provided is invalid. Please check your AI Studio Secrets.');
      } else {
        console.error('[ThinkingAgent] Error generating thinking:', error.message);
      }
      return [];
    }
  }

  /**
   * Split thinking content into logical chunks
   */
  splitThinking(content) {
    // Split by paragraphs or sentences
    const chunks = content.split(/\n\n+/).filter(chunk => chunk.trim().length > 0);
    return chunks.map(chunk => chunk.trim());
  }

  /**
   * Add thinking log
   */
  addThinkingLog(content) {
    const log = {
      timestamp: new Date().toISOString(),
      content,
    };
    this.thinkingLogs.push(log);
    
    // Notify listeners
    this.notifyListeners('thinking', log);
    
    console.log(`[ThinkingAgent] Thinking: ${content.substring(0, 100)}...`);
  }

  /**
   * Get thinking logs for a task
   */
  getThinkingLogs(limit = 50) {
    return this.thinkingLogs.slice(-limit);
  }

  /**
   * Clear thinking logs
   */
  clearThinkingLogs() {
    this.thinkingLogs = [];
  }

  /**
   * Register event listener
   */
  on(event, callback) {
    this.listeners.push({ event, callback });
  }

  /**
   * Notify listeners
   */
  notifyListeners(event, data) {
    this.listeners
      .filter(listener => listener.event === event)
      .forEach(listener => listener.callback(data));
  }

  /**
   * Generate complex task reasoning
   */
  async reasonAboutComplexTask(taskDescription, context = {}) {
    console.log('[ThinkingAgent] Reasoning about complex task...');
    
    if (!this.deepseekApiKey) {
      return null;
    }

    const systemPrompt = `You are an expert task reasoner. Analyze the following task and provide:
1. Task complexity level (simple/medium/complex)
2. Required capabilities
3. Potential risks or challenges
4. Recommended approach
5. Estimated execution steps

Return as structured JSON.`;

    try {
      // Sanitize context to avoid circular structures
      const sanitizedContext = {};
      if (context) {
        for (const key in context) {
          if (typeof context[key] !== 'object' || context[key] === null) {
            sanitizedContext[key] = context[key];
          } else {
            sanitizedContext[key] = Array.isArray(context[key]) ? '[Array]' : '[Object]';
          }
        }
      }

      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Task: ${taskDescription}\nContext: ${JSON.stringify(sanitizedContext)}` }
        ],
      }, {
        headers: {
          'Authorization': `Bearer ${this.deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });
      const responseText = response.data.choices[0].message.content;

      const reasoning = this.safeJsonParse(responseText);
      return reasoning;
    } catch (error) {
      console.error('[ThinkingAgent] Error reasoning about task:', error.message);
      return null;
    }
  }

  /**
   * Generate step-by-step thinking for execution
   */
  async generateExecutionThinking(step, previousResults = []) {
    console.log('[ThinkingAgent] Generating execution thinking...');
    
    if (!this.deepseekApiKey) {
      return null;
    }

    const systemPrompt = `You are an execution thinking agent. Provide a 1-sentence execution strategy for this step.
Be extremely concise. Save tokens.`;

    try {
      // Sanitize input to avoid circular structures
      const sanitizedStep = {
        action: step.action,
        params: step.params,
        description: step.description,
        order: step.order
      };
      
      const sanitizedResults = Array.isArray(previousResults) 
        ? previousResults.map(r => ({ success: r.success, error: r.error, action: r.action?.type }))
        : [];

      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Step: ${JSON.stringify(sanitizedStep)}\nPrevious Results: ${JSON.stringify(sanitizedResults)}` }
        ]
      }, {
        headers: {
          'Authorization': `Bearer ${this.deepseekApiKey}`,
          'Content-Type': 'application/json'
        }
      });
      const thinking = response.data.choices[0].message.content;

      this.addThinkingLog(thinking);
      return thinking;
    } catch (error) {
      console.error('[ThinkingAgent] Error generating execution thinking:', error.message);
      return null;
    }
  }
}

module.exports = ThinkingAgent;
