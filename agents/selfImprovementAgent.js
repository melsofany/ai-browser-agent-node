const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');

class SelfImprovementAgent {
  constructor(memorySystem) {
    this.memory = memorySystem;
    this.deepseekApiKey = config.deepseekApiKey;
  }

  /**
   * Reflect on a completed task to learn from it
   */
  async reflectOnTask(taskResult) {
    console.log('[SelfImprovementAgent] Reflecting on task:', taskResult.taskId);
    
    const isSuccess = taskResult.status === 'completed';
    const taskDescription = taskResult.description;
    const executionHistory = taskResult.executionHistory || [];
    const errors = taskResult.errors || [];

    if (!this.deepseekApiKey) {
      console.warn('[SelfImprovementAgent] DeepSeek API key not configured, skipping deep reflection');
      return;
    }

    const systemPrompt = `You are a Self-Improvement AI Agent. Your goal is to analyze the performance of another AI agent and suggest improvements.
Analyze the task execution history and identify:
1. What went well?
2. What were the main obstacles?
3. If it failed, why?
4. What specific code or logic changes could prevent this failure in the future?
5. What new patterns or "lessons" should the agent learn?

Return your analysis in a structured format.`;

    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Task: ${taskDescription}
Status: ${taskResult.status}
Errors: ${JSON.stringify(errors)}
Execution History Summary: ${JSON.stringify(executionHistory.map(h => ({ 
              iteration: h.iteration, 
              action: h.action?.type, 
              success: h.action?.success,
              verification: h.verification?.success
            })))}` 
          }
        ],
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${this.deepseekApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const reflection = response.data.choices[0].message.content;
      console.log('[SelfImprovementAgent] Reflection result:', reflection);

      // Store the lesson in memory
      await this.memory.learnPattern(`Lesson_${taskResult.taskId}`, {
        taskId: taskResult.taskId,
        reflection,
        isSuccess,
        timestamp: new Date()
      });

      // If there are specific code improvement suggestions, we could potentially flag them
      if (reflection.toLowerCase().includes('suggested fix') || reflection.toLowerCase().includes('improvement')) {
        await this.memory.recordError('LogicImprovementNeeded', reflection, { 
          successful: true, 
          suggestion: reflection 
        });
      }

      return reflection;
    } catch (error) {
      console.error('[SelfImprovementAgent] Reflection error:', error.message);
      return null;
    }
  }

  /**
   * Propose a self-development task based on accumulated knowledge
   */
  async proposeSelfDevelopment() {
    console.log('[SelfImprovementAgent] Analyzing memory for self-development opportunities...');
    
    const stats = await this.memory.getStatistics();
    const errorPatterns = await this.memory.getErrorPatterns(10);
    
    if (errorPatterns.length === 0) {
      return "No clear improvement patterns identified yet. Continue normal operations.";
    }

    const systemPrompt = `You are a Self-Development AI Agent. Analyze the agent's error history and statistics.
Suggest a specific development task to improve the agent's capabilities or fix recurring issues.
The task should be something the agent can perform on its own codebase.

Return a JSON object with:
- title: Short title of the task
- description: Detailed description of what to do
- rationale: Why this is important
- priority: high/normal/low`;

    try {
      const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { 
            role: 'user', 
            content: `Statistics: ${JSON.stringify(stats)}
Recent Error Patterns: ${JSON.stringify(errorPatterns)}` 
          }
        ],
        response_format: { type: 'json_object' }
      }, {
        headers: {
          'Authorization': `Bearer ${this.deepseekApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      const proposal = JSON.parse(response.data.choices[0].message.content);
      console.log('[SelfImprovementAgent] Self-development proposal:', proposal);
      return proposal;
    } catch (error) {
      console.error('[SelfImprovementAgent] Proposal error:', error.message);
      return null;
    }
  }

  /**
   * Apply a self-improvement fix to the codebase
   * This is a powerful feature - use with caution!
   */
  async applySelfFix(fixDescription) {
    console.log('[SelfImprovementAgent] Attempting to apply self-fix:', fixDescription);
    // This would involve reading the relevant file, using AI to generate a patch, and writing it back.
    // For now, we'll just log it as a planned improvement.
    return { success: true, message: "Self-fix logged. In a full implementation, this would apply code changes." };
  }
}

module.exports = SelfImprovementAgent;
