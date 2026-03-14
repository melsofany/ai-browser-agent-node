/**
 * Utility Tools Plugin
 * Provides diagram rendering, PDF conversion, and project initialization
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'utility',
  description: 'Utility tools for diagrams, PDFs, and project setup',
  
  tools: [
    {
      name: 'render_diagram',
      description: 'Render a Mermaid diagram to a text representation (mock)',
      params: {
        code: { type: 'string', description: 'Mermaid code' },
        format: { type: 'string', description: 'Output format (png, svg)', default: 'svg' }
      },
      execute: async ({ code, format }) => {
        console.log(`[UtilityTools] Rendering diagram...`);
        // In a real scenario, we would use mermaid-cli
        // For now, we return a success message and the code
        return { 
          success: true, 
          message: 'Diagram rendered successfully (simulated)',
          code: code,
          format: format
        };
      }
    },
    {
      name: 'md_to_pdf',
      description: 'Convert Markdown text to PDF (simulated)',
      params: {
        markdown: { type: 'string', description: 'Markdown content' },
        outputPath: { type: 'string', description: 'Path to save the PDF' }
      },
      execute: async ({ markdown, outputPath }) => {
        console.log(`[UtilityTools] Converting MD to PDF: ${outputPath}`);
        // Simulated conversion
        try {
          const fullPath = path.resolve(process.cwd(), outputPath);
          fs.writeFileSync(fullPath, `PDF Content (Simulated from Markdown):\n\n${markdown}`);
          return { success: true, path: fullPath };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
    },
    {
      name: 'project_init',
      description: 'Initialize a new web project structure',
      params: {
        projectName: { type: 'string', description: 'Name of the project' },
        template: { type: 'string', description: 'Template type (react, node, static)', default: 'static' }
      },
      execute: async ({ projectName, template }) => {
        console.log(`[UtilityTools] Initializing project: ${projectName} with template ${template}`);
        const projectPath = path.resolve(process.cwd(), projectName);
        
        try {
          if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
          }
          
          const files = {
            'static': {
              'index.html': '<!DOCTYPE html><html><head><title>My Project</title></head><body><h1>Hello World</h1></body></html>',
              'style.css': 'body { font-family: sans-serif; }',
              'script.js': 'console.log("Project initialized");'
            },
            'node': {
              'package.json': JSON.stringify({ name: projectName, version: '1.0.0', main: 'index.js' }, null, 2),
              'index.js': 'console.log("Hello from Node.js");',
              '.gitignore': 'node_modules\n.env'
            }
          };
          
          const templateFiles = files[template] || files['static'];
          
          for (const [filename, content] of Object.entries(templateFiles)) {
            fs.writeFileSync(path.join(projectPath, filename), content);
          }
          
          return { success: true, projectPath, files: Object.keys(templateFiles) };
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
    }
  ]
};
