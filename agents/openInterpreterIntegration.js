/**
 * Open Interpreter Integration Module
 * Integrates Open Interpreter with the AI Browser Agent
 * Enables code execution and system command interpretation
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

class OpenInterpreterIntegration {
  constructor(config = {}) {
    this.interpreterPath = config.interpreterPath || path.join(__dirname, '../integrations/open-interpreter');
    this.sandboxMode = config.sandboxMode !== false; // Enable sandbox by default for safety
    this.allowedLanguages = config.allowedLanguages || ['javascript', 'python', 'bash', 'sql'];
    this.executionTimeout = config.executionTimeout || 30000; // 30 seconds
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    this.initialized = false;
  }

  /**
   * Initialize Open Interpreter integration
   */
  async initialize() {
    try {
      console.log('[OpenInterpreterIntegration] Initializing Open Interpreter...');
      
      // Check if interpreter files exist
      const interpreterExists = fs.existsSync(this.interpreterPath);
      if (!interpreterExists) {
        console.warn('[OpenInterpreterIntegration] Interpreter path not found.');
      }

      this.initialized = true;
      console.log('[OpenInterpreterIntegration] Open Interpreter initialized successfully.');
      return true;
    } catch (error) {
      console.error('[OpenInterpreterIntegration] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Execute code safely
   */
  async executeCode(code, language = 'javascript', context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.allowedLanguages.includes(language)) {
      throw new Error(`Language ${language} is not allowed. Allowed: ${this.allowedLanguages.join(', ')}`);
    }

    try {
      console.log(`[OpenInterpreterIntegration] Executing ${language} code...`);
      
      let command;
      switch (language) {
        case 'javascript':
          return await this.executeJavaScript(code, context);
        case 'python':
          return await this.executePython(code, context);
        case 'bash':
          return await this.executeBash(code, context);
        case 'sql':
          return await this.executeSQL(code, context);
        default:
          throw new Error(`Unsupported language: ${language}`);
      }
    } catch (error) {
      console.error(`[OpenInterpreterIntegration] Code execution failed:`, error.message);
      throw error;
    }
  }

  /**
   * Execute JavaScript code
   */
  async executeJavaScript(code, context = {}) {
    try {
      // Create a safe execution context
      const sandbox = {
        console: console,
        Math: Math,
        Date: Date,
        JSON: JSON,
        ...context
      };

      // Use Function constructor for safer execution
      const func = new Function(...Object.keys(sandbox), code);
      const result = await func(...Object.values(sandbox));

      return {
        success: true,
        language: 'javascript',
        result: result,
        output: String(result)
      };
    } catch (error) {
      return {
        success: false,
        language: 'javascript',
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Execute Python code
   */
  async executePython(code, context = {}) {
    try {
      // Create temporary Python file
      const tempFile = `/tmp/temp_${Date.now()}.py`;
      fs.writeFileSync(tempFile, code);

      const { stdout, stderr } = await execPromise(`python3 ${tempFile}`, {
        timeout: this.executionTimeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      // Clean up
      fs.unlinkSync(tempFile);

      return {
        success: true,
        language: 'python',
        output: stdout,
        error: stderr || null
      };
    } catch (error) {
      return {
        success: false,
        language: 'python',
        error: error.message,
        stderr: error.stderr || ''
      };
    }
  }

  /**
   * Execute Bash commands
   */
  async executeBash(code, context = {}) {
    try {
      const { stdout, stderr } = await execPromise(code, {
        timeout: this.executionTimeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB
      });

      return {
        success: true,
        language: 'bash',
        output: stdout,
        error: stderr || null
      };
    } catch (error) {
      return {
        success: false,
        language: 'bash',
        error: error.message,
        stderr: error.stderr || ''
      };
    }
  }

  /**
   * Execute SQL queries
   */
  async executeSQL(code, context = {}) {
    try {
      if (!context.database) {
        throw new Error('Database connection required for SQL execution');
      }

      const result = await context.database.query(code);

      return {
        success: true,
        language: 'sql',
        result: result,
        rows: result.length || 0
      };
    } catch (error) {
      return {
        success: false,
        language: 'sql',
        error: error.message
      };
    }
  }

  /**
   * Interpret and execute natural language instructions
   */
  async interpretInstruction(instruction, context = {}) {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is required for instruction interpretation');
    }

    try {
      console.log('[OpenInterpreterIntegration] Interpreting instruction...');
      
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an expert code interpreter. Convert natural language instructions into executable code.
Always respond with a JSON object containing:
{
  "language": "javascript|python|bash|sql",
  "code": "the executable code",
  "explanation": "brief explanation of what the code does"
}`
          },
          {
            role: 'user',
            content: instruction
          }
        ],
        temperature: 0.3,
        max_tokens: 1024
      }, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const content = response.data.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Failed to parse code from response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Execute the generated code
      const executionResult = await this.executeCode(parsed.code, parsed.language, context);

      return {
        success: true,
        instruction: instruction,
        generated: parsed,
        execution: executionResult
      };
    } catch (error) {
      console.error('[OpenInterpreterIntegration] Instruction interpretation failed:', error.message);
      throw error;
    }
  }

  /**
   * Get supported languages
   */
  getSupportedLanguages() {
    return this.allowedLanguages;
  }

  /**
   * Add allowed language
   */
  addAllowedLanguage(language) {
    if (!this.allowedLanguages.includes(language)) {
      this.allowedLanguages.push(language);
      console.log(`[OpenInterpreterIntegration] Added language: ${language}`);
    }
  }

  /**
   * Remove allowed language
   */
  removeAllowedLanguage(language) {
    const index = this.allowedLanguages.indexOf(language);
    if (index > -1) {
      this.allowedLanguages.splice(index, 1);
      console.log(`[OpenInterpreterIntegration] Removed language: ${language}`);
    }
  }

  /**
   * Validate code safety
   */
  validateCodeSafety(code, language) {
    const dangerousPatterns = [
      /rm\s+-rf/i, // Dangerous bash command
      /eval\s*\(/i, // Eval function
      /exec\s*\(/i, // Exec function
      /require\s*\(\s*['"]child_process['"]\s*\)/i, // Child process
      /import\s+os/i, // OS module import
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        return {
          safe: false,
          reason: `Potentially dangerous pattern detected: ${pattern}`
        };
      }
    }

    return { safe: true };
  }
}

module.exports = OpenInterpreterIntegration;
