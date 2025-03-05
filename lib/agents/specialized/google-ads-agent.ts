import { BaseAgent } from '../core/agent-base';
import { AgentContext, AgentType } from '../core/agent-types';
import { GOOGLE_ADS_SYSTEM_PROMPT } from '../prompts/google-ads-prompts';
import { dateTimeTool } from '../core/agent-tools';
import { createAgentLogger } from '../core/agent-logger';

/**
 * Google Ads specialist agent
 */
export class GoogleAdsAgent extends BaseAgent {
  id: AgentType = 'google-ads';
  name = 'Google Ads Specialist';
  description = 'Expert in Google Ads campaign creation and optimization';
  capabilities = [
    'Create Google Ads campaigns',
    'Optimize ad performance',
    'Analyze keywords and competition',
    'Generate effective ad copy',
    'Provide budget recommendations'
  ];
  icon = 'google';
  systemPrompt = GOOGLE_ADS_SYSTEM_PROMPT;
  tools = [dateTimeTool]; // Will add more specialized tools later
  
  private logger = createAgentLogger(this.id);
  
  constructor() {
    super();
    this.logger.info('Google Ads agent initialized');
  }
  
  /**
   * Override formatPrompt to add agent-specific formatting
   */
  protected formatPrompt(context: AgentContext): string {
    const basePrompt = super.formatPrompt(context);
    return `${basePrompt}\n\nRemember to follow Google Ads best practices and focus on ROI-driven strategies.`;
  }
} 