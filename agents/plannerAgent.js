/**
 * Planner Agent
 * Receives tasks and breaks them into smaller executable steps
 * Uses DeepSeek AI for intelligent planning if API key is available
 */

const axios = require('axios');
const config = require('../config/config');

class PlannerAgent {
  constructor() {
    this.taskQueue = [];
    this.executedTasks = [];
    
    // Initialize DeepSeek
    this.deepseekApiKey = config.deepseekApiKey;
    
    // Common platform mappings
    this.platformUrls = {
      'meta': 'https://developers.facebook.com',
      'whatsapp': 'https://business.whatsapp.com',
      'google': 'https://www.google.com',
      'github': 'https://github.com',
      'facebook': 'https://www.facebook.com',
      'twitter': 'https://twitter.com',
      'x': 'https://x.com',
      'linkedin': 'https://www.linkedin.com',
    };
  }

  /**
   * Safely parse JSON from a string, handling markdown blocks and common errors
   */
  safeJsonParse(text) {
    if (!text) return null;
    
    // Clean the text first
    let cleanedText = text.trim();
    
    // Remove markdown code blocks if present
    const jsonBlockMatch = cleanedText.match(/```json\s*([\s\S]*?)\s*```/) || cleanedText.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) {
      cleanedText = jsonBlockMatch[1].trim();
    }

    try {
      return JSON.parse(cleanedText);
    } catch (e) {
      console.warn('[PlannerAgent] Direct JSON parse failed, attempting recovery...', e.message);
      
      // Attempt to fix common JSON issues (like unterminated strings from truncation)
      try {
        let fixedText = cleanedText;
        
        // If it looks like it's truncated (ends with a partial string or property)
        if (e.message.includes('Unterminated string') || e.message.includes('Unexpected end of JSON input')) {
          // Try to close open quotes
          const quoteCount = (fixedText.match(/"/g) || []).length;
          if (quoteCount % 2 !== 0) {
            fixedText += '"';
          }
          
          // Try to close open braces/brackets
          const openBraces = (fixedText.match(/\{/g) || []).length;
          const closeBraces = (fixedText.match(/\}/g) || []).length;
          for (let i = 0; i < openBraces - closeBraces; i++) {
            fixedText += '}';
          }
          
          const openBrackets = (fixedText.match(/\[/g) || []).length;
          const closeBrackets = (fixedText.match(/\]/g) || []).length;
          for (let i = 0; i < openBrackets - closeBrackets; i++) {
            fixedText += ']';
          }
          
          try {
            return JSON.parse(fixedText);
          } catch (e2) {
            // If still failing, try more aggressive extraction
          }
        }

        // Try to find the first '{' and last '}' or '[' and last ']'
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        const firstBracket = cleanedText.indexOf('[');
        const lastBracket = cleanedText.lastIndexOf(']');
        
        let start = -1;
        let end = -1;
        
        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
          start = firstBrace;
          end = lastBrace;
        } else if (firstBracket !== -1) {
          start = firstBracket;
          end = lastBracket;
        }
        
        if (start !== -1 && end !== -1 && end > start) {
          const potentialJson = cleanedText.substring(start, end + 1);
          try {
            return JSON.parse(potentialJson);
          } catch (e3) {
            // Last resort: try to fix the potentialJson too
            let fixedPotential = potentialJson;
            const qCount = (fixedPotential.match(/"/g) || []).length;
            if (qCount % 2 !== 0) fixedPotential += '"';
            
            const oB = (fixedPotential.match(/\{/g) || []).length;
            const cB = (fixedPotential.match(/\}/g) || []).length;
            for (let i = 0; i < oB - cB; i++) fixedPotential += '}';
            
            try {
              return JSON.parse(fixedPotential);
            } catch (e4) {
              console.error('[PlannerAgent] All JSON recovery attempts failed');
            }
          }
        }
      } catch (recoveryErr) {
        console.error('[PlannerAgent] JSON recovery logic failed:', recoveryErr.message);
      }
      
      throw e; // Re-throw original error if all attempts fail
    }
  }

  /**
   * Generate a high-level plan for a goal
   * Goal -> Plan -> Actions
   */
  async generatePlan(goal, context = {}) {
    console.log(`[PlannerAgent] Generating plan for goal: ${goal}`);
    
    if (!this.deepseekApiKey) {
      return this.generatePlanLocally(goal);
    }

    try {
      const isArabic = /[\u0600-\u06FF]/.test(goal);
      const languageInstruction = isArabic 
        ? "IMPORTANT: You must reason and plan in Arabic. However, the JSON structure must remain in English."
        : "You must respond in English.";

      const systemPrompt = `You are a high-level task planner for an autonomous AI browser agent.
${languageInstruction}
Your job is to break down a complex goal into a sequence of logical steps.
Each step should be clear and actionable.

CRITICAL: When dealing with forms:
1. Identify if a field is a dropdown (select).
2. For dates of birth, check if they are split into Day, Month, and Year fields. If so, create separate steps for each.
3. Use realistic data for all fields.

Return ONLY a valid JSON object (no markdown blocks, no preamble):
{
  "goal": "the original goal",
  "analysis": "brief analysis of the task",
  "steps": [
    { "id": 1, "description": "step description", "expectedOutcome": "what should happen" },
    ...
  ],
  "estimatedComplexity": "low|medium|high",
  "requiredTools": ["browser", "terminal", "filesystem"]
}`;

      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Goal: ${goal}\nContext: ${JSON.stringify(context)}` }
        ],
      }, {
        headers: { 
          'Authorization': `Bearer ${this.deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });
      const responseText = response.data.choices[0].message.content;

      const plan = this.safeJsonParse(responseText);
      return { success: true, plan };
    } catch (error) {
      console.error('[PlannerAgent] Plan generation failed:', error.message);
      return this.generatePlanLocally(goal);
    }
  }

  /**
   * Generate a simple plan locally
   */
  generatePlanLocally(goal) {
    return {
      success: true,
      plan: {
        goal,
        analysis: "Local rule-based planning",
        steps: [
          { id: 1, description: `Start working on: ${goal}`, expectedOutcome: "Initial progress" }
        ],
        estimatedComplexity: "medium",
        requiredTools: ["browser"]
      }
    };
  }

  /**
   * Analyze a task and create an execution plan
   * @param {Object} task - The task to plan
   * @returns {Promise<Object>} Object containing the execution plan
   */
  async planTask(task) {
    let { description, type, priority = 'normal' } = task;

    console.log(`[PlannerAgent] Planning task: ${description}`);

    // Auto-determine priority and type using DeepSeek or Gemini
    if (!type || type === 'auto') {
      if (this.deepseekApiKey) {
        try {
          let analysis = null;
          analysis = await this.analyzeTaskWithDeepSeek(description, type);
          
          if (analysis) {
            type = analysis.type || type;
            priority = analysis.priority || priority;
            console.log(`[PlannerAgent] Auto-determined type: ${type}, priority: ${priority}`);
          }
        } catch (error) {
          console.warn('[PlannerAgent] Task analysis failed, using provided values:', error.message);
        }
      }
    }

    // Final fallback for type detection if AI failed or wasn't used
    if (!type || type === 'auto') {
      const descLower = description.toLowerCase();
      const urlMatch = description.match(/https?:\/\/[^\s]+/);
      const browserKeywords = ['visit', 'open', 'navigate', 'search', 'find', 'browse', 'facebook', 'google', 'موقع', 'دخول', 'تصفح', 'ابحث', 'فيسبوك', 'انشاء حساب'];
      
      if (urlMatch || browserKeywords.some(kw => descLower.includes(kw))) {
        type = 'browser';
      } else if (descLower.includes('npm') || descLower.includes('node') || descLower.includes('git') || descLower.includes('run')) {
        type = 'system';
      }
    }

    // Update task with auto-determined values
    task.type = type;
    task.priority = priority;

    let steps = [];

    if (this.deepseekApiKey) {
      try {
        steps = await this.planWithDeepSeek(description, type);

        if (!steps || steps.length === 0) {
          console.warn('[PlannerAgent] AI returned empty steps, falling back to rule-based planning');
          steps = this.planWithRules(task);
        }
      } catch (error) {
        console.error('[PlannerAgent] AI planning failed, falling back to rule-based planning:', error.message);
        steps = this.planWithRules(task);
      }
    } else {
      steps = this.planWithRules(task);
    }

    // Ensure we have at least one step
    if (!steps || steps.length === 0) {
      steps = [{
        order: 1,
        action: 'error:invalid',
        params: { task },
        description: 'Task planning failed: No steps could be generated from the description.',
      }];
    }

    return {
      taskId: task.id,
      description,
      type,
      priority,
      steps,
      totalSteps: steps.length,
      status: 'planned',
      createdAt: new Date(),
    };
  }

  /**
   * Analyze task to auto-determine type and priority using DeepSeek
   */
  async analyzeTaskWithDeepSeek(description, type) {
    console.log('[PlannerAgent] Analyzing task with DeepSeek...');
    
    const systemPrompt = `You are a task analyzer. Analyze the user's request and determine:
1. The task type: 'browser' for web automation, 'system' for system commands, 'development' for git/file operations, or 'auto' for auto-detection
2. The priority: 'high' for urgent/important, 'normal' for regular, 'low' for background tasks

Return ONLY a valid JSON object with "type" and "priority" fields.
Example: { "type": "browser", "priority": "high" }`;

    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Task: ${description}` }
        ],
      }, {
        headers: {
          'Authorization': `Bearer ${this.deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // Increased timeout to 60s
      });

      const content = response.data.choices[0].message.content;
      const parsed = this.safeJsonParse(content);
      
      if (parsed && parsed.type && parsed.priority) {
        return parsed;
      }
      return null;
    } catch (err) {
      console.error('[PlannerAgent] DeepSeek task analysis error:', err.message);
      return null;
    }
  }

  /**
   * Plan using DeepSeek AI
   */
  async planWithDeepSeek(description, type) {
    console.log('[PlannerAgent] Planning with DeepSeek...');
    
    const systemPrompt = `You are an AI task planner. Break down the user's request into a series of executable steps for an automated browser agent.
The goal is to create a detailed and flexible plan, keeping in mind that the agent may need to replan based on observations.

Available Actions:
- browser:navigate { "url": "string", "description": "string" } : Navigate to a specific URL.
- browser:click { "selector": "string", "description": "string" } : Click on an element on the page using a CSS selector.
- browser:type { "selector": "string", "text": "string", "description": "string" } : Type text into an input element. CRITICAL: Use SEMI-REALISTIC data for names, emails, and passwords (e.g., "Ahmed Mansour", "ahmed.m2024@gmail.com", "P@ssw0rd2026!").
- browser:submit { "selector": "string", "description": "string" } : Submit a form.
- browser:extract { "selector": "string", "description": "string" } : Extract content from the page (can be a specific selector or the entire page).
- browser:waitForSelector { "selector": "string", "timeout": "number", "description": "string" } : Wait for an element to appear on the page.
- browser:waitForUser { "description": "string" } : Pause execution and wait for human intervention (e.g., solving a CAPTCHA, manual login, or complex decision).
- browser:screenshot { "filePath": "string", "description": "string" } : Take a screenshot of the page.
- browser:evaluate { "script": "string", "description": "string" } : Execute JavaScript in the browser context.
- media:generate_image { "prompt": "string", "aspectRatio": "string" } : Generate an image from text.
- media:analyze_audio { "audioData": "string", "mimeType": "string", "prompt": "string" } : Analyze audio content.
- data:summarize_json { "data": "object" } : Summarize JSON data.
- data:filter_collection { "collection": "array", "key": "string", "value": "any" } : Filter a collection.
- utility:render_diagram { "code": "string", "format": "string" } : Render a diagram from code.
- utility:md_to_pdf { "markdown": "string", "outputPath": "string" } : Convert Markdown to PDF.
- utility:project_init { "projectName": "string", "template": "string" } : Initialize a new project structure.
- scheduling:schedule_task { "delayMs": "number", "taskDescription": "string" } : Schedule a task for later.
- skill:use_skill { "skillName": "string", "params": "object" } : Use a predefined complex skill (e.g., web_development, deep_research).
- system:execute { "command": "string", "description": "string" } : Execute an OS command.
- system:readFile { "filePath": "string", "description": "string" } : Read the content of a file.
- system:writeFile { "filePath": "string", "content": "string", "description": "string" } : Write content to a file.
- agent:replan { "reason": "string", "description": "string" } : Request a task replan due to an unexpected obstacle or need for a new approach.

The plan must be a JSON array of steps. Each step must contain: "order" (number), "action" (string), "params" (object), and "description" (string).
Each step should have "reasoning" explaining why this step is being taken.

CRITICAL: Return ONLY the raw JSON array. Do not include markdown code blocks or any other text.`;

    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Task: ${description}\nType: ${type || 'auto'}` }
          ],
        }, {
          headers: {
            'Authorization': `Bearer ${this.deepseekApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000 // Keep timeout at 2 minutes
        });

        const content = response.data.choices[0].message.content;
        const parsed = this.safeJsonParse(content);
        
        if (Array.isArray(parsed)) return parsed;
        if (parsed.steps && Array.isArray(parsed.steps)) return parsed.steps;
        return [];
      } catch (err) {
        if (err.message.includes('aborted') || err.message.includes('timeout')) {
          retryCount++;
          if (retryCount <= maxRetries) {
            console.warn(`[PlannerAgent] DeepSeek API timeout, retrying (${retryCount}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
        }
        console.error('[PlannerAgent] DeepSeek API Error:', err.message);
        throw err;
      }
    }
  }

  /**
   * Fallback rule-based planning
   */
  planWithRules(task) {
    const { type } = task;
    if (type === 'browser') {
      return this.planBrowserTask(task);
    } else if (type === 'system') {
      return this.planSystemTask(task);
    } else if (type === 'development') {
      return this.planDevelopmentTask(task);
    } else if (type === 'self-improvement') {
      return this.planSelfImprovementTask(task);
    } else {
      return this.planGenericTask(task);
    }
  }

  /**
   * Plan self-improvement tasks
   */
  planSelfImprovementTask(task) {
    return [
      {
        order: 1,
        action: 'system:execute',
        params: { command: 'npm run lint', description: 'Check for syntax errors' },
        description: 'Linting the codebase',
        reasoning: 'Self-improvement starts with ensuring code quality.'
      },
      {
        order: 2,
        action: 'agent:replan',
        params: { reason: 'Analyzing memory for improvements', description: 'Self-reflection' },
        description: 'Reflecting on past performance',
        reasoning: 'Analyzing logs to identify recurring issues.'
      }
    ];
  }

  /**
   * Plan browser automation tasks
   */
  planBrowserTask(task) {
    const steps = [];
    let { url, actions = [], description } = task;

    // If no URL is provided, try to extract it from description or use common mappings
    if (!url) {
      const urlMatch = description.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        url = urlMatch[0];
      } else {
        // Try to find platform keywords
        const lowerDesc = description.toLowerCase();
        for (const [platform, platformUrl] of Object.entries(this.platformUrls)) {
          if (lowerDesc.includes(platform)) {
            url = platformUrl;
            break;
          }
        }
      }
    }

    // If still no URL, but it's a browser task, use a search engine as starting point
    if (!url) {
      url = `https://www.google.com/search?q=${encodeURIComponent(description)}`;
    }

    steps.push({
      order: 1,
      action: 'browser:navigate',
      params: { url },
      description: `Navigate to ${url}`,
    });

    // Check if user requested a wait/manual step in the description
    const lowerDesc = description.toLowerCase();
    if (lowerDesc.includes('wait') || lowerDesc.includes('captcha') || lowerDesc.includes('انتظار') || lowerDesc.includes('يدوي') || lowerDesc.includes('تدخل') || lowerDesc.includes('human')) {
      steps.push({
        order: steps.length + 1,
        action: 'browser:waitForUser',
        params: {},
        description: 'Wait for user interaction (CAPTCHA/Login/Manual Control)',
      });
    }

    actions.forEach((action, index) => {
      steps.push({
        order: steps.length + 1,
        action: `browser:${action.type}`,
        params: action.params,
        description: action.description || `Execute action: ${action.type}`,
      });
    });

    // If there are no actions, add a generic extraction step to at least show something
    if (actions.length === 0) {
      steps.push({
        order: steps.length + 1,
        action: 'browser:extract',
        params: {},
        description: 'Extract page content to analyze next steps',
      });
    }

    return steps;
  }

  /**
   * Plan system command tasks
   */
  planSystemTask(task) {
    const steps = [];
    const { commands = [] } = task;

    commands.forEach((cmd, index) => {
      steps.push({
        order: index + 1,
        action: 'system:execute',
        params: { command: cmd },
        description: `Execute: ${cmd}`,
      });
    });

    return steps;
  }

  /**
   * Plan development tasks (git, file operations, etc.)
   */
  planDevelopmentTask(task) {
    const steps = [];
    const { operations = [] } = task;

    operations.forEach((op, index) => {
      steps.push({
        order: index + 1,
        action: `dev:${op.type}`,
        params: op.params,
        description: op.description || `Execute: ${op.type}`,
      });
    });

    return steps;
  }

  /**
   * Plan generic tasks
   */
  planGenericTask(task) {
    const description = task.description.toLowerCase();

    // Check if it looks like a browser task even if not explicitly set
    const urlMatch = task.description.match(/https?:\/\/[^\s]+/);
    const browserKeywords = [
      'visit', 'open', 'navigate', 'search', 'find', 'browse', 'facebook', 'google', 'twitter', 'linkedin', 'github', 'x.com',
      'موقع', 'دخول', 'تصفح', 'ابحث', 'فيسبوك', 'قوقل', 'تويتر', 'لينكد', 'يوتيوب', 'انستقرام', 'سجل', 'انشاء حساب'
    ];
    
    const isBrowserTask = urlMatch || browserKeywords.some(keyword => description.includes(keyword));

    if (isBrowserTask) {
      return this.planBrowserTask(task);
    }

    // Support self-improvement
    if (description.includes('self-improvement') || description.includes('تطوير ذاتي') || description.includes('improve yourself')) {
      return this.planSelfImprovementTask(task);
    }

    return [{
      order: 1,
      action: 'error:invalid',
      params: { task },
      description: 'Invalid task: Please specify a valid task type (browser, system, or development).',
    }];
  }

  /**
   * Plan self-improvement tasks
   */
  planSelfImprovementTask(task) {
    return [{
      order: 1,
      action: 'system:selfImprovement',
      params: { taskId: task.id },
      description: 'Analyze performance and suggest improvements',
    }];
  }

  /**
   * Plan a multi-stage task by breaking it into sub-tasks
   */
  async planMultiStageTask(taskDescription) {
    console.log(`[PlannerAgent] Planning multi-stage task: ${taskDescription}`);
    
    const systemPrompt = `You are a multi-stage task planner. Break down a complex request into a series of independent sub-tasks.
For each sub-task, provide:
1. Title
2. Description
3. Type (browser, system, development, media, data)
4. Dependencies (list of sub-task titles that must be completed first)

Return a JSON object with a "subtasks" array.`;

    try {
      let content = '';
      if (this.deepseekApiKey) {
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Task: ${taskDescription}` }
          ],
        }, {
          headers: {
            'Authorization': `Bearer ${this.deepseekApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        });
        content = response.data.choices[0].message.content;
      }

      const parsed = this.safeJsonParse(content);
      return parsed.subtasks || [];
    } catch (err) {
      console.error('[PlannerAgent] Multi-stage planning failed:', err.message);
      return [{ title: 'Main Task', description: taskDescription, type: 'auto', dependencies: [] }];
    }
  }

  /**
   * Get task execution plan
   */
  getTaskPlan(taskId) {
    return this.taskQueue.find((t) => t.taskId === taskId);
  }

  /**
   * Add task to queue
   */
  addTaskToQueue(plan) {
    this.taskQueue.push(plan);
    return plan;
  }

  /**
   * Mark task as executed
   */
  markTaskExecuted(taskId, result) {
    const taskIndex = this.taskQueue.findIndex((t) => t.taskId === taskId);
    if (taskIndex !== -1) {
      const task = this.taskQueue[taskIndex];
      task.status = 'executed';
      task.result = result;
      task.executedAt = new Date();
      this.executedTasks.push(task);
      this.taskQueue.splice(taskIndex, 1);
      return task;
    }
    return null;
  }
}

module.exports = PlannerAgent;
