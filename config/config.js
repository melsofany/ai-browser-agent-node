require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  githubToken: process.env.GITHUB_TOKEN,

  // Cloud AI
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  hasDeepSeekKey: !!process.env.DEEPSEEK_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Local AI (Ollama)
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3',
  useLocalModels: process.env.USE_LOCAL_MODELS === 'true',

  // General
  renderApiKey: process.env.RENDER_API_KEY,
  logLevel: process.env.LOG_LEVEL || 'info',
  browserTimeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000,
  maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 5,
  memoryBackend: process.env.MEMORY_BACKEND || 'memory',
};

if (module.exports.hasDeepSeekKey) {
  console.log('[Config] DeepSeek API Key configured — primary AI model active.');
} else {
  console.warn('[Config] WARNING: DeepSeek API Key NOT configured. Will use local Ollama if available.');
}
