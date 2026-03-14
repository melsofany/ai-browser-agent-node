/**
 * ReAct Loop Implementation
 * Implements the Observe -> Think -> Plan -> Act -> Verify cycle
 * This is the core loop that makes the agent autonomous and self-correcting
 */

const axios = require('axios');
const config = require('../config/config');
const { GoogleGenAI } = require('@google/genai');
const MemorySystem = require('./memorySystem');
const SelfImprovementAgent = require('./selfImprovementAgent');
const fs = require('fs');
const dataGenerator = require('./dataGenerator');

const EventEmitter = require('events');

class ReActLoop extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxIterations = options.maxIterations || 15;
    this.maxRetriesPerAction = options.maxRetriesPerAction || 3;
    this.currentIteration = 0;
    this.executionHistory = [];
    this.taskContext = null;
    this.memory = new MemorySystem({ backend: config.memoryBackend });
    this.selfImprovement = new SelfImprovementAgent(this.memory);
    this.planner = options.planner;
    this.executor = options.executor;
    this.lastObservation = null;
    this.lastThought = null;
    this.lastPlan = null;
    this.lastAction = null;
    this.lastVerification = null;

    // Initialize Gemini
    if (config.geminiApiKey) {
      this.genAI = new GoogleGenAI({ apiKey: config.geminiApiKey });
    }
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
      console.warn('[ReActLoop] Direct JSON parse failed, attempting recovery...', e.message);
      
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
              console.error('[ReActLoop] All JSON recovery attempts failed');
            }
          }
        }
      } catch (recoveryErr) {
        console.error('[ReActLoop] JSON recovery logic failed:', recoveryErr.message);
      }
      
      throw e; // Re-throw original error if all attempts fail
    }
  }

  /**
   * Execute the ReAct Loop
   * Main entry point for autonomous task execution
   */
  async executeTask(task, browser) {
    console.log('[ReActLoop] Starting ReAct Loop for task:', task.description);
    
    // Step 0: Initial Planning (Goal -> Plan)
    const isArabic = /[\u0600-\u06FF]/.test(task.description);
    this.emit('progress', { 
      step: 'PLANNING', 
      message: isArabic ? 'جاري وضع خطة عمل للمهمة...' : 'Generating high-level plan for the task...' 
    });
    
    const highLevelPlan = await this.planner.generatePlan(task.description);
    this.taskContext = {
      task,
      highLevelPlan: highLevelPlan.success ? highLevelPlan.plan : null,
      startTime: Date.now(),
      attempts: 0,
      errors: [],
      results: []
    };

    if (highLevelPlan.success) {
      this.emit('progress', {
        step: 'PLAN',
        message: isArabic ? 'تم وضع الخطة بنجاح' : 'High-level plan generated successfully',
        data: highLevelPlan.plan
      });
    }

    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 3;

    while (this.currentIteration < this.maxIterations) {
      this.currentIteration++;
      console.log(`\n[ReActLoop] Iteration ${this.currentIteration}/${this.maxIterations}`);

      try {
        this.emit('iteration', { iteration: this.currentIteration, maxIterations: this.maxIterations });
        
        // Step 1: OBSERVE - Take screenshot and analyze current state
        const isArabic = /[\u0600-\u06FF]/.test(this.taskContext.task.description);
        
        this.emit('progress', { 
          step: 'OBSERVE', 
          message: isArabic ? 'جاري تحليل حالة الصفحة الحالية...' : 'Analyzing current page state...' 
        });
        const observation = await this.observe(browser);
        this.lastObservation = observation;

        if (!observation.success) {
          console.error('[ReActLoop] Observation failed:', observation.error);
          this.taskContext.errors.push(observation.error);
          this.consecutiveErrors++;
          
          if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            console.error('[ReActLoop] Too many consecutive errors, stopping.');
            const stopMessage = isArabic ? 'تم إيقاف المهمة بسبب كثرة الأخطاء المتتالية. يرجى التأكد من اتصال الإنترنت أو المحاولة لاحقاً.' : 'Task aborted due to too many consecutive errors. Please check connection or try again later.';
            this.taskContext.errors.push(stopMessage);
            break;
          }
          
          // Try to recover from observation failure
          if (observation.error.includes('Screenshot failed') || observation.error.includes('Target closed')) {
            console.log('[ReActLoop] Screenshot or Target error, attempting browser re-initialization...');
            await browser.initialize(browser.io);
          }
          
          // Wait a bit before retrying observation
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }

        // Reset consecutive errors on success
        this.consecutiveErrors = 0;

        // Update context with latest observation
        this.taskContext.lastObservation = observation;
        this.taskContext.pageTitle = observation.pageContent?.title;
        this.taskContext.pageUrl = observation.pageUrl || observation.pageContent?.url;
        this.taskContext.analysis = observation.analysis;
        this.taskContext.interactiveElements = observation.interactiveElements;
        this.taskContext.accessibilityTree = observation.accessibilityTree;

        // Step 2: THINK - Analyze the observation and generate thoughts
        this.emit('progress', { 
          step: 'THINK', 
          message: isArabic ? 'جاري التفكير في الخطوات التالية...' : 'Reasoning about next steps...' 
        });

        // Retrieve relevant memories
        const relevantMemories = await this.memory.retrieveRelevantMemories(this.taskContext.task.description);
        this.taskContext.relevantMemories = relevantMemories;

        // Emit relevant memories to frontend
        if (relevantMemories.tasks.length > 0 || relevantMemories.errors.length > 0) {
          this.emit('progress', {
            step: 'MEMORY',
            message: isArabic ? 'تم استرجاع ذكريات ذات صلة...' : 'Retrieved relevant memories...',
            data: relevantMemories
          });
        }

        const thought = await this.think(observation, this.taskContext);
        this.lastThought = thought;

        if (!thought.success) {
          console.error('[ReActLoop] Thinking failed:', thought.error);
          this.taskContext.errors.push(thought.error);
          continue;
        }

        // Check if task is complete
        if (thought.taskComplete) {
          console.log('[ReActLoop] Task completed according to AI analysis');
          this.taskContext.completed = true;
          break;
        }

        // Step 3: PLAN - Create action plan based on thoughts
        this.emit('progress', { 
          step: 'PLAN', 
          message: isArabic ? 'جاري إنشاء خطة العمل...' : 'Creating action plan...' 
        });
        const plan = await this.plan(thought, this.taskContext);
        this.lastPlan = plan;

        if (!plan.success || !plan.nextAction) {
          console.error('[ReActLoop] Planning failed:', plan.error);
          this.taskContext.errors.push(plan.error || (isArabic ? 'لم يتم التخطيط لأي إجراء' : 'No action planned'));
          continue;
        }

        // Step 4: ACT - Execute the planned action with Retry Logic
        let action;
        let retryCount = 0;
        let actionSuccess = false;

        while (retryCount < this.maxRetriesPerAction && !actionSuccess) {
          const actionMessage = plan.reasoning || (isArabic 
            ? `جاري تنفيذ الإجراء: ${plan.nextAction.type}` 
            : `Executing action: ${plan.nextAction.type}`);
          
          this.emit('progress', { 
            step: 'ACT', 
            message: actionMessage,
            data: plan.nextAction
          });
          
          action = await this.act(plan.nextAction, browser);
          this.lastAction = action;
          
          if (action.success) {
            actionSuccess = true;
            this.taskContext.results.push(action);
          } else {
            retryCount++;
            console.warn(`[ReActLoop] Action failed (attempt ${retryCount}/${this.maxRetriesPerAction}):`, action.error);
            
            if (retryCount < this.maxRetriesPerAction) {
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              this.taskContext.errors.push(`Action ${plan.nextAction.type} failed after ${this.maxRetriesPerAction} attempts: ${action.error}`);
            }
          }
        }

        // Step 5: VERIFY - Verify action result
        this.emit('progress', { 
          step: 'VERIFY', 
          message: isArabic ? 'جاري التحقق من نتيجة الإجراء...' : 'Verifying action result...' 
        });
        const verification = await this.verify(action, observation, browser);
        this.lastVerification = verification;

        // Store in history
        this.executionHistory.push({
          iteration: this.currentIteration,
          observation,
          thought,
          plan,
          action,
          verification,
          timestamp: new Date()
        });

      } catch (error) {
        console.error(`[ReActLoop] Error in iteration ${this.currentIteration}:`, error.message);
        this.taskContext.errors.push(error.message);
        
        // Brief wait before next iteration
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    const duration = (Date.now() - this.taskContext.startTime) / 1000;
    console.log(`[ReActLoop] Task finished in ${duration}s. Completed: ${this.taskContext.completed}`);
    
    // Final report
    return {
      success: this.taskContext.completed,
      duration,
      iterations: this.currentIteration,
      results: this.taskContext.results,
      errors: this.taskContext.errors
    };
  }

  /**
   * OBSERVE: Take screenshot and analyze current state
   */
  async observe(browser) {
    console.log('[ReActLoop] OBSERVE: Taking screenshot and analyzing page...');
    
    try {
      // Get current page content and screenshot
      const observation = await browser.getObservation();
      return observation;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * THINK: Analyze the observation and generate thoughts
   */
  async think(observation, context) {
    console.log('[ReActLoop] THINK: Reasoning about next steps...');
    
    if (!config.deepseekApiKey && !this.genAI) {
      return this.thinkLocally(observation, context);
    }

    try {
      const isArabic = /[\u0600-\u06FF]/.test(context.task.description);
      const languageInstruction = isArabic 
        ? "IMPORTANT: You must think and reason in Arabic. Keep all descriptions VERY CONCISE. However, the JSON KEYS must remain in English. Only the values should be in Arabic."
        : "You must respond in English.";

      const systemPrompt = `You are an autonomous AI agent. Analyze the page and determine the next action.
${languageInstruction}
Return ONLY a valid JSON object with: currentState, progress, obstacles, taskComplete, nextSteps, confidence. Do not include markdown blocks.`;

      let responseText;
      if (config.deepseekApiKey) {
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { 
              role: 'user', 
              content: `Task: ${context.task.description}
Current URL: ${context.pageUrl || 'unknown'}
Current page title: ${context.pageTitle || 'unknown'}
Page analysis: ${JSON.stringify(context.analysis || {})}
Accessibility Tree:
${context.accessibilityTree || 'No tree available'}
Interactive elements count: ${context.interactiveElements?.length || 0}
Recent actions: ${JSON.stringify(context.results.slice(-3))}
Recent errors: ${JSON.stringify(context.errors.slice(-3))}
Relevant memories: ${JSON.stringify(context.relevantMemories || {})}

Please analyze the current state.` 
            }
          ],
          temperature: 0.5,
          max_tokens: 800
        }, {
          headers: {
            'Authorization': `Bearer ${config.deepseekApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // Increased timeout
        });
        responseText = response.data.choices[0].message.content;
      } else {
        // Retry logic for Gemini
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            const result = await this.genAI.models.generateContent({
              model: 'gemini-2.0-flash',
              contents: [{ role: 'user', parts: [{ text: `${systemPrompt}

Task: ${context.task.description}
Current URL: ${context.pageUrl || 'unknown'}
Current page title: ${context.pageTitle || 'unknown'}
Page analysis: ${JSON.stringify(context.analysis || {})}
Accessibility Tree:
${context.accessibilityTree || 'No tree available'}
Interactive elements count: ${context.interactiveElements?.length || 0}
Recent actions: ${JSON.stringify(context.results.slice(-3))}
Recent errors: ${JSON.stringify(context.errors.slice(-3))}
Relevant memories: ${JSON.stringify(context.relevantMemories || {})}` }] }],
              config: { responseMimeType: "application/json" }
            });
            responseText = result.text;
            break;
          } catch (geminiError) {
            if (geminiError.message.includes('API key not valid')) {
              console.error('[ReActLoop] CRITICAL ERROR: The Gemini API Key provided is invalid. Please check your AI Studio Secrets.');
              throw geminiError;
            }
            if (geminiError.message.includes('aborted') && retryCount < maxRetries) {
              retryCount++;
              console.warn(`[ReActLoop] Gemini thinking aborted, retrying (${retryCount}/${maxRetries})...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
            throw geminiError;
          }
        }
      }

      const thinking = this.safeJsonParse(responseText);
      console.log('[ReActLoop] AI Thinking Result:', JSON.stringify(thinking, null, 2));
      return {
        success: true,
        currentState: thinking.currentState,
        progress: thinking.progress,
        obstacles: thinking.obstacles,
        taskComplete: thinking.taskComplete || false,
        nextSteps: thinking.nextSteps,
        confidence: thinking.confidence || 0.5,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[ReActLoop] Thinking error:', error.message);
      return this.thinkLocally(observation, context);
    }
  }

  /**
   * Local thinking without AI
   */
  thinkLocally(observation, context) {
    const pageText = observation.pageContent?.text || '';
    const taskDesc = context.task.description.toLowerCase();

    return {
      success: true,
      currentState: 'Analyzing page state',
      progress: 'In progress',
      obstacles: [],
      taskComplete: false,
      nextSteps: ['Continue with next action'],
      confidence: 0.3,
      timestamp: new Date()
    };
  }

  /**
   * PLAN: Create action plan based on thoughts
   */
  async plan(thought, context) {
    console.log('[ReActLoop] PLAN: Creating action plan...');
    
    if (!config.deepseekApiKey && !this.genAI) {
      return this.planLocally(thought, context);
    }

    try {
      const isArabic = /[\u0600-\u06FF]/.test(context.task.description);
      const languageInstruction = isArabic 
        ? "IMPORTANT: You must reason in Arabic. The 'reasoning' value should be a VERY CONCISE description of the action (max 10 words). However, the JSON KEYS and action types must remain in English."
        : "You must respond in English.";

      const systemPrompt = `You are an action planner for web automation.
${languageInstruction}
Based on the analysis and current obstacles, determine the next action to take.

CRITICAL: When filling forms, you MUST:
1. Carefully analyze each field's requirements (label, placeholder, type).
2. Map data to the CORRECT fields. Do not put names in email fields or vice versa.
3. For dropdowns (select tags), look at the 'options' provided in the element metadata. Use 'select_option' with the correct 'value'.
4. For multi-part dates (Day, Month, Year in separate fields), identify all three fields and fill them individually.
5. Ensure all required fields are filled before submitting.
6. If you are unsure about a field, use 'extract' to get more context or 'wait' for the page to stabilize.

CRITICAL: When generating data for 'type' actions (like names, emails, passwords, phone numbers), ALWAYS use SEMI-REALISTIC data. 
- For names: Use common Arabic or English names (e.g., "Ahmed Mansour", "Sarah Smith").
- For emails: Use realistic patterns (e.g., "ahmed.m2024@gmail.com", "sarah.dev.test@outlook.com").
- For passwords: Use secure-looking strings (e.g., "P@ssw0rd2026!", "Secure#User99").
- For dates: Use realistic birth dates (e.g., "1995-05-15").

Available actions (use these EXACT types):
- click: { elementId, x, y }
- type: { elementId, text }
- scroll: { direction, amount }
- wait: { duration }
- extract: {}
- navigate: { url }
- move_mouse: { x, y }
- press_key: { key }
- select_option: { elementId, value }
- upload_file: { elementId, filePath }
- find_keyword: { keyword }
- fill_form: { data } (where data is an object of elementId: value)
- message: { type: 'info'|'ask'|'result', content: 'string', data: object }

IMPORTANT: Keep 'reasoning' extremely brief and direct.
Return ONLY a valid JSON object with: nextAction (object with 'type' and 'params'), reasoning, confidence. Do not include markdown blocks.`;

      let responseText;
      if (config.deepseekApiKey) {
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { 
              role: 'user', 
              content: `Task: ${context.task.description}
Current Thoughts: ${JSON.stringify(thought)}
Interactive Elements: ${JSON.stringify(context.interactiveElements?.map(e => ({ id: e.id, tag: e.tag, text: e.text, label: e.label, role: e.role, type: e.type, placeholder: e.placeholder, options: e.options })) || [])}

Plan the next action.` 
            }
          ],
          temperature: 0.4,
          max_tokens: 500
        }, {
          headers: {
            'Authorization': `Bearer ${config.deepseekApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000 // Increased timeout
        });
        responseText = response.data.choices[0].message.content;
      } else {
        try {
          const result = await this.genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: `${systemPrompt}

Task: ${context.task.description}
Current Thoughts: ${JSON.stringify(thought)}
Interactive Elements: ${JSON.stringify(context.interactiveElements?.map(e => ({ id: e.id, tag: e.tag, text: e.text, label: e.label, role: e.role, type: e.type, placeholder: e.placeholder, options: e.options })) || [])}` }] }],
            config: { responseMimeType: "application/json" }
          });
          responseText = result.text;
        } catch (geminiError) {
          if (geminiError.message.includes('API key not valid')) {
            console.error('[ReActLoop] CRITICAL ERROR: The Gemini API Key provided is invalid. Please check your AI Studio Secrets.');
          } else {
            console.error('[ReActLoop] Gemini planning error:', geminiError.message);
          }
          throw geminiError;
        }
      }

      const planning = this.safeJsonParse(responseText);
      console.log('[ReActLoop] AI Planning Result:', JSON.stringify(planning, null, 2));
      
      // Fallback for different field names and structures
      let nextAction = planning.nextAction || planning.action || planning.plannedAction;
      
      // If nextAction is a string, it might be the type directly
      if (typeof nextAction === 'string') {
        nextAction = { type: nextAction, params: planning.params || {} };
      }

      // Ensure nextAction has a type
      if (nextAction && !nextAction.type && planning.type) {
        nextAction.type = planning.type;
        nextAction.params = nextAction.params || planning.params || {};
      }

      return {
        success: !!(nextAction && nextAction.type),
        nextAction: nextAction,
        reasoning: planning.reasoning,
        confidence: planning.confidence || 0.5,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[ReActLoop] Planning error:', error.message);
      return this.planLocally(thought, context);
    }
  }

  /**
   * Local planning without AI
   */
  planLocally(thought, context) {
    return {
      success: true,
      nextAction: {
        type: 'extract',
        params: {}
      },
      reasoning: 'Extract page content to analyze',
      confidence: 0.3,
      timestamp: new Date()
    };
  }

  /**
   * ACT: Execute the planned action
   */
  async act(action, browser) {
    console.log('[ReActLoop] ACT: Executing action:', action.type);
    
    try {
      const result = await this.executor.executeAction(action, browser, this.taskContext);

      // Handle message actions specifically if they emit events
      if (action.type === 'message') {
        this.emit('message', { 
          type: action.params?.type || 'info', 
          content: action.params?.content, 
          data: action.params?.data, 
          timestamp: new Date() 
        });
      }

      return {
        success: result.success,
        action: action.type,
        result: result,
        timestamp: new Date()
      };
    } catch (error) {
      return { success: false, error: error.message, action: action.type };
    }
  }

  /**
   * VERIFY: Verify action was successful
   */
  async verify(action, previousObservation, browser) {
    console.log('[ReActLoop] VERIFY: Verifying action...');
    
    try {
      // Take new observation
      const newObservation = await this.observe(browser);
      if (!newObservation.success) {
        return { success: false, error: newObservation.error };
      }

      // Compare states or use AI to verify
      // For now, simple success check
      return {
        success: true,
        observation: newObservation,
        timestamp: new Date()
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ReActLoop;
