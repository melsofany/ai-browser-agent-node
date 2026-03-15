-- AI Browser Agent Database Schema

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  result TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS agent_states (
  id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL,
  state JSON,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id TEXT PRIMARY KEY,
  browser_type TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  page_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS model_metadata (
  id TEXT PRIMARY KEY,
  model_name TEXT NOT NULL UNIQUE,
  model_type TEXT,
  size_mb INTEGER,
  version TEXT,
  source TEXT,
  downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_available INTEGER DEFAULT 0,
  file_path TEXT
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT,
  agent_type TEXT,
  action TEXT,
  input TEXT,
  output TEXT,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_states_type ON agent_states(agent_type);
CREATE INDEX IF NOT EXISTS idx_execution_logs_task ON execution_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created ON execution_logs(created_at);
