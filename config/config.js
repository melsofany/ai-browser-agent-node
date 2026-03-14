require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  githubToken: process.env.GITHUB_TOKEN,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  hasDeepSeekKey: !!process.env.DEEPSEEK_API_KEY,
  renderApiKey: process.env.RENDER_API_KEY,
  logLevel: process.env.LOG_LEVEL || 'info',
  browserTimeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000,
  maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 5,
  memoryBackend: process.env.MEMORY_BACKEND || 'memory',
};

if (module.exports.hasDeepSeekKey) {
  console.log(`[Config] DeepSeek API Key is configured. It will be used as the primary model.`);
} else {
  console.warn('[Config] WARNING: DeepSeek API Key is NOT configured. AI features will use local fallback.');
}
