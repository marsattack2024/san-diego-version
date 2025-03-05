import { BaseAgent } from '../core/agent-base';
import { AgentContext, AgentType } from '../core/agent-types';
import { COPYWRITING_SYSTEM_PROMPT } from '../prompts/copywriting-prompts';
import { dateTimeTool } from '../core/agent-tools';
import { createAgentLogger } from '../core/agent-logger';

/**
 * Copywriting specialist agent
 */
export class CopywritingAgent extends BaseAgent {
  id: AgentType = 'copywriting';
  name = 'Copywriting Specialist';
  description = 'Expert in creating compelling marketing copy and content';
  capabilities = [
    'Create persuasive marketing copy',
    'Generate attention-grabbing headlines',
    'Develop brand voice and messaging',
    'Optimize copy for different channels',
    'Improve existing content'
  ];
  icon = 'pencil';
  systemPrompt = COPYWRITING_SYSTEM_PROMPT;
  tools = [dateTimeTool]; // Will add more specialized tools later
  
  private logger = createAgentLogger(this.id);
  
  constructor() {
    super();
    this.logger.info('Copywriting agent initialized');
  }
  
  /**
   * Override formatPrompt to add agent-specific formatting
   */
  protected formatPrompt(context: AgentContext): string {
    const basePrompt = super.formatPrompt(context);
    return `${basePrompt}\n\nRemember to focus on clarity, persuasion, and the specific goals of the copy.`;
  }
} 