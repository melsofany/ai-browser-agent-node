import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface Model {
  name: string;
  url: string;
  type: string;
  size_mb: number;
  path: string;
}

const MODELS: Model[] = [
  {
    name: 'llama-2-7b.gguf',
    url: 'https://huggingface.co/TheBloke/Llama-2-7B-GGUF/resolve/main/llama-2-7b.Q4_K_M.gguf',
    type: 'llama',
    size_mb: 3826,
    path: 'models/llama'
  },
  {
    name: 'mistral-7b-v0.1.gguf',
    url: 'https://huggingface.co/TheBloke/Mistral-7B-v0.1-GGUF/resolve/main/mistral-7b-v0.1.Q4_K_M.gguf',
    type: 'mistral',
    size_mb: 4370,
    path: 'models/mistral'
  },
  {
    name: 'qwen-7b.gguf',
    url: 'https://huggingface.co/TheBloke/Qwen-7B-GGUF/resolve/main/qwen-7b.Q4_K_M.gguf',
    type: 'qwen',
    size_mb: 4300,
    path: 'models/qwen'
  }
];

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const writer = fs.createWriteStream(dest);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 60 * 60 * 1000, // 60 min timeout
    maxRedirects: 10
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function downloadModels() {
  console.log('[Models] Starting model download process...');
  console.log(`[Models] Models path: ${process.env.MODELS_PATH || './models'}`);

  if (process.env.USE_LOCAL_MODELS !== 'true') {
    console.log('[Models] USE_LOCAL_MODELS is not enabled. Skipping downloads.');
    console.log('[Models] To enable downloads, set USE_LOCAL_MODELS=true');
    return;
  }

  for (const model of MODELS) {
    try {
      ensureDir(model.path);
      const modelPath = path.join(model.path, model.name);

      if (fs.existsSync(modelPath)) {
        const stats = fs.statSync(modelPath);
        console.log(`[Models] ✓ ${model.name} already exists (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        continue;
      }

      console.log(`[Models] ⬇️  Downloading ${model.name} (${model.size_mb} MB)...`);
      await downloadFile(model.url, modelPath);
      console.log(`[Models] ✓ Downloaded ${model.name}`);
    } catch (error) {
      console.warn(`[Models] ⚠️  Failed to download ${model.name}:`, (error as Error).message);
      console.warn('[Models] Continuing without this model...');
    }
  }

  console.log('[Models] Model download process completed');
}

// Run if executed directly
if (require.main === module) {
  downloadModels().catch(console.error);
}

export { downloadModels };
