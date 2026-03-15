/**
 * Open Interpreter Integration Module
 * Based on patterns from https://github.com/OpenInterpreter/open-interpreter
 * Implements: ToolCollection, ToolResult, AsyncInterpreter, SamplingLoop, ComputerUse
 */

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const { EventEmitter } = require('events');

const execPromise = promisify(exec);

// ─────────────────────────────────────────────
// ToolResult (mirrors interpreter/computer_use/tools/base.py)
// ─────────────────────────────────────────────
class ToolResult {
  constructor({ output = null, error = null, base64Image = null, system = null } = {}) {
    this.output = output;
    this.error = error;
    this.base64Image = base64Image;
    this.system = system;
  }

  get hasContent() {
    return !!(this.output || this.error || this.base64Image || this.system);
  }

  add(other) {
    return new ToolResult({
      output: this._combine(this.output, other.output),
      error: this._combine(this.error, other.error),
      base64Image: this.base64Image || other.base64Image,
      system: this._combine(this.system, other.system)
    });
  }

  _combine(a, b) {
    if (a && b) return a + b;
    return a || b;
  }

  replace(overrides = {}) {
    return new ToolResult({
      output: overrides.output !== undefined ? overrides.output : this.output,
      error: overrides.error !== undefined ? overrides.error : this.error,
      base64Image: overrides.base64Image !== undefined ? overrides.base64Image : this.base64Image,
      system: overrides.system !== undefined ? overrides.system : this.system
    });
  }

  toJSON() {
    return { output: this.output, error: this.error, base64Image: !!this.base64Image, system: this.system };
  }
}

class CLIResult extends ToolResult {}
class ToolFailure extends ToolResult {}

class ToolError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ToolError';
  }
}

// ─────────────────────────────────────────────
// Base Tool (mirrors interpreter/computer_use/tools/base.py)
// ─────────────────────────────────────────────
class BaseTool {
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  async call(args) {
    throw new Error(`Tool ${this.name} not implemented`);
  }

  toParams() {
    return {
      name: this.name,
      description: this.description,
      input_schema: this.inputSchema || { type: 'object', properties: {} }
    };
  }
}

// ─────────────────────────────────────────────
// BashTool (mirrors interpreter/computer_use/tools/bash.py)
// ─────────────────────────────────────────────
class BashTool extends BaseTool {
  constructor(options = {}) {
    super('bash', 'Execute bash commands in a persistent shell session');
    this.timeout = options.timeout || 120000;
    this.maxOutputBytes = options.maxOutputBytes || 100 * 1024;
    this.inputSchema = {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The bash command to execute' },
        restart: { type: 'boolean', description: 'Restart the shell session' }
      },
      required: ['command']
    };
    this._process = null;
  }

  async call({ command, restart = false }) {
    if (restart) {
      this._process = null;
      return new ToolResult({ system: 'Shell restarted.' });
    }

    try {
      const { stdout, stderr } = await execPromise(command, {
        timeout: this.timeout,
        maxBuffer: this.maxOutputBytes,
        shell: '/bin/bash'
      });

      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      return new CLIResult({ output: output || '(no output)', error: stderr || null });
    } catch (error) {
      if (error.killed) {
        return new ToolFailure({ error: `Command timed out after ${this.timeout}ms` });
      }
      return new CLIResult({
        output: error.stdout || null,
        error: error.stderr || error.message
      });
    }
  }
}

// ─────────────────────────────────────────────
// EditTool (mirrors interpreter/computer_use/tools/edit.py)
// ─────────────────────────────────────────────
class EditTool extends BaseTool {
  constructor() {
    super('str_replace_editor', 'Edit files using view, create, str_replace, insert, delete operations');
    this.inputSchema = {
      type: 'object',
      properties: {
        command: { type: 'string', enum: ['view', 'create', 'str_replace', 'insert', 'undo_edit'] },
        path: { type: 'string' },
        file_text: { type: 'string' },
        old_str: { type: 'string' },
        new_str: { type: 'string' },
        insert_line: { type: 'integer' },
        new_str_insert: { type: 'string' }
      },
      required: ['command', 'path']
    };
    this._history = new Map();
  }

  async call({ command, path: filePath, file_text, old_str, new_str, insert_line, new_str_insert }) {
    try {
      switch (command) {
        case 'view': {
          if (!fs.existsSync(filePath)) return new ToolFailure({ error: `File not found: ${filePath}` });
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            const entries = fs.readdirSync(filePath).map(f => {
              const full = path.join(filePath, f);
              return `${fs.statSync(full).isDirectory() ? 'd' : '-'} ${f}`;
            });
            return new ToolResult({ output: entries.join('\n') });
          }
          const content = fs.readFileSync(filePath, 'utf8');
          const lines = content.split('\n').map((l, i) => `${i + 1}\t${l}`).join('\n');
          return new ToolResult({ output: lines });
        }

        case 'create': {
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          if (!this._history.has(filePath)) this._history.set(filePath, []);
          fs.writeFileSync(filePath, file_text || '');
          return new ToolResult({ output: `File created: ${filePath}` });
        }

        case 'str_replace': {
          if (!fs.existsSync(filePath)) return new ToolFailure({ error: `File not found: ${filePath}` });
          const current = fs.readFileSync(filePath, 'utf8');
          if (!current.includes(old_str)) return new ToolFailure({ error: `String not found in file: ${old_str.slice(0, 50)}` });
          if (!this._history.has(filePath)) this._history.set(filePath, []);
          this._history.get(filePath).push(current);
          const updated = current.replace(old_str, new_str || '');
          fs.writeFileSync(filePath, updated);
          return new ToolResult({ output: `File updated: ${filePath}` });
        }

        case 'insert': {
          if (!fs.existsSync(filePath)) return new ToolFailure({ error: `File not found: ${filePath}` });
          const lines = fs.readFileSync(filePath, 'utf8').split('\n');
          if (!this._history.has(filePath)) this._history.set(filePath, []);
          this._history.get(filePath).push(lines.join('\n'));
          lines.splice(insert_line || 0, 0, new_str_insert || '');
          fs.writeFileSync(filePath, lines.join('\n'));
          return new ToolResult({ output: `Line inserted at ${insert_line} in ${filePath}` });
        }

        case 'undo_edit': {
          const history = this._history.get(filePath);
          if (!history || history.length === 0) return new ToolFailure({ error: 'No edit history to undo' });
          const prev = history.pop();
          fs.writeFileSync(filePath, prev);
          return new ToolResult({ output: `Undo successful for ${filePath}` });
        }

        default:
          return new ToolFailure({ error: `Unknown command: ${command}` });
      }
    } catch (error) {
      return new ToolFailure({ error: error.message });
    }
  }
}

// ─────────────────────────────────────────────
// JavaScriptTool
// ─────────────────────────────────────────────
class JavaScriptTool extends BaseTool {
  constructor(options = {}) {
    super('javascript', 'Execute JavaScript code in a sandboxed environment');
    this.timeout = options.timeout || 30000;
    this.inputSchema = {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute' }
      },
      required: ['code']
    };
  }

  async call({ code }) {
    try {
      const logs = [];
      const sandbox = {
        console: {
          log: (...args) => logs.push(args.map(String).join(' ')),
          error: (...args) => logs.push('[ERROR] ' + args.map(String).join(' ')),
          warn: (...args) => logs.push('[WARN] ' + args.map(String).join(' ')),
          info: (...args) => logs.push('[INFO] ' + args.map(String).join(' '))
        },
        Math, Date, JSON, String, Number, Boolean, Array, Object, Promise
      };
      const fn = new Function(...Object.keys(sandbox), `return (async () => { ${code} })()`);
      const result = await fn(...Object.values(sandbox));
      const output = [...logs];
      if (result !== undefined) output.push(`=> ${JSON.stringify(result)}`);
      return new CLIResult({ output: output.join('\n') || '(no output)' });
    } catch (error) {
      return new ToolFailure({ error: `${error.name}: ${error.message}` });
    }
  }
}

// ─────────────────────────────────────────────
// PythonTool
// ─────────────────────────────────────────────
class PythonTool extends BaseTool {
  constructor(options = {}) {
    super('python', 'Execute Python code');
    this.timeout = options.timeout || 60000;
    this.inputSchema = {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Python code to execute' }
      },
      required: ['code']
    };
  }

  async call({ code }) {
    const tmpFile = `/tmp/oi_py_${Date.now()}.py`;
    try {
      fs.writeFileSync(tmpFile, code);
      const { stdout, stderr } = await execPromise(`python3 "${tmpFile}"`, {
        timeout: this.timeout,
        maxBuffer: 10 * 1024 * 1024
      });
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      return new CLIResult({ output: stdout || '(no output)', error: stderr || null });
    } catch (error) {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      return new CLIResult({ output: error.stdout || null, error: error.stderr || error.message });
    }
  }
}

// ─────────────────────────────────────────────
// ToolCollection (mirrors interpreter/computer_use/tools/collection.py)
// ─────────────────────────────────────────────
class ToolCollection {
  constructor(...tools) {
    this.tools = tools;
    this.toolMap = {};
    for (const tool of tools) {
      this.toolMap[tool.name] = tool;
    }
  }

  add(tool) {
    this.tools.push(tool);
    this.toolMap[tool.name] = tool;
    return this;
  }

  toParams() {
    return this.tools.map(t => t.toParams());
  }

  async run({ name, toolInput }) {
    const tool = this.toolMap[name];
    if (!tool) return new ToolFailure({ error: `Tool "${name}" not found. Available: ${Object.keys(this.toolMap).join(', ')}` });
    try {
      return await tool.call(toolInput);
    } catch (error) {
      if (error instanceof ToolError) return new ToolFailure({ error: error.message });
      return new ToolFailure({ error: error.message });
    }
  }

  get names() {
    return Object.keys(this.toolMap);
  }
}

// ─────────────────────────────────────────────
// Async Sampling Loop (mirrors interpreter/computer_use/loop.py)
// ─────────────────────────────────────────────
async function* samplingLoop({
  model,
  messages,
  toolCollection,
  systemPrompt,
  llmClient,
  maxTokens = 4096,
  onlyNMostRecentImages = null,
  onChunk = null
}) {
  const currentMessages = [...messages];

  while (true) {
    if (onlyNMostRecentImages) {
      _filterRecentImages(currentMessages, onlyNMostRecentImages);
    }

    let response;
    try {
      response = await llmClient.call({
        model,
        messages: currentMessages,
        systemPrompt,
        tools: toolCollection.toParams(),
        maxTokens,
        stream: false
      });
    } catch (error) {
      yield { type: 'error', error: error.message };
      return;
    }

    if (!response) {
      yield { type: 'error', error: 'No response from LLM' };
      return;
    }

    const { content, stop_reason } = response;

    currentMessages.push({ role: 'assistant', content });

    if (stop_reason === 'end_turn' || !content) {
      yield { type: 'complete', messages: currentMessages };
      return;
    }

    const toolUseBlocks = (Array.isArray(content) ? content : [content])
      .filter(b => b && b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      if (content) {
        const text = typeof content === 'string' ? content : content.find?.(b => b.type === 'text')?.text;
        if (text) yield { type: 'text', text };
      }
      yield { type: 'complete', messages: currentMessages };
      return;
    }

    const toolResults = [];
    for (const toolUse of toolUseBlocks) {
      yield { type: 'tool_start', name: toolUse.name, input: toolUse.input };

      const result = await toolCollection.run({ name: toolUse.name, toolInput: toolUse.input });

      yield { type: 'tool_result', name: toolUse.name, result: result.toJSON() };

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: _formatToolResult(result)
      });
    }

    currentMessages.push({ role: 'user', content: toolResults });
  }
}

function _formatToolResult(result) {
  const parts = [];
  if (result.output) parts.push({ type: 'text', text: result.output });
  if (result.error) parts.push({ type: 'text', text: `Error: ${result.error}` });
  if (result.base64Image) parts.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: result.base64Image } });
  return parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts;
}

function _filterRecentImages(messages, n) {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'image') {
          count++;
          if (count > n) block._hidden = true;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────
// Conversation Manager (mirrors OpenInterpreter core)
// ─────────────────────────────────────────────
class ConversationManager {
  constructor() {
    this.messages = [];
    this.maxHistory = 50;
  }

  add(role, content, type = 'message') {
    this.messages.push({ role, type, content, timestamp: new Date().toISOString() });
    if (this.messages.length > this.maxHistory * 2) {
      this.messages = this.messages.slice(-this.maxHistory);
    }
  }

  get last() {
    return this.messages[this.messages.length - 1];
  }

  clear() {
    this.messages = [];
  }

  toOpenAI() {
    return this.messages
      .filter(m => m.role !== 'server')
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  }
}

// ─────────────────────────────────────────────
// Main Integration Class (mirrors AsyncInterpreter)
// ─────────────────────────────────────────────
class OpenInterpreterIntegration extends EventEmitter {
  constructor(config = {}) {
    super();
    this.interpreterPath = config.interpreterPath || path.join(__dirname, '../integrations/open-interpreter');
    this.sandboxMode = config.sandboxMode !== false;
    this.allowedLanguages = config.allowedLanguages || ['javascript', 'python', 'bash', 'sql'];
    this.executionTimeout = config.executionTimeout || 30000;
    this.autoRun = config.autoRun !== false;
    this.safeMode = config.safeMode || 'off';
    this.initialized = false;

    this.conversation = new ConversationManager();
    this.stopEvent = false;
    this.respondThread = null;

    this.toolCollection = new ToolCollection(
      new BashTool({ timeout: this.executionTimeout }),
      new EditTool(),
      new JavaScriptTool({ timeout: this.executionTimeout }),
      new PythonTool({ timeout: this.executionTimeout })
    );
  }

  async initialize() {
    try {
      console.log('[OpenInterpreter] Initializing...');
      this.initialized = true;
      console.log('[OpenInterpreter] Ready. Tools:', this.toolCollection.names.join(', '));
      return true;
    } catch (error) {
      console.error('[OpenInterpreter] Init failed:', error.message);
      return false;
    }
  }

  async executeCode(code, language = 'javascript', context = {}) {
    if (!this.initialized) await this.initialize();

    const langToTool = {
      javascript: 'javascript',
      python: 'python',
      bash: 'bash',
      sh: 'bash'
    };

    const toolName = langToTool[language.toLowerCase()];
    if (!toolName) throw new Error(`Unsupported language: ${language}. Allowed: ${this.allowedLanguages.join(', ')}`);

    const result = await this.toolCollection.run({ name: toolName, toolInput: { code, command: code } });
    this.emit('code_executed', { language, code, result: result.toJSON() });
    return result;
  }

  async interpretInstruction(instruction, context = {}, llmClient = null) {
    if (!llmClient) throw new Error('LLM client required for instruction interpretation');

    this.conversation.add('user', instruction);

    const systemPrompt = `You are an expert programmer. When asked to perform tasks:
1. Write clean, working code
2. Use the available tools: ${this.toolCollection.names.join(', ')}
3. Explain what you're doing
4. Handle errors gracefully`;

    const results = [];

    for await (const event of samplingLoop({
      model: context.model || 'gpt-4',
      messages: this.conversation.toOpenAI(),
      toolCollection: this.toolCollection,
      systemPrompt,
      llmClient,
      maxTokens: context.maxTokens || 4096
    })) {
      results.push(event);
      this.emit('event', event);

      if (event.type === 'text') {
        this.conversation.add('assistant', event.text);
      } else if (event.type === 'tool_result') {
        this.emit('tool_result', event);
      }
    }

    return {
      success: !results.some(r => r.type === 'error'),
      instruction,
      events: results,
      messages: this.conversation.toOpenAI()
    };
  }

  async runBash(command) {
    const tool = new BashTool({ timeout: this.executionTimeout });
    return await tool.call({ command });
  }

  async editFile(operation) {
    const tool = new EditTool();
    return await tool.call(operation);
  }

  async viewFile(filePath) {
    const tool = new EditTool();
    return await tool.call({ command: 'view', path: filePath });
  }

  async createFile(filePath, content) {
    const tool = new EditTool();
    return await tool.call({ command: 'create', path: filePath, file_text: content });
  }

  stop() {
    this.stopEvent = true;
    this.emit('stopped');
  }

  reset() {
    this.conversation.clear();
    this.stopEvent = false;
    this.emit('reset');
  }

  addTool(tool) {
    this.toolCollection.add(tool);
  }

  getTools() {
    return this.toolCollection.names;
  }
}

module.exports = OpenInterpreterIntegration;
module.exports.ToolResult = ToolResult;
module.exports.CLIResult = CLIResult;
module.exports.ToolFailure = ToolFailure;
module.exports.ToolError = ToolError;
module.exports.BaseTool = BaseTool;
module.exports.BashTool = BashTool;
module.exports.EditTool = EditTool;
module.exports.JavaScriptTool = JavaScriptTool;
module.exports.PythonTool = PythonTool;
module.exports.ToolCollection = ToolCollection;
module.exports.ConversationManager = ConversationManager;
module.exports.samplingLoop = samplingLoop;
