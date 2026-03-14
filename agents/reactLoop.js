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

        // Try to find the first '{' and last '}'
        const firstBrace = cleanedText.indexOf('{');
        const lastBrace = cleanedText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const potentialJson = cleanedText.substring(firstBrace, lastBrace + 1);
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
            message: retryCount > 0 
              ? `${actionMessage} (${isArabic ? 'المحاولة' : 'Attempt'} ${retryCount + 1})` 
              : actionMessage
          });
          action = await this.act(plan.nextAction, browser, this.executor);
          this.lastAction = action;

          if (action.success) {
            actionSuccess = true;
            await this.memory.recordInteraction({
              type: plan.nextAction.type || 'unknown',
              target: plan.nextAction.params?.selector || 'unknown',
              description: plan.description,
              success: true
            });
          } else {
            retryCount++;
            console.warn(`[ReActLoop] Action attempt ${retryCount} failed: ${action.error}`);
            await this.memory.recordError(action.error || 'ActionFailed', action, { successful: false });
            
            if (retryCount < this.maxRetriesPerAction) {
              console.log(`[ReActLoop] Retrying action... (Attempt ${retryCount + 1})`);
              await new Promise(resolve => setTimeout(resolve, 2000 * retryCount)); // Exponential backoff
            }
          }
        }

        if (!actionSuccess) {
          console.error('[ReActLoop] Action failed after max retries:', action.error);
          this.taskContext.errors.push(action.error);
          
          // Step 4.5: RETHINK - Analyze why it failed and adjust
          this.emit('progress', { 
            step: 'RETHINK', 
            message: isArabic ? 'جاري إعادة التفكير بسبب الفشل...' : 'Rethinking due to failure...' 
          });
          const rethink = await this.rethink(action.error, observation, this.taskContext);
          if (rethink.success) {
            console.log('[ReActLoop] Rethink successful, adjusting plan...');
            this.taskContext.nextSteps = rethink.nextSteps;
            continue;
          }

          // Try error recovery
          const recovery = await this.recoverFromError(action.error, browser);
          if (!recovery.success) {
            console.error('[ReActLoop] Error recovery failed');
            // Instead of breaking, try to replan
            const replan = await this.think({ ...observation, error: action.error }, this.taskContext);
            if (replan.taskComplete) break;
            continue;
          }
          continue;
        }

        // Step 5: VERIFY - Verify the action was successful
        const verifyMessage = isArabic ? 'جاري التحقق من نتيجة الإجراء...' : 'Verifying action result...';
        this.emit('progress', { step: 'VERIFY', message: verifyMessage });
        const verification = await this.verify(action, observation, browser);
        this.lastVerification = verification;

        // Loop detection logic
        const currentActionSignature = JSON.stringify({ type: plan.nextAction.type, params: plan.nextAction.params });
        if (currentActionSignature === this.lastActionSignature) {
          this.actionRepeatCount++;
          console.warn(`[ReActLoop] Action repeated ${this.actionRepeatCount} times: ${plan.nextAction.type}`);
          
          if (this.actionRepeatCount >= 3) {
            console.error('[ReActLoop] Loop detected! Attempting to break the loop...');
            const loopBreakMessage = isArabic ? 'تم اكتشاف تكرار مستمر، جاري محاولة تغيير الاستراتيجية...' : 'Loop detected! Attempting to change strategy...';
            this.emit('progress', { step: 'RECOVERY', message: loopBreakMessage });
            
            // Force a page reload or a different thought process
            await browser.navigate(context.pageUrl || 'https://www.facebook.com');
            this.actionRepeatCount = 0;
            this.lastActionSignature = null;
            continue;
          }
        } else {
          this.actionRepeatCount = 0;
          this.lastActionSignature = currentActionSignature;
        }

        if (!verification.success) {
          console.warn(`[ReActLoop] Verification failed for action "${plan.nextAction.type}": ${verification.reason}`);
          const failReason = isArabic ? `فشل التحقق: ${verification.reason}` : `Verification failed: ${verification.reason}`;
          this.taskContext.errors.push(failReason);
          
          // Retry the action
          if (this.currentIteration < this.maxIterations - 1) {
            console.log('[ReActLoop] Retrying action...');
            continue;
          }
        } else {
          console.log('[ReActLoop] Action verified successfully');
          this.taskContext.results.push({
            iteration: this.currentIteration,
            action: plan.nextAction,
            result: action.result,
            verified: true
          });
        }

        // Record successful iteration
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
        console.error('[ReActLoop] Iteration error:', error.message);
        this.taskContext.errors.push(error.message);
        
        if (this.currentIteration >= this.maxIterations) {
          console.error('[ReActLoop] Max iterations reached');
          break;
        }
      }
    }

    const finalReport = this.generateFinalReport();
    
    // Step 6: REFLECT - Self-improvement phase
    try {
      await this.selfImprovement.reflectOnTask({
        taskId: this.taskContext.taskId,
        description: this.taskContext.description,
        status: finalReport.status,
        executionHistory: this.executionHistory,
        errors: this.taskContext.errors
      });
    } catch (reflectError) {
      console.error('[ReActLoop] Reflection failed:', reflectError.message);
    }

    return finalReport;
  }

  /**
   * OBSERVE: Take screenshot and analyze page state
   */
  async observe(browser) {
    console.log('[ReActLoop] OBSERVE: Analyzing current page state...');
    
    try {
      // Get screenshot
      const screenshot = await browser.screenshot('/tmp/current_state.png');
      if (!screenshot.success) {
        console.error('[ReActLoop] Screenshot failed:', screenshot.error);
        return { success: false, error: screenshot.error || 'فشل التقاط لقطة الشاشة' };
      }

      // Extract page content
      const content = await browser.extractContent();
      if (!content.success) {
        return { success: false, error: 'Failed to extract content' };
      }

      // Extract interactive elements (Page Abstraction)
      const interactiveElements = await browser.getInteractiveElements();

      // Extract accessibility tree (More token-efficient)
      const accessibilityTree = await browser.getAccessibilityTree();

      // Analyze with AI if available
      let analysis = null;
      if (config.deepseekApiKey || this.genAI) {
        analysis = await this.analyzeScreenshot(content.content, interactiveElements.elements);
      }

      return {
        success: true,
        screenshot: screenshot.filePath,
        pageContent: content.content,
        interactiveElements: interactiveElements.elements || [],
        accessibilityTree: accessibilityTree.tree || '',
        analysis: analysis,
        timestamp: new Date()
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * THINK: Analyze observation and generate thoughts
   */
  async think(observation, context) {
    console.log('[ReActLoop] THINK: Analyzing situation...');
    
    if (!config.deepseekApiKey && !this.genAI) {
      return this.thinkLocally(observation, context);
    }

    try {
      const isArabic = /[\u0600-\u06FF]/.test(context.task.description);
      const languageInstruction = isArabic 
        ? "IMPORTANT: You must think and reason in Arabic. Keep all descriptions VERY CONCISE. However, the JSON KEYS must remain in English (currentState, progress, obstacles, taskComplete, nextSteps, confidence). Only the values should be in Arabic."
        : "You must respond in English.";

      const systemPrompt = `You are an autonomous AI agent. Analyze the page and determine the next action.
${languageInstruction}
Return a JSON object: { "currentState": "brief desc", "progress": "brief desc", "obstacles": "any errors?", "taskComplete": boolean, "nextSteps": "what to do next", "confidence": 0-1 }.
Be EXTREMELY CONCISE. Save tokens.`;

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
          response_format: { type: 'json_object' },
          temperature: 0.5,
          max_tokens: 800
        }, {
          headers: {
            'Authorization': `Bearer ${config.deepseekApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        });
        responseText = response.data.choices[0].message.content;
      } else {
        // Retry logic for Gemini
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            const result = await this.genAI.models.generateContent({
              model: 'gemini-3-flash-preview',
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
Return as JSON with: nextAction (object with 'type' and 'params'), reasoning, confidence`;

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
          response_format: { type: 'json_object' },
          temperature: 0.4,
          max_tokens: 500
        }, {
          headers: {
            'Authorization': `Bearer ${config.deepseekApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        responseText = response.data.choices[0].message.content;
      } else {
        try {
          const result = await this.genAI.models.generateContent({
            model: 'gemini-3-flash-preview',
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
        return { success: false, reason: 'Could not verify - observation failed' };
      }

      // Check for new errors in the analysis
      if (newObservation.analysis && newObservation.analysis.errors) {
        const errors = Array.isArray(newObservation.analysis.errors) 
          ? newObservation.analysis.errors 
          : [String(newObservation.analysis.errors)];
          
        if (errors.length > 0 && errors[0] !== 'null' && errors[0] !== 'undefined') {
          console.warn(`[ReActLoop] VERIFY: New errors detected after action: ${JSON.stringify(errors)}`);
          return { 
            success: false, 
            reason: `Errors detected: ${errors.join(', ')}`,
            errors: errors
          };
        }
      }

      // Special verification for 'type' action
      if (action.action === 'type') {
        const selector = action.result?.result?.selector || (action.params?.elementId ? `[data-agent-id="${action.params.elementId}"]` : null);
        if (selector) {
          const page = browser.pages.get('default')?.page;
          const value = await page.inputValue(selector).catch(() => null);
          if (value === action.params?.text) {
            return { success: true, reason: 'Input value verified' };
          }
        }
      }

      // Compare with previous observation
      const changed = this.compareObservations(previousObservation, newObservation);

      if (!changed && action.action !== 'extract' && action.action !== 'wait') {
        return { success: false, reason: 'No change detected on the page after action' };
      }

      return {
        success: true,
        changed,
        reason: 'Action verified successfully'
      };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  /**
   * Compare two observations to detect changes
   */
  compareObservations(obs1, obs2) {
    if (!obs1 || !obs2) return true;
    
    const content1 = obs1.pageContent?.text || '';
    const content2 = obs2.pageContent?.text || '';
    
    return content1 !== content2;
  }

  /**
   * RETHINK: Analyze failure and adjust strategy
   */
  async rethink(error, observation, context) {
    console.log('[ReActLoop] RETHINK: Analyzing failure...');
    if (!config.deepseekApiKey && !this.genAI) return { success: false };

    try {
      const isArabic = /[\u0600-\u06FF]/.test(context.task.description);
      const systemPrompt = `You are an AI agent in a "Rethink" phase. An action just failed.
Analyze the error and the current page state to determine why it failed and how to recover.
Error: ${error}
Task: ${context.task.description}

Return a JSON object: { "reason": "why it failed", "nextSteps": "new strategy", "success": true }.`;

      let responseText;
      if (config.deepseekApiKey) {
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Current URL: ${context.pageUrl}\nAccessibility Tree: ${context.accessibilityTree}` }
          ],
          response_format: { type: 'json_object' }
        }, {
          headers: { 'Authorization': `Bearer ${config.deepseekApiKey}` }
        });
        responseText = response.data.choices[0].message.content;
      } else {
        const result = await this.genAI.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nURL: ${context.pageUrl}\nTree: ${context.accessibilityTree}` }] }],
          config: { responseMimeType: "application/json" }
        });
        responseText = result.text;
      }

      return this.safeJsonParse(responseText);
    } catch (e) {
      console.error('[ReActLoop] Rethink failed:', e.message);
      return { success: false };
    }
  }

  /**
   * Recover from errors
   */
  async recoverFromError(error, browser) {
    console.log('[ReActLoop] Attempting error recovery for:', error);
    const isArabic = /[\u0600-\u06FF]/.test(this.taskContext.task.description);
    
    try {
      // Common recovery strategies
      if (error.includes('timeout') || error.includes('Screenshot failed')) {
        console.log('[ReActLoop] Timeout or Screenshot error detected, re-initializing browser...');
        await browser.initialize(browser.io);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return { success: true };
      }

      if (error.includes('not found') || error.includes('selector') || error.includes('visible')) {
        console.log('[ReActLoop] Element not found or not visible, scrolling and retrying...');
        const page = browser.pages.get('default')?.page;
        if (page && !page.isClosed()) {
          await page.evaluate(() => window.scrollBy(0, 500));
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          await browser.openPage('default');
        }
        return { success: true };
      }

      // Default recovery: reload page or reopen if closed
      console.log('[ReActLoop] Default recovery: Reloading/Reopening page...');
      let page = browser.pages.get('default')?.page;
      if (!page || page.isClosed()) {
        await browser.openPage('default');
      } else {
        await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      return { success: true };
    } catch (recoveryError) {
      console.error('[ReActLoop] Recovery failed:', recoveryError.message);
      return { success: false, error: recoveryError.message };
    }
  }

  /**
   * Analyze screenshot with AI
   */
  async analyzeScreenshot(pageContent, interactiveElements = [], screenshotPath = '/tmp/current_state.png') {
    if (!config.deepseekApiKey && !this.genAI) return null;
    if (!pageContent) return { pageState: 'unknown', visibleElements: [], errors: ['No page content available'], formStatus: 'unknown' };

    try {
      const elementsSummary = interactiveElements.map(el => 
        `[${el.id}] ${el.tag}${el.type ? ':'+el.type : ''} - "${el.text}"`
      ).join('\n');

      const systemPrompt = `Analyze the webpage content and screenshot to identify:
1. Main elements visible
2. Interactive elements (buttons, forms, links) - refer to them by their [ID] if provided
3. Current page state
4. Any error messages, alerts, or validation warnings (e.g., "invalid email", "field required", red borders/text)
5. If a form was just submitted, did it succeed or stay on the same page with errors?

Return as JSON with fields: pageState, visibleElements, errors, formStatus.`;

      const pageTitle = pageContent.title || 'Unknown Title';
      const pageText = pageContent.text?.substring(0, 1500) || 'No text content';

      let responseText;
      if (config.deepseekApiKey) {
        // DeepSeek is text-only, so we only send text
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
              model: 'deepseek-chat',
              messages: [
                { role: 'system', content: systemPrompt },
                { 
                  role: 'user', 
                  content: `Page title: ${pageTitle}\n\nInteractive Elements:\n${elementsSummary}\n\nPage text: ${pageText}` 
                }
              ],
              response_format: { type: 'json_object' },
              temperature: 0.3,
              max_tokens: 500
            }, {
              headers: {
                'Authorization': `Bearer ${config.deepseekApiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 60000 // Increased timeout to 60s
            });
            responseText = response.data.choices[0].message.content;
            break;
          } catch (err) {
            if (err.message.includes('aborted') || err.message.includes('timeout')) {
              retryCount++;
              if (retryCount <= maxRetries) {
                console.warn(`[ReActLoop] DeepSeek analysis timeout, retrying (${retryCount}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
              }
            }
            throw err;
          }
        }
      } else {
        // Gemini supports vision
        let screenshotData = null;
        try {
          if (fs.existsSync(screenshotPath)) {
            screenshotData = fs.readFileSync(screenshotPath).toString('base64');
          }
        } catch (e) {
          console.warn('[ReActLoop] Could not read screenshot for analysis:', e.message);
        }

        const parts = [
          { text: `${systemPrompt}\n\nPage title: ${pageTitle}\n\nInteractive Elements:\n${elementsSummary}\n\nPage text: ${pageText}` }
        ];

        if (screenshotData) {
          parts.push({
            inlineData: {
              mimeType: 'image/png',
              data: screenshotData
            }
          });
        }

        // Retry logic for Gemini if it fails with 'aborted'
        let retryCount = 0;
        const maxRetries = 2;
        
        while (retryCount <= maxRetries) {
          try {
            const result = await this.genAI.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [{ role: 'user', parts }],
              config: { responseMimeType: "application/json" }
            });
            responseText = result.text;
            break; // Success, exit retry loop
          } catch (geminiError) {
            if (geminiError.message.includes('API key not valid')) {
              console.error('[ReActLoop] CRITICAL ERROR: The Gemini API Key provided is invalid. Please check your AI Studio Secrets.');
              throw geminiError;
            }
            if (geminiError.message.includes('aborted') && retryCount < maxRetries) {
              retryCount++;
              console.warn(`[ReActLoop] Gemini analysis aborted, retrying (${retryCount}/${maxRetries})...`);
              await new Promise(resolve => setTimeout(resolve, 2000));
              continue;
            }
            throw geminiError; // Rethrow if not aborted or max retries reached
          }
        }
      }

      return this.safeJsonParse(responseText);
    } catch (error) {
      if (error.message.includes('API key not valid')) {
        console.error('[ReActLoop] CRITICAL ERROR: The Gemini API Key provided is invalid. Please check your AI Studio Secrets.');
      } else {
        console.error('[ReActLoop] Screenshot analysis failed:', error.message);
      }
      return null;
    }
  }

  /**
   * Generate final report
   */
  generateFinalReport() {
    const duration = Date.now() - this.taskContext.startTime;
    
    return {
      success: this.taskContext.completed || false,
      iterations: this.currentIteration,
      maxIterations: this.maxIterations,
      duration: duration,
      errors: this.taskContext.errors,
      results: this.taskContext.results,
      executionHistory: this.executionHistory.map(h => ({
        iteration: h.iteration,
        action: h.action?.type,
        verified: h.verification?.success,
        timestamp: h.timestamp
      })),
      finalObservation: this.lastObservation,
      finalThought: this.lastThought,
      timestamp: new Date()
    };
  }

  /**
   * Get execution history
   */
  getExecutionHistory(limit = 50) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * Reset loop state
   */
  reset() {
    this.currentIteration = 0;
    this.executionHistory = [];
    this.taskContext = null;
    this.lastObservation = null;
    this.lastThought = null;
    this.lastPlan = null;
    this.lastAction = null;
    this.lastVerification = null;
  }
}

module.exports = ReActLoop;
