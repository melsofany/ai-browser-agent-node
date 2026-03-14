require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.API_KEY,
  // Add a helper to check if key is present (for debugging without exposing the key)
  hasGeminiKey: !!(process.env.GEMINI_API_KEY || process.env.API_KEY),
  githubToken: process.env.GITHUB_TOKEN,
  deepseekApiKey: process.env.DEEPSEEK_API_KEY,
  hasDeepSeekKey: !!process.env.DEEPSEEK_API_KEY,
  preferDeepSeek: false, // Switched to local models
  localOnlyMode: true, // Strictly local execution
  renderApiKey: process.env.RENDER_API_KEY,
  logLevel: process.env.LOG_LEVEL || 'info',
  browserTimeout: parseInt(process.env.BROWSER_TIMEOUT) || 30000,
  maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS) || 5,
  memoryBackend: process.env.MEMORY_BACKEND || 'memory', // 'memory' or 'sqlite'
};

if (module.exports.hasDeepSeekKey) {
  console.log(`[Config] DeepSeek API Key is configured. It will be used as the primary model.`);
} else {
  console.warn('[Config] WARNING: DeepSeek API Key is NOT configured.');
}

// Diagnostic log (safe)
if (module.exports.hasGeminiKey) {
  const key = module.exports.geminiApiKey;
  const looksValid = key && key.startsWith('AIza') && key.length > 20;
  
  if (looksValid) {
    console.log(`[Config] Gemini API Key is configured (Length: ${key.length})`);
  } else {
    console.error(`[Config] CRITICAL WARNING: Gemini API Key format looks INVALID (Starts with: ${key ? key.substring(0, 4) : 'null'}...). It should typically start with 'AIza'.`);
  }
} else {
  console.warn('[Config] WARNING: Gemini API Key is NOT configured. AI features will fail.');
}
