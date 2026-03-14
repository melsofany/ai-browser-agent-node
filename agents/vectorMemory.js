/**
 * Vector Memory System
 * Provides text-based search capabilities using keyword matching
 */

let chromadb;
try {
  chromadb = require("chromadb");
} catch (e) {
  console.warn('[VectorMemory] ChromaDB not found, falling back to in-memory store');
}

class VectorMemory {
  constructor() {
    this.vectors = []; // In-memory store
    this.chromaClient = null;
    this.collection = null;
    this.useChroma = false;

    if (chromadb) {
      this.initChroma();
    }
  }

  async initChroma() {
    try {
      this.chromaClient = new chromadb.ChromaClient();
      // Test connection
      await this.chromaClient.version();
      
      this.collection = await this.chromaClient.getOrCreateCollection({
        name: "agent_memory",
        metadata: { "description": "AI Agent Memory Store" }
      });
      this.useChroma = true;
      console.log('[VectorMemory] ChromaDB initialized successfully');
    } catch (error) {
      if (error.message.includes('Unauthorized')) {
        console.warn('[VectorMemory] ChromaDB unauthorized. Falling back to in-memory store.');
      } else {
        console.error('[VectorMemory] ChromaDB initialization failed:', error.message);
      }
      this.useChroma = false;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Compute keyword-based similarity score between two texts
   */
  textSimilarity(textA, textB) {
    const wordsA = new Set(textA.toLowerCase().split(/\s+/));
    const wordsB = new Set(textB.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * Add text to memory
   */
  async add(text, metadata = {}) {
    console.log(`[VectorMemory] Adding to memory: ${text.substring(0, 50)}...`);
    
    this.vectors.push({
      text,
      metadata,
      timestamp: Date.now()
    });
    return true;
  }

  /**
   * Search for similar text using keyword matching
   */
  async search(query, limit = 5) {
    console.log(`[VectorMemory] Searching for: ${query}`);
    
    if (this.vectors.length === 0) return [];

    const results = this.vectors.map(item => ({
      ...item,
      similarity: this.textSimilarity(query, item.text)
    }));

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Clear all memory
   */
  clear() {
    this.vectors = [];
  }

  /**
   * Get memory size
   */
  size() {
    return this.vectors.length;
  }
}

module.exports = VectorMemory;
