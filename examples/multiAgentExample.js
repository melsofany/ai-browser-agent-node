/**
 * Multi-Agent System Example
 * Demonstrates how to use the Tool Manager and Multi-Agent Coordinator
 * Inspired by OpenManus patterns
 */

const ToolManager = require('../tools/toolManager');
const MultiAgentCoordinator = require('../agents/multiAgentCoordinator');

// Example: Create a simple agent
class ResearchAgent {
  async execute(taskDescription) {
    console.log(`[ResearchAgent] Researching: ${taskDescription}`);
    
    // Simulate research
    return {
      success: true,
      complete: false,
      findings: [
        'Finding 1: Key information about the task',
        'Finding 2: Additional context',
        'Finding 3: Relevant data'
      ]
    };
  }
}

class AnalysisAgent {
  async execute(taskDescription) {
    console.log(`[AnalysisAgent] Analyzing: ${taskDescription}`);
    
    // Simulate analysis
    return {
      success: true,
      complete: false,
      analysis: {
        complexity: 'medium',
        requiredSteps: 5,
        estimatedTime: '30 minutes'
      }
    };
  }
}

class ExecutionAgent {
  constructor(toolManager) {
    this.toolManager = toolManager;
  }

  async execute(taskDescription) {
    console.log(`[ExecutionAgent] Executing: ${taskDescription}`);
    
    // Simulate execution using tools
    return {
      success: true,
      complete: true,
      executionResult: 'Task completed successfully',
      toolsUsed: ['web_browser', 'data_processor']
    };
  }
}

// Example: Create tools
async function setupTools(toolManager) {
  // Tool 1: Web Browser
  toolManager.registerTool('web_browser', {
    description: 'Navigate and interact with web pages',
    category: 'browser',
    parameters: {
      url: { type: 'string', required: true, description: 'URL to navigate to' },
      action: { type: 'string', required: false, description: 'Action to perform (click, type, etc.)' }
    },
    execute: async (params) => {
      console.log(`[WebBrowserTool] Navigating to: ${params.url}`);
      return {
        success: true,
        url: params.url,
        title: 'Example Page',
        content: 'Page content...'
      };
    }
  });

  // Tool 2: Data Processor
  toolManager.registerTool('data_processor', {
    description: 'Process and analyze data',
    category: 'data',
    parameters: {
      data: { type: 'object', required: true, description: 'Data to process' },
      operation: { type: 'string', required: true, description: 'Operation to perform' }
    },
    execute: async (params) => {
      console.log(`[DataProcessorTool] Processing data with operation: ${params.operation}`);
      return {
        success: true,
        processed: true,
        result: 'Processed data'
      };
    }
  });

  // Tool 3: File Manager
  toolManager.registerTool('file_manager', {
    description: 'Create, read, and manage files',
    category: 'file',
    parameters: {
      action: { type: 'string', required: true, description: 'Action (create, read, delete)' },
      path: { type: 'string', required: true, description: 'File path' }
    },
    execute: async (params) => {
      console.log(`[FileManagerTool] ${params.action} file: ${params.path}`);
      return {
        success: true,
        action: params.action,
        path: params.path
      };
    }
  });

  console.log('\n✅ Tools registered successfully\n');
}

// Example: Setup multi-agent system
async function setupAgents(coordinator, toolManager) {
  // Register agents
  coordinator.registerAgent('research', new ResearchAgent());
  coordinator.registerAgent('analysis', new AnalysisAgent());
  coordinator.registerAgent('execution', new ExecutionAgent(toolManager));

  console.log('✅ Agents registered successfully\n');
}

// Example: Execute a complex task
async function executeComplexTask(coordinator, toolManager) {
  const taskDescription = 'Analyze the latest trends in AI and prepare a comprehensive report';

  console.log('='.repeat(60));
  console.log('Starting Multi-Agent Task Execution');
  console.log('='.repeat(60));
  console.log(`Task: ${taskDescription}\n`);

  try {
    // Coordinate agents to solve the task
    const result = await coordinator.coordinateTask(taskDescription, 'research_task');

    console.log('\n' + '='.repeat(60));
    console.log('Task Execution Completed');
    console.log('='.repeat(60));
    console.log('Final Result:', JSON.stringify(result, null, 2));

    // Display statistics
    console.log('\n' + '-'.repeat(60));
    console.log('Execution Statistics');
    console.log('-'.repeat(60));
    const stats = toolManager.getExecutionStats();
    console.log('Tool Execution Stats:', JSON.stringify(stats, null, 2));

    const agentStats = coordinator.getAgentStats();
    console.log('Agent Stats:', JSON.stringify(agentStats, null, 2));
  } catch (error) {
    console.error('Task execution failed:', error.message);
  }
}

// Example: Demonstrate tool discovery
async function demonstrateToolDiscovery(toolManager) {
  console.log('\n' + '='.repeat(60));
  console.log('Tool Discovery Example');
  console.log('='.repeat(60));

  // Get all tools
  const allTools = toolManager.getAllTools();
  console.log(`\nTotal tools registered: ${allTools.length}`);
  console.log('Tools:', allTools.map(t => t.name).join(', '));

  // Get tools by category
  const categories = toolManager.getCategories();
  console.log(`\nCategories: ${categories.join(', ')}`);

  for (const category of categories) {
    const tools = toolManager.getToolsByCategory(category);
    console.log(`  ${category}: ${tools.map(t => t.name).join(', ')}`);
  }

  // Find tools by description
  const matches = toolManager.findToolsByDescription('navigate web pages');
  console.log(`\nTools matching "navigate web pages":`);
  matches.forEach(match => {
    console.log(`  - ${match.tool.name} (relevance: ${(match.relevance * 100).toFixed(0)}%)`);
  });

  // Get tool schemas
  const schemas = toolManager.getAllToolSchemas();
  console.log(`\nTool Schemas (for LLM):`);
  console.log(JSON.stringify(schemas, null, 2));
}

// Main execution
async function main() {
  console.log('\n🚀 Multi-Agent System Example\n');

  // Initialize managers
  const toolManager = new ToolManager();
  const coordinator = new MultiAgentCoordinator(toolManager);

  // Setup tools and agents
  await setupTools(toolManager);
  await setupAgents(coordinator, toolManager);

  // Demonstrate tool discovery
  await demonstrateToolDiscovery(toolManager);

  // Execute a complex task
  await executeComplexTask(coordinator, toolManager);

  console.log('\n✅ Example completed\n');
}

// Run the example
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  setupTools,
  setupAgents,
  executeComplexTask,
  demonstrateToolDiscovery
};
