/**
 * Vector Memory System
 * Provides semantic search capabilities using embeddings
 */

const { GoogleGenAI } = require("@google/genai");

class VectorMemory {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.ai = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
    this.vectors = []; // In-memory vector store: [{ text, vector, metadata }]
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
   * Get embedding for text
   */
  async getEmbedding(text) {
    if (!this.ai) {
      throw new Error('GoogleGenAI not initialized. API key missing.');
    }

    try {
      const result = await this.ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: [text]
      });
      return result.embeddings[0].values;
    } catch (error) {
      console.error('[VectorMemory] Embedding failed:', error.message);
      throw error;
    }
  }

  /**
   * Add text to memory
   */
  async add(text, metadata = {}) {
    console.log(`[VectorMemory] Adding to memory: ${text.substring(0, 50)}...`);
    
    try {
      const vector = await this.getEmbedding(text);
      this.vectors.push({
        text,
        vector,
        metadata,
        timestamp: Date.now()
      });
      return true;
    } catch (error) {
      console.error('[VectorMemory] Add failed:', error.message);
      return false;
    }
  }

  /**
   * Search for similar text
   */
  async search(query, limit = 5) {
    console.log(`[VectorMemory] Searching for: ${query}`);
    
    if (this.vectors.length === 0) return [];

    try {
      const queryVector = await this.getEmbedding(query);
      
      const results = this.vectors.map(item => ({
        ...item,
        similarity: this.cosineSimilarity(queryVector, item.vector)
      }));

      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
        .map(({ vector, ...rest }) => rest); // Don't return the raw vector
    } catch (error) {
      console.error('[VectorMemory] Search failed:', error.message);
      return [];
    }
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
