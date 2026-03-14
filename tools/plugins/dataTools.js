/**
 * Data Tools Plugin
 * Provides tools for data processing and analysis
 */

module.exports = {
  tools: [
    {
      name: 'data:summarize_json',
      description: 'Summarize a JSON object or array',
      category: 'data',
      parameters: {
        data: { type: 'object', required: true, description: 'JSON data to summarize' }
      },
      execute: async (params) => {
        const data = params.data;
        if (!data) return { success: false, error: 'No data provided' };

        const summary = {
          type: Array.isArray(data) ? 'array' : typeof data,
          size: Array.isArray(data) ? data.length : Object.keys(data).length,
          keys: Array.isArray(data) ? (data.length > 0 ? Object.keys(data[0]) : []) : Object.keys(data)
        };

        return {
          success: true,
          summary,
          message: 'Data summarized successfully'
        };
      }
    },
    {
      name: 'data:filter_collection',
      description: 'Filter a collection of objects',
      category: 'data',
      parameters: {
        collection: { type: 'array', required: true },
        key: { type: 'string', required: true },
        value: { type: 'any', required: true }
      },
      execute: async (params) => {
        const { collection, key, value } = params;
        const filtered = collection.filter(item => item[key] === value);
        
        return {
          success: true,
          count: filtered.length,
          results: filtered
        };
      }
    }
  ]
};
