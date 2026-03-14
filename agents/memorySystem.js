/**
 * Memory System
 * Provides persistent memory for tasks, interactions, and learning
 * Supports multiple backends: in-memory, SQLite, and vector-based
 */

const fs = require("fs").promises;
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const config = require('../config/config');
const VectorMemory = require('./vectorMemory');

class MemorySystem {
  constructor(options = {}) {
    this.backend = options.backend || config.memoryBackend || 'memory'; // 'memory', 'sqlite', 'vector'
    this.maxMemorySize = options.maxMemorySize || 10000;
    this.db = null;
    this.dbPath = path.join(__dirname, '../../data/memory.sqlite');
    this.vectorMemory = new VectorMemory();
    this.initializeDatabase();
    
    // In-memory storage
    this.taskMemory = new Map(); // Task history
    this.interactionMemory = []; // Interaction history
    this.patternMemory = new Map(); // Learned patterns
    this.contextMemory = new Map(); // Current context
    this.errorMemory = new Map(); // Error patterns and solutions
    
    // Statistics
    this.stats = {
      tasksCompleted: 0,
      tasksFailed: 0,
      totalInteractions: 0,
      patternsLearned: 0,
      errorsRecovered: 0
    };
  }

  async initializeDatabase() {
    if (this.backend !== 'sqlite') return;

    console.log('[MemorySystem] Initializing SQLite database...');
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    this.db = new sqlite3.Database(this.dbPath);

    await this.runSql(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        description TEXT,
        type TEXT,
        startTime INTEGER,
        status TEXT,
        steps TEXT,
        results TEXT,
        errors TEXT,
        metadata TEXT,
        lastUpdate INTEGER
      )
    `);
    await this.runSql(`
      CREATE TABLE IF NOT EXISTS interactions (
        id TEXT PRIMARY KEY,
        type TEXT,
        target TEXT,
        description TEXT,
        success INTEGER,
        timestamp INTEGER,
        duration INTEGER,
        metadata TEXT
      )
    `);
    await this.runSql(`
      CREATE TABLE IF NOT EXISTS patterns (
        name TEXT PRIMARY KEY,
        occurrences INTEGER,
        successRate REAL,
        examples TEXT,
        lastUsed INTEGER
      )
    `);
    await this.runSql(`
      CREATE TABLE IF NOT EXISTS errors (
        type TEXT PRIMARY KEY,
        occurrences INTEGER,
        lastOccurrence INTEGER,
        solutions TEXT,
        successRate REAL
      )
    `);
    await this.runSql(`
      CREATE TABLE IF NOT EXISTS context (
        key TEXT PRIMARY KEY,
        value TEXT,
        timestamp INTEGER
      )
    `);
    console.log('[MemorySystem] SQLite database initialized.');
  }

  runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  getSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  allSql(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  /**
   * Retrieve relevant memories for a given context
   */
  async retrieveRelevantMemories(context, limit = 5) {
    console.log('[MemorySystem] Retrieving relevant memories for context:', context);
    
    let vectorResults = [];
    if (this.backend === 'vector' || this.backend === 'hybrid') {
      try {
        vectorResults = await this.vectorMemory.search(context, limit);
      } catch (err) {
        console.error('[MemorySystem] Vector search failed:', err.message);
      }
    }

    const relevantTasks = await this.findSimilarTasks(context, limit);
    const relevantErrors = await this.findSimilarErrors(context, limit);
    const relevantPatterns = await this.getSimilarPatterns(context, limit);

    return {
      tasks: relevantTasks,
      errors: relevantErrors,
      patterns: relevantPatterns,
      semanticMemories: vectorResults
    };
  }

  /**
   * Find similar tasks based on description
   */
  async findSimilarTasks(description, limit = 5) {
    let tasks = [];
    if (this.backend === 'sqlite') {
      const rows = await this.allSql(`SELECT * FROM tasks`);
      tasks = rows.map(row => {
        row.steps = JSON.parse(row.steps);
        row.results = JSON.parse(row.results);
        row.errors = JSON.parse(row.errors);
        row.metadata = JSON.parse(row.metadata);
        return row;
      });
    } else {
      tasks = Array.from(this.taskMemory.values());
    }

    const scored = tasks.map(t => ({
      task: t,
      score: this.calculateSimilarity(description, t.description)
    }));

    return scored
      .filter(s => s.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.task);
  }

  /**
   * Find similar errors based on type or message
   */
  async findSimilarErrors(errorText, limit = 5) {
    let errors = [];
    if (this.backend === 'sqlite') {
      const rows = await this.allSql(`SELECT * FROM errors`);
      errors = rows.map(row => {
        row.solutions = JSON.parse(row.solutions);
        return row;
      });
    } else {
      errors = Array.from(this.errorMemory.values());
    }

    const scored = errors.map(e => ({
      error: e,
      score: this.calculateSimilarity(errorText, e.type)
    }));

    return scored
      .filter(s => s.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.error);
  }

  /**
   * Store task in memory
   */
  async storeTask(taskId, taskData) {
    console.log('[MemorySystem] Storing task:', taskId);
    
    const task = {
      id: taskId,
      description: taskData.description,
      type: taskData.type,
      startTime: Date.now(),
      status: 'pending',
      steps: JSON.stringify([]),
      results: JSON.stringify([]),
      errors: JSON.stringify([]),
      metadata: JSON.stringify(taskData.metadata || {}),
      lastUpdate: Date.now()
    };

    // Add to vector memory for semantic search
    if (task.description) {
      this.vectorMemory.add(task.description, { type: 'task', taskId });
    }

    if (this.backend === 'sqlite') {
      await this.runSql(
        `INSERT INTO tasks (id, description, type, startTime, status, steps, results, errors, metadata, lastUpdate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [task.id, task.description, task.type, task.startTime, task.status, task.steps, task.results, task.errors, task.metadata, task.lastUpdate]
      );
    } else {
      this.taskMemory.set(taskId, task);
      this.enforceMemoryLimit();
    }
    
    return task;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId, status, data = {}) {
    let task;
    if (this.backend === 'sqlite') {
      task = await this.getTask(taskId);
      if (!task) return null;
      task.status = status;
      task.lastUpdate = Date.now();
      Object.assign(task, data);
      await this.runSql(
        `UPDATE tasks SET status = ?, lastUpdate = ?, steps = ?, results = ?, errors = ?, metadata = ? WHERE id = ?`,
        [task.status, task.lastUpdate, JSON.stringify(task.steps), JSON.stringify(task.results), JSON.stringify(task.errors), JSON.stringify(task.metadata), taskId]
      );
    } else {
      task = this.taskMemory.get(taskId);
      if (!task) return null;
      task.status = status;
      task.lastUpdate = Date.now();
      Object.assign(task, data);
    }

    if (status === 'completed') {
      this.stats.tasksCompleted++;
    } else if (status === 'failed') {
      this.stats.tasksFailed++;
    }

    return task;
  }

  /**
   * Add step to task
   */
  async addTaskStep(taskId, step) {
    let task;
    if (this.backend === 'sqlite') {
      task = await this.getTask(taskId);
      if (!task) return null;
      task.steps.push({
        ...step,
        timestamp: Date.now()
      });
      await this.runSql(
        `UPDATE tasks SET steps = ?, lastUpdate = ? WHERE id = ?`,
        [JSON.stringify(task.steps), Date.now(), taskId]
      );
    } else {
      task = this.taskMemory.get(taskId);
      if (!task) return null;
      task.steps.push({
        ...step,
        timestamp: Date.now()
      });
    }
    return task;
  }

  /**
   * Add result to task
   */
  async addTaskResult(taskId, result) {
    let task;
    if (this.backend === 'sqlite') {
      task = await this.getTask(taskId);
      if (!task) return null;
      task.results.push({
        ...result,
        timestamp: Date.now()
      });
      await this.runSql(
        `UPDATE tasks SET results = ?, lastUpdate = ? WHERE id = ?`,
        [JSON.stringify(task.results), Date.now(), taskId]
      );
    } else {
      task = this.taskMemory.get(taskId);
      if (!task) return null;
      task.results.push({
        ...result,
        timestamp: Date.now()
      });
    }
    return task;
  }

  /**
   * Record interaction
   */
  async recordInteraction(interaction) {
    console.log('[MemorySystem] Recording interaction:', interaction.type);
    
    const record = {
      id: `interaction_${Date.now()}_${Math.random()}`,
      type: interaction.type, // 'click', 'type', 'navigate', etc.
      target: interaction.target,
      description: interaction.description,
      success: interaction.success ? 1 : 0,
      timestamp: Date.now(),
      duration: interaction.duration || 0,
      metadata: JSON.stringify(interaction.metadata || {})
    };

    // Add to vector memory
    if (record.description) {
      this.vectorMemory.add(record.description, { type: 'interaction', interactionId: record.id });
    }

    if (this.backend === 'sqlite') {
      await this.runSql(
        `INSERT INTO interactions (id, type, target, description, success, timestamp, duration, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.id, record.type, record.target, record.description, record.success, record.timestamp, record.duration, record.metadata]
      );
    } else {
      this.interactionMemory.push(record);
      this.enforceMemoryLimit();
    }
    this.stats.totalInteractions++;
    return record;
  }

  /**
   * Learn pattern from successful interactions
   */
  async learnPattern(patternName, pattern) {
    console.log('[MemorySystem] Learning pattern:', patternName);
    
    let existingPattern;
    if (this.backend === 'sqlite') {
      existingPattern = await this.getSql(`SELECT * FROM patterns WHERE name = ?`, [patternName]);
      if (existingPattern) {
        existingPattern.examples = JSON.parse(existingPattern.examples);
      } else {
        existingPattern = {
          name: patternName,
          occurrences: 0,
          successRate: 0,
          examples: [],
          lastUsed: null
        };
      }
    } else {
      existingPattern = this.patternMemory.get(patternName) || {
        name: patternName,
        occurrences: 0,
        successRate: 0,
        examples: [],
        lastUsed: null
      };
    }

    existingPattern.occurrences++;
    existingPattern.examples.push({
      ...pattern,
      timestamp: Date.now()
    });

    // Keep only last 10 examples
    if (existingPattern.examples.length > 10) {
      existingPattern.examples.shift();
    }

    if (this.backend === 'sqlite') {
      if (existingPattern.rowid) { // Check if it exists in DB
        await this.runSql(
          `UPDATE patterns SET occurrences = ?, successRate = ?, examples = ?, lastUsed = ? WHERE name = ?`,
          [existingPattern.occurrences, existingPattern.successRate, JSON.stringify(existingPattern.examples), Date.now(), patternName]
        );
      } else {
        await this.runSql(
          `INSERT INTO patterns (name, occurrences, successRate, examples, lastUsed) VALUES (?, ?, ?, ?, ?)`,
          [existingPattern.name, existingPattern.occurrences, existingPattern.successRate, JSON.stringify(existingPattern.examples), Date.now()]
        );
      }
    } else {
      this.patternMemory.set(patternName, existingPattern);
    }
    this.stats.patternsLearned = this.patternMemory.size; // This might need adjustment for SQLite
    return existingPattern;
  }

  /**
   * Get similar patterns
   */
  getSimilarPatterns(description, limit = 5) {
    const patterns = Array.from(this.patternMemory.values());
    
    // Simple similarity matching
    const scored = patterns.map(p => ({
      pattern: p,
      score: this.calculateSimilarity(description, p.name)
    }));

    return scored
      .filter(s => s.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.pattern);
  }

  /**
   * Calculate text similarity
   */
  calculateSimilarity(text1, text2) {
    const s1 = text1.toLowerCase();
    const s2 = text2.toLowerCase();
    
    if (s1 === s2) return 1;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Levenshtein distance for similarity
   */
  levenshteinDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  /**
   * Record error and solution
   */
  async recordError(errorType, error, solution = null) {
    console.log('[MemorySystem] Recording error:', errorType);
    
    let errorRecord;
    if (this.backend === 'sqlite') {
      errorRecord = await this.getSql(`SELECT * FROM errors WHERE type = ?`, [errorType]);
      if (errorRecord) {
        errorRecord.solutions = JSON.parse(errorRecord.solutions);
      } else {
        errorRecord = {
          type: errorType,
          occurrences: 0,
          lastOccurrence: null,
          solutions: [],
          successRate: 0
        };
      }
    } else {
      errorRecord = this.errorMemory.get(errorType) || {
        type: errorType,
        occurrences: 0,
        lastOccurrence: null,
        solutions: [],
        successRate: 0
      };
    }

    errorRecord.occurrences++;
    errorRecord.lastOccurrence = Date.now();

    if (solution) {
      errorRecord.solutions.push({
        solution,
        timestamp: Date.now(),
        successful: solution.successful || false
      });

      // Calculate success rate
      const successful = errorRecord.solutions.filter(s => s.successful).length;
      errorRecord.successRate = successful / errorRecord.solutions.length;

      if (solution.successful) {
        this.stats.errorsRecovered++;
      }
    }

    if (this.backend === 'sqlite') {
      if (errorRecord.rowid) {
        await this.runSql(
          `UPDATE errors SET occurrences = ?, lastOccurrence = ?, solutions = ?, successRate = ? WHERE type = ?`,
          [errorRecord.occurrences, errorRecord.lastOccurrence, JSON.stringify(errorRecord.solutions), errorRecord.successRate, errorType]
        );
      } else {
        await this.runSql(
          `INSERT INTO errors (type, occurrences, lastOccurrence, solutions, successRate) VALUES (?, ?, ?, ?, ?)`,
          [errorRecord.type, errorRecord.occurrences, errorRecord.lastOccurrence, JSON.stringify(errorRecord.solutions), errorRecord.successRate]
        );
      }
    } else {
      this.errorMemory.set(errorType, errorRecord);
    }
    return errorRecord;
  }

  /**
   * Get error solutions
   */
  getErrorSolutions(errorType) {
    const errorRecord = this.errorMemory.get(errorType);
    if (!errorRecord) return [];

    return errorRecord.solutions
      .filter(s => s.successful)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
  }

  /**
   * Set context
   */
  async setContext(key, value) {
    if (this.backend === 'sqlite') {
      await this.runSql(
        `INSERT OR REPLACE INTO context (key, value, timestamp) VALUES (?, ?, ?)`,
        [key, JSON.stringify(value), Date.now()]
      );
    } else {
      this.contextMemory.set(key, {
        value,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get context
   */
  async getContext(key) {
    if (this.backend === 'sqlite') {
      const row = await this.getSql(`SELECT value FROM context WHERE key = ?`, [key]);
      return row ? JSON.parse(row.value) : null;
    } else {
      const ctx = this.contextMemory.get(key);
      return ctx ? ctx.value : null;
    }
  }

  /**
   * Get all context
   */
  async getAllContext() {
    if (this.backend === 'sqlite') {
      const rows = await this.allSql(`SELECT key, value FROM context`);
      const result = {};
      rows.forEach(row => {
        result[row.key] = JSON.parse(row.value);
      });
      return result;
    } else {
      const result = {};
      for (const [key, ctx] of this.contextMemory) {
        result[key] = ctx.value;
      }
      return result;
    }
  }

  /**
   * Get task memory
   */
  async getTask(taskId) {
    if (this.backend === 'sqlite') {
      const row = await this.getSql(`SELECT * FROM tasks WHERE id = ?`, [taskId]);
      if (row) {
        row.steps = JSON.parse(row.steps);
        row.results = JSON.parse(row.results);
        row.errors = JSON.parse(row.errors);
        row.metadata = JSON.parse(row.metadata);
      }
      return row;
    } else {
      return this.taskMemory.get(taskId);
    }
  }

  /**
   * Get all tasks
   */
  async getAllTasks(limit = 100) {
    if (this.backend === 'sqlite') {
      const rows = await this.allSql(`SELECT * FROM tasks ORDER BY startTime DESC LIMIT ?`, [limit]);
      return rows.map(row => {
        row.steps = JSON.parse(row.steps);
        row.results = JSON.parse(row.results);
        row.errors = JSON.parse(row.errors);
        row.metadata = JSON.parse(row.metadata);
        return row;
      });
    } else {
      const tasks = Array.from(this.taskMemory.values());
      return tasks.slice(-limit);
    }
  }

  /**
   * Get recent interactions
   */
  async getRecentInteractions(limit = 50) {
    if (this.backend === 'sqlite') {
      const rows = await this.allSql(`SELECT * FROM interactions ORDER BY timestamp DESC LIMIT ?`, [limit]);
      return rows.map(row => {
        row.metadata = JSON.parse(row.metadata);
        row.success = row.success === 1;
        return row;
      });
    } else {
      return this.interactionMemory.slice(-limit);
    }
  }

  /**
   * Get patterns
   */
  async getPatterns(limit = 50) {
    if (this.backend === 'sqlite') {
      const rows = await this.allSql(`SELECT * FROM patterns ORDER BY occurrences DESC LIMIT ?`, [limit]);
      return rows.map(row => {
        row.examples = JSON.parse(row.examples);
        return row;
      });
    } else {
      const patterns = Array.from(this.patternMemory.values());
      return patterns
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, limit);
    }
  }

  /**
   * Get error patterns
   */
  async getErrorPatterns(limit = 20) {
    if (this.backend === 'sqlite') {
      const rows = await this.allSql(`SELECT * FROM errors ORDER BY occurrences DESC LIMIT ?`, [limit]);
      return rows.map(row => {
        row.solutions = JSON.parse(row.solutions);
        return row;
      });
    } else {
      const errors = Array.from(this.errorMemory.values());
      return errors
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, limit);
    }
  }

  /**
   * Get statistics
   */
  async getStatistics() {
    let tasksInMemory = this.taskMemory.size;
    let interactionsRecorded = this.interactionMemory.length;
    let patternsLearned = this.patternMemory.size;
    let errorTypesRecorded = this.errorMemory.size;
    let contextKeys = this.contextMemory.size;

    if (this.backend === 'sqlite') {
      tasksInMemory = (await this.getSql(`SELECT COUNT(*) as count FROM tasks`)).count;
      interactionsRecorded = (await this.getSql(`SELECT COUNT(*) as count FROM interactions`)).count;
      patternsLearned = (await this.getSql(`SELECT COUNT(*) as count FROM patterns`)).count;
      errorTypesRecorded = (await this.getSql(`SELECT COUNT(*) as count FROM errors`)).count;
      contextKeys = (await this.getSql(`SELECT COUNT(*) as count FROM context`)).count;
    }

    return {
      ...this.stats,
      tasksInMemory,
      interactionsRecorded,
      patternsLearned,
      errorTypesRecorded,
      contextKeys,
      successRate: this.stats.tasksCompleted / (this.stats.tasksCompleted + this.stats.tasksFailed) || 0
    };
  }

  /**
   * Export memory to JSON
   */
  async exportMemory(filePath) {
    console.log('[MemorySystem] Exporting memory to:', filePath);
    
    let data;
    if (this.backend === 'sqlite') {
      data = {
        timestamp: new Date().toISOString(),
        stats: await this.getStatistics(),
        tasks: await this.getAllTasks(Infinity),
        interactions: await this.getRecentInteractions(Infinity),
        patterns: await this.getPatterns(Infinity),
        errors: await this.getErrorPatterns(Infinity),
        context: await this.getAllContext()
      };
    } else {
      data = {
        timestamp: new Date().toISOString(),
        stats: this.getStatistics(),
        tasks: Array.from(this.taskMemory.values()),
        interactions: this.interactionMemory,
        patterns: Array.from(this.patternMemory.values()),
        errors: Array.from(this.errorMemory.values()),
        context: this.getAllContext()
      };
    }

    try {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
      return { success: true, file: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Import memory from JSON
   */
  async importMemory(filePath) {
    console.log('[MemorySystem] Importing memory from:', filePath);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      if (this.backend === 'sqlite') {
        // Clear existing data before import
        await this.clearMemory();

        for (const task of data.tasks) {
          await this.runSql(
            `INSERT INTO tasks (id, description, type, startTime, status, steps, results, errors, metadata, lastUpdate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [task.id, task.description, task.type, task.startTime, task.status, JSON.stringify(task.steps), JSON.stringify(task.results), JSON.stringify(task.errors), JSON.stringify(task.metadata), task.lastUpdate]
          );
        }
        for (const interaction of data.interactions) {
          await this.runSql(
            `INSERT INTO interactions (id, type, target, description, success, timestamp, duration, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [interaction.id, interaction.type, interaction.target, interaction.description, interaction.success ? 1 : 0, interaction.timestamp, interaction.duration, JSON.stringify(interaction.metadata)]
          );
        }
        for (const pattern of data.patterns) {
          await this.runSql(
            `INSERT INTO patterns (name, occurrences, successRate, examples, lastUsed) VALUES (?, ?, ?, ?, ?)`,
            [pattern.name, pattern.occurrences, pattern.successRate, JSON.stringify(pattern.examples), pattern.lastUsed]
          );
        }
        for (const error of data.errors) {
          await this.runSql(
            `INSERT INTO errors (type, occurrences, lastOccurrence, solutions, successRate) VALUES (?, ?, ?, ?, ?)`,
            [error.type, error.occurrences, error.lastOccurrence, JSON.stringify(error.solutions), error.successRate]
          );
        }
        for (const key in data.context) {
          await this.setContext(key, data.context[key]);
        }
      } else {
        // Import tasks
        if (data.tasks) {
          data.tasks.forEach(task => {
            this.taskMemory.set(task.id, task);
          });
        }

        // Import interactions
        if (data.interactions) {
          this.interactionMemory = data.interactions;
        }

        // Import patterns
        if (data.patterns) {
          data.patterns.forEach(pattern => {
            this.patternMemory.set(pattern.name, pattern);
          });
        }

        // Import errors
        if (data.errors) {
          data.errors.forEach(error => {
            this.errorMemory.set(error.type, error);
          });
        }

        // Import context
        if (data.context) {
          Object.entries(data.context).forEach(([key, value]) => {
            this.setContext(key, value);
          });
        }
      }

      this.enforceMemoryLimit();
      return { success: true, imported: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear memory
   */
  async clearMemory() {
    console.log('[MemorySystem] Clearing all memory');
    
    if (this.backend === 'sqlite') {
      await this.runSql(`DELETE FROM tasks`);
      await this.runSql(`DELETE FROM interactions`);
      await this.runSql(`DELETE FROM patterns`);
      await this.runSql(`DELETE FROM errors`);
      await this.runSql(`DELETE FROM context`);
    } else {
      this.taskMemory.clear();
      this.interactionMemory = [];
      this.patternMemory.clear();
      this.contextMemory.clear();
      this.errorMemory.clear();
    }
    
    return { success: true };
  }

  /**
   * Enforce memory limit
   */
  async enforceMemoryLimit() {
    if (this.backend === 'sqlite') {
      // For SQLite, we can use LIMIT and OFFSET in queries to manage size
      // Or periodically clean up old records if performance becomes an issue
      // For now, we'll assume the database can handle the size or rely on external cleanup.
    } else {
      // Keep only recent interactions if exceeding limit
      if (this.interactionMemory.length > this.maxMemorySize) {
        this.interactionMemory = this.interactionMemory.slice(-this.maxMemorySize);
      }

      // Keep only recent tasks
      if (this.taskMemory.size > this.maxMemorySize / 10) {
        const tasks = Array.from(this.taskMemory.entries())
          .sort((a, b) => b[1].startTime - a[1].startTime)
          .slice(0, this.maxMemorySize / 10);
        
        this.taskMemory.clear();
        tasks.forEach(([id, task]) => this.taskMemory.set(id, task));
      }
    }
  }

  /**
   * Get memory usage
   */
  getMemoryUsage() {
    return {
      tasks: this.taskMemory.size,
      interactions: this.interactionMemory.length,
      patterns: this.patternMemory.size,
      errors: this.errorMemory.size,
      context: this.contextMemory.size,
      estimatedSize: JSON.stringify({
        tasks: Array.from(this.taskMemory.values()),
        interactions: this.interactionMemory,
        patterns: Array.from(this.patternMemory.values()),
        errors: Array.from(this.errorMemory.values())
      }).length
    };
  }

  /**
   * Generate memory report
   */
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      statistics: this.getStatistics(),
      memoryUsage: this.getMemoryUsage(),
      topPatterns: this.getPatterns(10),
      commonErrors: this.getErrorPatterns(10),
      recentTasks: this.getAllTasks(10),
      recentInteractions: this.getRecentInteractions(20)
    };
  }
}

module.exports = MemorySystem;
