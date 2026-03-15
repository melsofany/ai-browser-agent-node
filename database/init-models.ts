/**
 * Initialize model metadata in database
 * This records which models are available for use
 */

import { database } from './db';
import { v4 as uuidv4 } from 'uuid';

async function initializeModels() {
  const models = [
    {
      id: uuidv4(),
      model_name: 'Llama 2 7B',
      model_type: 'llama',
      size_mb: 3826,
      version: '7b-q4_k_m',
      source: 'huggingface',
      file_path: 'models/llama/llama-2-7b.gguf',
      is_available: 0
    },
    {
      id: uuidv4(),
      model_name: 'Mistral 7B',
      model_type: 'mistral',
      size_mb: 4370,
      version: '7b-v0.1-q4_k_m',
      source: 'huggingface',
      file_path: 'models/mistral/mistral-7b-v0.1.gguf',
      is_available: 0
    },
    {
      id: uuidv4(),
      model_name: 'Qwen 7B',
      model_type: 'qwen',
      size_mb: 4300,
      version: '7b-q4_k_m',
      source: 'huggingface',
      file_path: 'models/qwen/qwen-7b.gguf',
      is_available: 0
    }
  ];

  console.log('[Init Models] Recording model metadata...');
  
  for (const model of models) {
    try {
      await database.recordModel(model);
      console.log(`[Init Models] ✓ ${model.model_name}`);
    } catch (error) {
      console.warn(`[Init Models] Error recording ${model.model_name}:`, (error as Error).message);
    }
  }

  console.log('[Init Models] Model metadata initialized');
  await database.close();
}

if (require.main === module) {
  initializeModels().catch(console.error);
}

export { initializeModels };
