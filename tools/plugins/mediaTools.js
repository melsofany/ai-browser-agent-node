/**
 * Media Tools Plugin
 * Provides tools for media generation and processing
 */

module.exports = {
  tools: [
    {
      name: 'media:generate_image',
      description: 'Generate an image based on a text prompt',
      category: 'media',
      parameters: {
        prompt: { type: 'string', required: true, description: 'Text description of the image' },
        aspectRatio: { type: 'string', required: false, description: 'Aspect ratio (1:1, 16:9, 9:16)' }
      },
      execute: async (params) => {
        throw new Error('Image generation is not available. This feature has been disabled.');
      }
    },
    {
      name: 'media:analyze_audio',
      description: 'Analyze audio content',
      category: 'media',
      parameters: {
        audioData: { type: 'string', required: true, description: 'Base64 encoded audio data' },
        mimeType: { type: 'string', required: true, description: 'Audio MIME type' },
        prompt: { type: 'string', required: false, description: 'Specific question about the audio' }
      },
      execute: async (params) => {
        throw new Error('Audio analysis is not available. This feature has been disabled.');
      }
    }
  ]
};
