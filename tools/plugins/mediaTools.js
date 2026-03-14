/**
 * Media Tools Plugin
 * Provides tools for media generation and processing
 */

const { GoogleGenAI } = require("@google/genai");

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
        console.log(`[MediaTools] Generating image for prompt: ${params.prompt}`);
        
        if (!process.env.GEMINI_API_KEY) {
          throw new Error('GEMINI_API_KEY is required for image generation');
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [{ text: params.prompt }]
          },
          config: {
            imageConfig: {
              aspectRatio: params.aspectRatio || "1:1"
            }
          }
        });

        let imageUrl = null;
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            const base64EncodeString = part.inlineData.data;
            imageUrl = `data:image/png;base64,${base64EncodeString}`;
            break;
          }
        }

        if (!imageUrl) {
          throw new Error('Failed to generate image: No image data in response');
        }

        return {
          success: true,
          imageUrl,
          message: 'Image generated successfully'
        };
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
        console.log(`[MediaTools] Analyzing audio...`);
        
        if (!process.env.GEMINI_API_KEY) {
          throw new Error('GEMINI_API_KEY is required for audio analysis');
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          contents: {
            parts: [
              {
                inlineData: {
                  data: params.audioData,
                  mimeType: params.mimeType
                }
              },
              { text: params.prompt || "Please summarize this audio content." }
            ]
          }
        });

        return {
          success: true,
          analysis: response.text,
          message: 'Audio analyzed successfully'
        };
      }
    }
  ]
};
