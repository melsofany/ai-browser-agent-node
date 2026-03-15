import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'app.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

export class Database {
  private db: sqlite3.Database;
  private ready: Promise<void>;

  constructor() {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[Database] Connection error:', err);
      } else {
        console.log('[Database] Connected to SQLite at:', DB_PATH);
      }
    });

    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
    const statements = schema.split(';').filter(s => s.trim());

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        statements.forEach(statement => {
          if (statement.trim()) {
            this.db.run(statement, (err) => {
              if (err) {
                console.warn('[Database] Schema error:', err.message);
              }
            });
          }
        });
        console.log('[Database] Schema initialized');
        resolve();
      });
    });
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async all(sql: string, params: any[] = []): Promise<any[]> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async createTask(task: {
    id: string;
    title: string;
    description?: string;
    priority?: number;
  }): Promise<void> {
    await this.run(
      'INSERT INTO tasks (id, title, description, priority) VALUES (?, ?, ?, ?)',
      [task.id, task.title, task.description, task.priority || 0]
    );
  }

  async updateTask(taskId: string, update: {
    status?: string;
    result?: string;
    error?: string;
    completed_at?: string;
  }): Promise<void> {
    const fields = Object.keys(update).map(k => `${k} = ?`).join(', ');
    const values = Object.values(update);
    values.push(taskId);
    
    await this.run(
      `UPDATE tasks SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      values
    );
  }

  async getTask(taskId: string): Promise<any> {
    return this.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  }

  async getAllTasks(limit = 100): Promise<any[]> {
    return this.all('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?', [limit]);
  }

  async recordExecution(log: {
    id: string;
    task_id?: string;
    agent_type: string;
    action: string;
    input?: string;
    output?: string;
    duration_ms?: number;
  }): Promise<void> {
    await this.run(
      `INSERT INTO execution_logs (id, task_id, agent_type, action, input, output, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        log.id,
        log.task_id,
        log.agent_type,
        log.action,
        log.input,
        log.output,
        log.duration_ms || 0
      ]
    );
  }

  async recordModel(model: {
    id: string;
    model_name: string;
    model_type: string;
    size_mb: number;
    version: string;
    source: string;
    file_path: string;
    is_available: number;
  }): Promise<void> {
    await this.run(
      `INSERT OR REPLACE INTO model_metadata 
       (id, model_name, model_type, size_mb, version, source, file_path, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        model.id,
        model.model_name,
        model.model_type,
        model.size_mb,
        model.version,
        model.source,
        model.file_path,
        model.is_available
      ]
    );
  }

  async getAvailableModels(): Promise<any[]> {
    return this.all('SELECT * FROM model_metadata WHERE is_available = 1');
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else {
          console.log('[Database] Connection closed');
          resolve();
        }
      });
    });
  }
}

export const database = new Database();
