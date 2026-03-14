/**
 * Scheduling Tools Plugin
 * Provides task scheduling and delayed execution
 */

module.exports = {
  name: 'scheduling',
  description: 'Tools for scheduling tasks and delayed execution',
  
  tools: [
    {
      name: 'schedule_task',
      description: 'Schedule a task to run after a delay',
      params: {
        delayMs: { type: 'number', description: 'Delay in milliseconds' },
        taskDescription: { type: 'string', description: 'Description of the task to run' }
      },
      execute: async ({ delayMs, taskDescription }) => {
        console.log(`[SchedulingTools] Task scheduled in ${delayMs}ms: ${taskDescription}`);
        
        // In a real system, this would be handled by a persistent scheduler
        // For now, we simulate the scheduling
        setTimeout(() => {
          console.log(`[SchedulingTools] EXECUTING SCHEDULED TASK: ${taskDescription}`);
          // Here we would ideally trigger the agent loop again
        }, delayMs);
        
        return { 
          success: true, 
          message: `Task scheduled successfully`,
          scheduledTime: new Date(Date.now() + delayMs).toISOString(),
          task: taskDescription
        };
      }
    }
  ]
};
