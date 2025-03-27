import { BaseAgent } from '../core/agent-base';
import { AgentType, AgentContext, AgentTool } from '../core/agent-types';
import { BASE_PROMPT } from '../prompts/base-prompt';
import { echoTool, dateTimeTool } from '../core/agent-tools';
import { webScraperTool } from '../tools';
import { createAgentLogger } from '../core/agent-logger';

/**
 * Default general-purpose agent
 */
export class DefaultAgent extends BaseAgent {
  id = 'default' as AgentType;
  name = 'Default Assistant';
  description = 'General-purpose AI assistant for text-based tasks';
  capabilities = ['General questions', 'Writing', 'Information processing'];
  icon = 'sparkles';
  systemPrompt = `You are an AI assistant designed to be helpful, harmless, and honest. 
Respond in a conversational, helpful manner.`;

  tools = [
    echoTool,
    dateTimeTool,
    webScraperTool
  ] as AgentTool[];

  private logger = createAgentLogger(this.id, {});

  constructor() {
    super();
    this.logger.info('Default agent initialized');
  }

  /**
   * Override formatPrompt to add agent-specific formatting if needed
   */
  protected formatPrompt(context: AgentContext): string {
    const basePrompt = super.formatPrompt(context);

    // Add a hint about specialized agents if appropriate
    const enhancedPrompt = `${basePrompt}

If you think another specialized agent would be better suited to help with this request, please let me know. I can connect you with:
- Google Ads Agent for advertising on Google
- Facebook Ads Agent for social media advertising
- Copywriting Agent for marketing content
- Quiz Agent for creating interactive quizzes

Please format content and responses properly with line breaks and headings. Lists should never be output as paragraphs.

I can help you analyze web content and perform searches. If you provide a URL, I'll automatically scrape it. If you need up-to-date information, I can search our internal knowledge base for relevant information when appropriate. For complex topics requiring deep research, enable the DeepSearch toggle in the UI.`;

    return enhancedPrompt;
  }
} 