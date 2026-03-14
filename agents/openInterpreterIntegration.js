/**
 * Open Interpreter Integration Module (Local-Only Mode)
 * Integrates Open Interpreter with the AI Browser Agent
 * This version is strictly local and does not require external API keys.
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execPromise = promisify(exec);

class OpenInterpreterIntegration {
  constructor(config = {}) {
    this.interpreterPath = config.interpreterPath || path.join(__dirname, '../integrations/open-interpreter');
    this.sandboxMode = config.sandboxMode !== false;
    this.allowedLanguages = config.allowedLanguages || ['javascript', 'python', 'bash', 'sql'];
    this.executionTimeout = config.executionTimeout || 30000;
    this.initialized = false;
  }

  /**
   * Initialize Open Interpreter integration locally
   */
  async initialize() {
    try {
      console.log('[OpenInterpreterIntegration] Initializing Local Open Interpreter...');
      
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
   * Execute code locally (No API)
   */
  async executeCode(code, language = 'javascript', context = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.allowedLanguages.includes(language)) {
      throw new Error(`Language ${language} is not allowed. Allowed: ${this.allowedLanguages.join(', ')}`);
    }

    try {
      console.log(`[OpenInterpreterIntegration] Executing ${language} code locally...`);
      
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
   * Execute JavaScript code locally
   */
  async executeJavaScript(code, context = {}) {
    try {
      const sandbox = { console, Math, Date, JSON, ...context };
      const func = new Function(...Object.keys(sandbox), code);
      const result = await func(...Object.values(sandbox));

      return {
        success: true,
        language: 'javascript',
        result: result,
        output: String(result)
      };
    } catch (error) {
      return { success: false, language: 'javascript', error: error.message };
    }
  }

  /**
   * Execute Python code locally
   */
  async executePython(code, context = {}) {
    try {
      const tempFile = `/tmp/temp_${Date.now()}.py`;
      fs.writeFileSync(tempFile, code);

      const { stdout, stderr } = await execPromise(`python3 ${tempFile}`, {
        timeout: this.executionTimeout,
        maxBuffer: 10 * 1024 * 1024
      });

      fs.unlinkSync(tempFile);

      return {
        success: true,
        language: 'python',
        output: stdout,
        error: stderr || null
      };
    } catch (error) {
      return { success: false, language: 'python', error: error.message };
    }
  }

  /**
   * Execute Bash commands locally
   */
  async executeBash(code, context = {}) {
    try {
      const { stdout, stderr } = await execPromise(code, {
        timeout: this.executionTimeout,
        maxBuffer: 10 * 1024 * 1024
      });

      return {
        success: true,
        language: 'bash',
        output: stdout,
        error: stderr || null
      };
    } catch (error) {
      return { success: false, language: 'bash', error: error.message };
    }
  }

  /**
   * Execute SQL queries locally
   */
  async executeSQL(code, context = {}) {
    try {
      if (!context.database) {
        throw new Error('Database connection required for SQL execution');
      }
      const result = await context.database.query(code);
      return { success: true, language: 'sql', result: result, rows: result.length || 0 };
    } catch (error) {
      return { success: false, language: 'sql', error: error.message };
    }
  }

  /**
   * Interpret and execute natural language instructions locally
   * Uses the local LLM (Llama/Mistral/Qwen) instead of OpenAI API
   */
  async interpretInstruction(instruction, context = {}, localLLM) {
    if (!localLLM) {
      throw new Error('Local LLM engine is required for local instruction interpretation');
    }

    try {
      console.log('[OpenInterpreterIntegration] Interpreting instruction locally using local LLM...');
      
      const prompt = `You are an expert code interpreter. Convert natural language instructions into executable code.
Always respond with a JSON object containing:
{
  "language": "javascript|python|bash|sql",
  "code": "the executable code",
  "explanation": "brief explanation of what the code does"
}

Instruction: ${instruction}`;

      const result = await localLLM.generateText(prompt, { temperature: 0.1 });
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Failed to parse code from local LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const executionResult = await this.executeCode(parsed.code, parsed.language, context);

      return {
        success: true,
        instruction: instruction,
        generated: parsed,
        execution: executionResult
      };
    } catch (error) {
      console.error('[OpenInterpreterIntegration] Local instruction interpretation failed:', error.message);
      throw error;
    }
  }
}

module.exports = OpenInterpreterIntegration;
