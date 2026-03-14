/**
 * Execution Agent
 * Executes commands, edits files, installs dependencies, and interacts with system tools
 */

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const Sandbox = require('./sandbox');

const execPromise = util.promisify(exec);

class ExecutionAgent {
  constructor() {
    this.executionHistory = [];
    this.activeProcesses = new Map();
    this.sandbox = new Sandbox();
  }

  /**
   * Execute a system command
   * @param {string} command - The command to execute
   * @param {Object} options - Execution options
   * @returns {Promise<Object>} Execution result
   */
  async executeCommand(command, options = {}) {
    const { cwd = process.cwd(), timeout = 30000, useSandbox = true } = options;

    console.log(`[ExecutionAgent] Executing command: ${command} (Sandbox: ${useSandbox})`);

    if (useSandbox) {
      const result = await this.sandbox.execute(command, options);
      this.executionHistory.push({
        ...result,
        command,
        executedAt: new Date()
      });
      return result;
    }

    try {
      const { stdout, stderr } = await execPromise(command, {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

      const result = {
        success: true,
        command,
        stdout,
        stderr,
        executedAt: new Date(),
      };

      this.executionHistory.push(result);
      return result;
    } catch (error) {
      const result = {
        success: false,
        command,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        executedAt: new Date(),
      };

      this.executionHistory.push(result);
      return result;
    }
  }

  /**
   * Create or edit a file
   * @param {string} filePath - Path to the file
   * @param {string} content - File content
   * @returns {Promise<Object>} Result
   */
  async createOrEditFile(filePath, content) {
    console.log(`[ExecutionAgent] Creating/editing file: ${filePath}`);

    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');

      return {
        success: true,
        filePath,
        action: 'written',
        size: content.length,
      };
    } catch (error) {
      return {
        success: false,
        filePath,
        error: error.message,
      };
    }
  }

  /**
   * Read a file
   * @param {string} filePath - Path to the file
   * @returns {Promise<Object>} File content
   */
  async readFile(filePath) {
    console.log(`[ExecutionAgent] Reading file: ${filePath}`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        success: true,
        filePath,
        content,
        size: content.length,
      };
    } catch (error) {
      return {
        success: false,
        filePath,
        error: error.message,
      };
    }
  }

  /**
   * Install npm dependencies
   * @param {string} packageName - Package name
   * @param {Object} options - Installation options
   * @returns {Promise<Object>} Installation result
   */
  async installDependency(packageName, options = {}) {
    const { global = false, save = true, cwd = process.cwd() } = options;

    const command = `npm install ${global ? '-g' : ''} ${save ? '--save' : ''} ${packageName}`;

    return this.executeCommand(command, { cwd });
  }

  /**
   * Clone a git repository
   * @param {string} repoUrl - Repository URL
   * @param {string} targetDir - Target directory
   * @returns {Promise<Object>} Clone result
   */
  async cloneRepository(repoUrl, targetDir) {
    console.log(`[ExecutionAgent] Cloning repository: ${repoUrl}`);

    const command = `git clone ${repoUrl} ${targetDir}`;
    return this.executeCommand(command);
  }

  /**
   * Execute git operations
   * @param {string} operation - Git operation (commit, push, pull, etc.)
   * @param {Object} params - Operation parameters
   * @returns {Promise<Object>} Git operation result
   */
  async gitOperation(operation, params = {}) {
    let command = '';

    switch (operation) {
      case 'init':
        command = 'git init';
        break;
      case 'add':
        command = `git add ${params.files || '.'}`;
        break;
      case 'commit':
        command = `git commit -m "${params.message || 'Initial commit'}"`;
        break;
      case 'push':
        command = `git push ${params.remote || 'origin'} ${params.branch || 'main'}`;
        break;
      case 'pull':
        command = `git pull ${params.remote || 'origin'} ${params.branch || 'main'}`;
        break;
      case 'status':
        command = 'git status';
        break;
      default:
        return { success: false, error: `Unknown git operation: ${operation}` };
    }

    return this.executeCommand(command, { cwd: params.cwd });
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 10) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Clear execution history
   */
  clearExecutionHistory() {
    this.executionHistory = [];
  }
}

module.exports = ExecutionAgent;
