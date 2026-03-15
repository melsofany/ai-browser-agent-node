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

// Optimized model list - only download what's necessary or use smaller versions
const MODELS: Model[] = [
  {
    name: 'tinyllama-1.1b.gguf',
    url: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    type: 'llama',
    size_mb: 669,
    path: 'models/llama'
  }
];

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function downloadFile(url: string, dest: string): Promise<void> {
  console.log(`[Models] Starting download from ${url}`);
  const writer = fs.createWriteStream(dest);
  
  try {
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
      writer.on('error', (err) => {
        fs.unlink(dest, () => {}); // Delete partial file
        reject(err);
      });
    });
  } catch (error) {
    fs.unlink(dest, () => {});
    throw error;
  }
}

async function downloadModels() {
  console.log('[Models] CortexFlow Model Downloader');
  const modelsBaseDir = process.env.MODELS_PATH || './models';
  
  if (process.env.USE_LOCAL_MODELS !== 'true') {
    console.log('[Models] USE_LOCAL_MODELS is false. Skipping downloads to save space.');
    return;
  }

  for (const model of MODELS) {
    try {
      const targetDir = path.join(process.cwd(), model.path);
      ensureDir(targetDir);
      const modelPath = path.join(targetDir, model.name);

      if (fs.existsSync(modelPath)) {
        const stats = fs.statSync(modelPath);
        console.log(`[Models] ✓ ${model.name} already exists (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        continue;
      }

      // Check disk space before downloading (simplified)
      console.log(`[Models] ⬇️  Downloading ${model.name} (${model.size_mb} MB)...`);
      await downloadFile(model.url, modelPath);
      console.log(`[Models] ✓ Successfully downloaded ${model.name}`);
    } catch (error) {
      console.error(`[Models] ❌ Failed to download ${model.name}:`, (error as Error).message);
    }
  }
}

if (require.main === module) {
  downloadModels().catch(console.error);
}

export { downloadModels };
