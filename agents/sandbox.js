/**
 * Sandbox Environment
 * Provides an isolated execution environment for the agent
 */

const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class Sandbox {
  constructor(options = {}) {
    this.workDir = options.workDir || path.join(__dirname, '../../sandbox');
    this.timeout = options.timeout || 30000;
    this.maxMemory = options.maxMemory || '512mb';
    this.init();
  }

  /**
   * Initialize sandbox directory
   */
  init() {
    if (!fs.existsSync(this.workDir)) {
      fs.mkdirSync(this.workDir, { recursive: true });
    }
    console.log(`[Sandbox] Initialized at: ${this.workDir}`);
  }

  /**
   * Execute a command in the sandbox
   */
  async execute(command, options = {}) {
    console.log(`[Sandbox] Executing: ${command}`);
    
    const execOptions = {
      cwd: options.cwd || this.workDir,
      timeout: options.timeout || this.timeout,
      env: { ...process.env, ...options.env },
      maxBuffer: 10 * 1024 * 1024 // 10MB
    };

    return new Promise((resolve, reject) => {
      exec(command, execOptions, (error, stdout, stderr) => {
        const result = {
          stdout,
          stderr,
          exitCode: error ? error.code : 0,
          success: !error
        };

        if (error) {
          console.error(`[Sandbox] Execution failed: ${error.message}`);
        }

        resolve(result);
      });
    });
  }

  /**
   * Run a script file in the sandbox
   */
  async runScript(fileName, content, language = 'javascript') {
    const filePath = path.join(this.workDir, fileName);
    fs.writeFileSync(filePath, content);

    let command;
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'js':
        command = `node ${fileName}`;
        break;
      case 'python':
      case 'py':
        command = `python3 ${fileName}`;
        break;
      case 'bash':
      case 'sh':
        command = `bash ${fileName}`;
        break;
      default:
        throw new Error(`Unsupported language: ${language}`);
    }

    return await this.execute(command);
  }

  /**
   * Clean up sandbox directory
   */
  clear() {
    if (fs.existsSync(this.workDir)) {
      const files = fs.readdirSync(this.workDir);
      for (const file of files) {
        const filePath = path.join(this.workDir, file);
        if (fs.lstatSync(filePath).isDirectory()) {
          fs.rmSync(filePath, { recursive: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
    }
  }
}

module.exports = Sandbox;
