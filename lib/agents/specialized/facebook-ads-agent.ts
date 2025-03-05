import { BaseAgent } from '../core/agent-base';
import { AgentContext, AgentType } from '../core/agent-types';
import { FACEBOOK_ADS_SYSTEM_PROMPT } from '../prompts/facebook-ads-prompts';
import { dateTimeTool } from '../core/agent-tools';
import { createAgentLogger } from '../core/agent-logger';

/**
 * Facebook Ads specialist agent
 */
export class FacebookAdsAgent extends BaseAgent {
  id: AgentType = 'facebook-ads';
  name = 'Facebook Ads Specialist';
  description = 'Expert in Facebook and Instagram advertising strategies';
  capabilities = [
    'Create Facebook and Instagram ad campaigns',
    'Develop audience targeting strategies',
    'Optimize ad creative and copy',
    'Analyze campaign performance',
    'Provide budget allocation recommendations'
  ];
  icon = 'facebook';
  systemPrompt = FACEBOOK_ADS_SYSTEM_PROMPT;
  tools = [dateTimeTool]; // Will add more specialized tools later
  
  private logger = createAgentLogger(this.id);
  
  constructor() {
    super();
    this.logger.info('Facebook Ads agent initialized');
  }
  
  /**
   * Override formatPrompt to add agent-specific formatting
   */
  protected formatPrompt(context: AgentContext): string {
    const basePrompt = super.formatPrompt(context);
    return `${basePrompt}\n\nRemember to focus on engagement metrics and conversion optimization for social media platforms.`;
  }
} 